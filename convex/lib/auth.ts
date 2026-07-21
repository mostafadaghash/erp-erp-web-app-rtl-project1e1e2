/**
 * Centralized auth & authorization helpers.
 * ALL backend modules MUST use these decorators — never call ctx.auth.getUserIdentity directly.
 */
import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { PERMISSIONS, ROLE_PERMISSIONS, Permission } from "./permissions";

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
  permissions: Permission[];
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
  const storedPermissions = employee.permissions ?? [];
  const hasLegacyPermission = storedPermissions.some(
    (permission) => !PERMISSIONS.includes(permission as Permission),
  );
  const effectivePermissions =
    employee.role === "admin" || hasLegacyPermission || storedPermissions.length === 0
      ? (ROLE_PERMISSIONS[employee.role] ?? []).filter((permission) =>
          PERMISSIONS.includes(permission as Permission),
        ) as Permission[]
      : storedPermissions.filter((permission) =>
          PERMISSIONS.includes(permission as Permission),
        ) as Permission[];

  return {
    userId: resolved.authUserId,
    employeeId: employee._id,
    name: employee.name,
    role: employee.role,
    branchId: employee.branchId ?? undefined,
    isActive: employee.isActive,
    permissions: effectivePermissions,
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

  if (!user.permissions.includes(permission)) {
    throw new Error(`ليس لديك صلاحية: ${permission}`);
  }
  return user;
}

export function hasPermission(user: AuthUser, permission: Permission): boolean {
  return user.permissions.includes(permission);
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
  if (!user.branchId) return [];
  return items.filter((item) => item.branchId === user.branchId);
}

/** Reject direct-ID access to records outside the employee's branch. */
export function assertBranchAccess(
  user: AuthUser,
  record: { branchId?: Id<"branches"> },
): void {
  if (user.role === "admin") return;
  if (!user.branchId || record.branchId !== user.branchId) {
    throw new ConvexError("ليس لديك صلاحية للوصول إلى بيانات هذا الفرع");
  }
}

/** Ignore a non-admin caller's requested branch and always use their branch. */
export function resolveWriteBranch(
  user: AuthUser,
  requestedBranchId?: Id<"branches">,
): Id<"branches"> | undefined {
  if (user.role === "admin") {
    const branchId = requestedBranchId ?? user.branchId;
    if (!branchId) {
      throw new ConvexError("اختر فرع العمل من الشريط العلوي قبل إضافة البيانات");
    }
    return branchId;
  }
  if (!user.branchId) {
    throw new ConvexError("يجب ربط حسابك بفرع قبل إضافة البيانات");
  }
  return user.branchId;
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
    recordId?: string;
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
    recordId: params.recordId ? String(params.recordId) : undefined,
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

export async function requireModulePermission(
  ctx: QueryCtx | MutationCtx,
  permission: Permission,
  moduleName: string,
): Promise<AuthUser> {
  const user = await requirePermission(ctx, permission);
  await requireModuleEnabled(ctx, moduleName);
  return user;
}

// ──────────────────────────────────────────────
// System setup check — is there at least one active admin?
// ──────────────────────────────────────────────
export async function hasAdmin(ctx: QueryCtx): Promise<boolean> {
  const all = await ctx.db.query("userProfiles").collect();
  return all.some((e) => e.role === "admin" && e.isActive);
}
