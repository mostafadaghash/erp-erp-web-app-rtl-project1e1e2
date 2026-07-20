import { QueryCtx, MutationCtx } from "../_generated/server";
import { ConvexError } from "convex/values";
import { Doc } from "../_generated/dataModel";
import { ROLE_PERMISSIONS } from "../employees";

export type Role = keyof typeof ROLE_PERMISSIONS;

export interface AuthUser {
  userId: string;
  profile: Doc<"userProfiles"> | null;
  role: string;
  branchId?: string;
  name: string;
  permissions: string[];
}

/**
 * Get the authenticated user's profile from the database.
 * Returns null if not authenticated or no profile exists.
 */
export async function getAuthUser(ctx: QueryCtx | MutationCtx): Promise<AuthUser | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const profile = await ctx.db
    .query("userProfiles")
    .withIndex("by_user", (q) => q.eq("userId", identity.subject))
    .first();

  // If no profile yet, user might be a new sign-up
  if (!profile) {
    return {
      userId: identity.subject,
      profile: null,
      role: "viewer",
      name: identity.name ?? identity.email ?? "مستخدم",
      permissions: [],
    };
  }

  // Disabled employees get viewer-level access
  if (!profile.isActive) {
    return {
      userId: identity.subject,
      profile,
      role: "viewer",
      branchId: profile.branchId,
      name: profile.name,
      permissions: [],
    };
  }

  return {
    userId: identity.subject,
    profile,
    role: profile.role,
    branchId: profile.branchId,
    name: profile.name,
    permissions: profile.permissions,
  };
}

/**
 * Require authentication. Throws if not signed in.
 */
export async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<AuthUser> {
  const user = await getAuthUser(ctx);
  if (!user) throw new ConvexError("يجب تسجيل الدخول أولاً");
  return user;
}

/**
 * Require a specific permission. Throws if user lacks it.
 */
export async function requirePermission(
  ctx: QueryCtx | MutationCtx,
  permission: string
): Promise<AuthUser> {
  const user = await requireAuth(ctx);
  if (user.role === "admin") return user; // admin bypasses all checks
  if (!user.permissions.includes(permission)) {
    throw new ConvexError("ليس لديك صلاحية للقيام بهذا الإجراء");
  }
  return user;
}

/**
 * Require admin role specifically.
 */
export async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<AuthUser> {
  const user = await requireAuth(ctx);
  if (user.role !== "admin") {
    throw new ConvexError("هذا الإجراء يتطلب صلاحيات مدير النظام");
  }
  return user;
}

/**
 * Filter records by branch for non-admin users.
 * Admins see all; managers/employees see only their branch.
 */
export function filterByBranch<T extends { branchId?: string }>(
  records: T[],
  user: AuthUser
): T[] {
  if (user.role === "admin") return records;
  if (!user.branchId) return records; // no branch restriction if not assigned
  return records.filter(r => !r.branchId || r.branchId === user.branchId);
}

/**
 * Check if user can access a specific branch's data.
 */
export function canAccessBranch(user: AuthUser, branchId?: string): boolean {
  if (user.role === "admin") return true;
  if (!branchId) return true;
  return user.branchId === branchId;
}

/**
 * Log an action to the audit log with real user info.
 */
export async function logAction(
  ctx: MutationCtx,
  user: AuthUser,
  params: {
    action: string;
    module: string;
    recordId?: string;
    recordLabel?: string;
    details?: string;
  }
) {
  await ctx.db.insert("auditLogs", {
    userId: user.userId,
    userName: user.name,
    action: params.action,
    module: params.module,
    recordId: params.recordId,
    recordLabel: params.recordLabel,
    details: params.details,
    branchId: user.branchId as any,
  });
}
