import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { action, internalMutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { makeFunctionReference } from "convex/server";
import { normalizeEmail } from "./lib/identity";

const passwordProvider = Password({
  profile(params) {
    const email = normalizeEmail(String(params.email ?? ""));
    if (!email) {
      throw new Error("البريد الإلكتروني مطلوب");
    }
    const inviteCode =
      typeof params.inviteCode === "string" && params.inviteCode.trim()
        ? params.inviteCode.trim()
        : undefined;
    const profile: Record<string, string> & { email: string } = { email };
    if (inviteCode) profile.inviteCode = inviteCode;
    return profile;
  },
});

const authExports = convexAuth({
  providers: [passwordProvider],
  signIn: { maxFailedAttempsPerHour: 10 },
  callbacks: {
    /**
     * Create the first auth user during initial setup. Afterwards, new auth
     * users can only be created from a valid, active employee invitation.
     * User creation and invitation claiming happen in the same transaction.
     */
    async createOrUpdateUser(ctx, args) {
      const appCtx = ctx as unknown as MutationCtx;
      const email = normalizeEmail(String(args.profile.email ?? ""));
      if (args.type !== "credentials" || !email) {
        throw new Error("طريقة إنشاء الحساب غير مدعومة");
      }

      if (args.existingUserId !== null) {
        await appCtx.db.patch(args.existingUserId, { email });
        return args.existingUserId;
      }

      const activeAdmin = await appCtx.db
        .query("userProfiles")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .filter((q) => q.eq(q.field("isActive"), true))
        .first();

      if (!activeAdmin) {
        return await appCtx.db.insert("users", { email });
      }

      const rawInviteCode = args.profile.inviteCode;
      const inviteId =
        typeof rawInviteCode === "string"
          ? appCtx.db.normalizeId("userProfiles", rawInviteCode)
          : null;
      const invitation = inviteId ? await appCtx.db.get(inviteId) : null;
      const now = Date.now();

      if (
        !invitation ||
        normalizeEmail(invitation.email ?? "") !== email ||
        invitation.tokenIdentifier ||
        !invitation.isActive ||
        !invitation.inviteExpiresAt ||
        invitation.inviteExpiresAt < now
      ) {
        throw new Error("رابط الدعوة غير صالح أو منتهي");
      }

      const userId = await appCtx.db.insert("users", { email });
      const tokenIdentifier = String(userId);
      await appCtx.db.patch(invitation._id, {
        userId: tokenIdentifier,
        tokenIdentifier,
        claimedAt: now,
        inviteExpiresAt: undefined,
      });
      await appCtx.db.insert("auditLogs", {
        userId: tokenIdentifier,
        userName: invitation.name,
        branchId: invitation.branchId,
        action: "claim_invitation",
        module: "auth",
        recordId: invitation._id,
        recordLabel: invitation.name,
        details: `تفعيل دعوة الموظف: ${invitation.name}`,
      });
      return userId;
    },
  },
});

export const { auth, store, isAuthenticated } = authExports;

const AUTH_AUDIT_VERSION = 1;

function safeFailureHash(input: unknown): string {
  const normalized = normalizeEmail(String(input ?? ""));
  let hash = 2166136261;
  for (const char of normalized) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function authEventKey(actionName: string, principal: string, windowMs = 60_000) {
  return `auth:${AUTH_AUDIT_VERSION}:${actionName}:${principal}:${Math.floor(Date.now() / windowMs)}`;
}

export const recordAuthAuditEvent = internalMutation({
  args: {
    actionName: v.string(),
    dedupeKey: v.string(),
    userId: v.optional(v.string()),
    userName: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    details: v.optional(v.string()),
    failureHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const previous = await ctx.db
      .query("auditLogs")
      .withIndex("by_module_action", (q) =>
        q.eq("module", "auth").eq("action", args.actionName),
      )
      .filter((q) => q.eq(q.field("recordId"), args.dedupeKey))
      .first();
    if (previous) return previous._id;

    await ctx.db.insert("auditLogs", {
      userId: args.userId,
      userName: args.userName ?? "النظام",
      branchId: args.branchId,
      action: args.actionName,
      module: "auth",
      recordId: args.dedupeKey,
      recordLabel: args.failureHash ? "redacted-auth-principal" : args.userName,
      details: args.details ?? "حدث جلسة موثق من الخادم",
      afterSnapshot: args.failureHash
        ? [{ field: "principalHash", value: args.failureHash }]
        : [{ field: "result", value: "success" }],
      changedFields: args.failureHash ? ["principalHash"] : ["result"],
      snapshotVersion: AUTH_AUDIT_VERSION,
      timestamp: Date.now(),
    });
    return null;
  },
});

export const signIn = action({
  args: {
    provider: v.optional(v.string()),
    params: v.optional(v.any()),
    verifier: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    calledBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const result = await ctx.runAction(
        makeFunctionReference<"action", typeof args, { tokens?: unknown | null }>("auth:signInRaw"),
        args,
      );
      if (result.tokens && args.refreshToken === undefined) {
        const identity = await ctx.auth.getUserIdentity();
        const subject = identity?.subject ?? "unknown";
        await ctx.runMutation(internal.auth.recordAuthAuditEvent, {
          actionName: "login_success",
          dedupeKey: authEventKey("login_success", subject),
          userId: subject.split("|")[0],
          userName: identity?.name ?? "مستخدم مصادق",
          details: "نجاح تسجيل الدخول من مزود موثوق دون تسجيل أسرار الجلسة",
        });
      }
      return result;
    } catch (error) {
      const params = args.params && typeof args.params === "object" ? args.params as Record<string, unknown> : {};
      const hash = safeFailureHash(params.email);
      await ctx.runMutation(internal.auth.recordAuthAuditEvent, {
        actionName: "login_failure",
        dedupeKey: authEventKey("login_failure", hash, 300_000),
        failureHash: hash,
        details: "فشل تسجيل دخول منقح؛ لا يحتوي على بريد خام أو كلمة مرور أو رموز",
      });
      throw error;
    }
  },
});

export const signInRaw = authExports.signIn;

export const signOut = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity) {
      const subject = identity.subject;
      await ctx.runMutation(internal.auth.recordAuthAuditEvent, {
        actionName: "logout",
        dedupeKey: authEventKey("logout", subject),
        userId: subject.split("|")[0],
        userName: identity.name ?? "مستخدم مصادق",
        details: "تسجيل خروج موثق من الخادم قبل إبطال الجلسة دون تسجيل Tokens",
      });
    }
    return await ctx.runAction(
      makeFunctionReference<"action", Record<string, never>, void>("auth:signOutRaw"),
      {},
    );
  },
});

export const signOutRaw = authExports.signOut;

export const loggedInUser = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }
    return user;
  },
});
