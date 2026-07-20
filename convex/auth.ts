import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { query, type MutationCtx } from "./_generated/server";
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
    return { email, inviteCode } as any;
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [passwordProvider],
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
