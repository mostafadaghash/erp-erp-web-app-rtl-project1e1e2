/**
 * Centralized auth & authorization helpers.
 * ALL backend modules MUST use these decorators — never call ctx.auth.getUserIdentity directly.
 */
import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ROLE_PERMISSIONS, Permission } from "./permissions";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
export interface AuthUser {
  userId: string;
  employeeId: Id<"userProfiles">;
  name: string;
  role: string;
  branchId?: Id<"branches">;
  isActive: boolean;
}

// ──────────────────────────────────────────────
// Core: resolve the authenticated employee from userProfiles
// ──────────────────────────────────────────────
export async function getAuthProfile(ctx: QueryCtx | MutationCtx) {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) return null;
  const stableUserId = String(authUserId);

  let profile = await ctx.db
    .query("userProfiles")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", stableUserId))
    .unique();

  if (!profile) {
    // Backward compatibility for profiles created with the old
    // session-scoped identity.subject value.
    const legacyPrefix = `${stableUserId}|`;
    const allProfiles = await ctx.db.query("userProfiles").collect();
    profile =
      allProfiles.find(
        (candidate) =>
          candidate.userId === stableUserId ||
          candidate.userId.startsWith(legacyPrefix) ||
          candidate.tokenIdentifier?.startsWith(legacyPrefix),
      ) ?? null;
  }

  return { authUserId: stableUserId, profile };
}

export async function getAuthUser(
  ctx: QueryCtx | MutationCtx
): Promise<AuthUser | null> {
  const resolved = await getAuthProfile(ctx);
  if (!resolved?.profile) return null;
  const employee = resolved.profile;

  return {
    userId: resolved.authUserId,
    employeeId: employee._id,
    name: employee.name,
    role: employee.role,
    branchId: employee.branchId ?? undefined,
    isActive: employee.isActive,
  };
}

// ──────────────────────────────────────────────
// requireAuth — throws if not signed in
// ──────────────────────────────────────────────
export async function requireAuth(
  ctx: QueryCtx | MutationCtx
): Promise<AuthUser> {
  const user = await getAuthUser(ctx);
  if (!user) {
    throw new ConvexError("الحساب غير مربوط بموظف مصرح له");
  }
  if (!user.isActive) {
    throw new ConvexError("تم تعطيل هذا الحساب. تواصل مع مدير النظام");
  }
  return user;
}

// ──────────────────────────────────────────────
// requirePermission — throws if an active user lacks permission
// ──────────────────────────────────────────────
export async function requirePermission(
  ctx: QueryCtx | MutationCtx,
  permission: Permission
): Promise<AuthUser> {
  const user = await requireAuth(ctx);

  const allowed = ROLE_PERMISSIONS[user.role] ?? [];
  if (!allowed.includes(permission)) {
    throw new Error(`ليس لديك صلاحية: ${permission}`);
  }
  return user;
}

// ──────────────────────────────────────────────
// requireAdmin — throws if user is not an active admin
// ──────────────────────────────────────────────
export async function requireAdmin(
  ctx: QueryCtx | MutationCtx
): Promise<AuthUser> {
  const user = await requireAuth(ctx);
  if (user.role !== "admin") {
    throw new Error("هذه العملية تتطلب صلاحيات مدير النظام");
  }
  return user;
}

// ──────────────────────────────────────────────
// filterByBranch — filter array results by user's branch (non-admins only)
// ──────────────────────────────────────────────
export function filterByBranch<T extends { branchId?: Id<"branches"> }>(
  items: T[],
  user: AuthUser
): T[] {
  if (user.role === "admin") return items;
  if (!user.branchId) return items;
  return items.filter(
    (item) => !item.branchId || item.branchId === user.branchId
  );
}

// ──────────────────────────────────────────────
// logAction — centralized audit logging
// Matches the call signature used by all modules:
//   logAction(ctx, user, { action, module, recordId, recordLabel, details })
// ──────────────────────────────────────────────
export async function logAction(
  ctx: MutationCtx,
  user: AuthUser,
  params: {
    action: string;
    module: string;
    recordId?: Id<any>;
    recordLabel?: string;
    details?: string;
  }
) {
  await ctx.db.insert("auditLogs", {
    userId: user.userId,
    userName: user.name,
    branchId: user.branchId,
    action: params.action,
    module: params.module,
    recordId: params.recordId ? (params.recordId as any) : undefined,
    recordLabel: params.recordLabel,
    details: params.details ?? "",
  });
}

// ──────────────────────────────────────────────
// requireModuleEnabled — checks if a module is enabled in settings
// ──────────────────────────────────────────────
export async function requireModuleEnabled(
  ctx: QueryCtx | MutationCtx,
  moduleName: string
): Promise<void> {
  const settings = await ctx.db.query("settings").first();
  if (settings?.modules) {
    const enabled = (settings.modules as Record<string, boolean>)[moduleName];
    if (enabled === false) {
      throw new Error(`وحدة "${moduleName}" معطلة في النظام`);
    }
  }
}

// ──────────────────────────────────────────────
// System setup check — is there at least one active admin?
// ──────────────────────────────────────────────
export async function hasAdmin(ctx: QueryCtx): Promise<boolean> {
  const all = await ctx.db.query("userProfiles").collect();
  return all.some((e) => e.role === "admin" && e.isActive);
}
