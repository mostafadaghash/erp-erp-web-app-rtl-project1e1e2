import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { assertBranchAccess, filterByBranch, requireAuth, requireModulePermission, resolveWriteBranch, logAction, hasAdmin, getAuthProfile } from "./lib/auth";
import { ROLES, ROLE_PERMISSIONS, isPermission } from "./lib/permissions";
import { INVITE_TTL_MS, isValidEmail, normalizeEmail } from "./lib/identity";

// Re-export for frontend convenience
export { ROLES, ROLE_PERMISSIONS };

// ──────────────────────────────────────────────
// PUBLIC: System setup status — no auth required
// Frontend uses this to decide: show setup wizard or login form
// ──────────────────────────────────────────────
export const setupStatus = query({
  args: {},
  handler: async (ctx) => {
    const adminExists = await hasAdmin(ctx);
    return { needsSetup: !adminExists };
  },
});

// ──────────────────────────────────────────────
// PUBLIC: Create first admin — only works when no admin exists
// Called from the setup wizard before any auth
// ──────────────────────────────────────────────
export const createFirstAdmin = mutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Block if an admin already exists — prevents hijacking
    const adminExists = await hasAdmin(ctx);
    if (adminExists) {
      throw new ConvexError("النظام تم إعداده بالفعل. يرجى تسجيل الدخول.");
    }

    // Resolve the stable Convex Auth user ID.
    const identity = await ctx.auth.getUserIdentity();
    const resolved = await getAuthProfile(ctx);
    if (!identity || !resolved) {
      throw new ConvexError("يجب تسجيل الدخول أولاً قبل إعداد النظام");
    }
    const stableUserId = resolved.authUserId;

    const existing = resolved.profile;

    if (existing) {
      // Upgrade existing profile to admin
      await ctx.db.patch(existing._id, {
        role: "admin",
        name: args.name,
        phone: args.phone,
        permissions: [...ROLE_PERMISSIONS.admin],
        isActive: true,
        userId: stableUserId,
        tokenIdentifier: stableUserId,
      });
      return existing._id;
    }

    // Create new admin profile
    const id = await ctx.db.insert("userProfiles", {
      userId: stableUserId,
      tokenIdentifier: stableUserId,
      name: args.name,
      phone: args.phone,
      role: "admin",
      permissions: [...ROLE_PERMISSIONS.admin],
      isActive: true,
    });

    // Log the setup action (manual log since no user profile existed before)
    await ctx.db.insert("auditLogs", {
      userId: stableUserId,
      userName: args.name,
      action: "setup",
      module: "system",
      recordId: String(id),
      recordLabel: args.name,
      details: `إعداد النظام وإنشاء أول مدير: ${args.name}`,
    });

    return id;
  },
});

// ──────────────────────────────────────────────
// AUTH: Resolve access state without creating or activating a profile.
// A missing profile remains pending until an admin explicitly provisions it.
// ──────────────────────────────────────────────
export const accessState = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const resolved = await getAuthProfile(ctx);
    if (!identity || !resolved) {
      throw new ConvexError("يجب تسجيل الدخول");
    }

    const adminExists = await hasAdmin(ctx);
    const existing = resolved.profile;

    if (!existing) {
      return {
        needsSetup: !adminExists,
        status: adminExists ? "pending" as const : "setup" as const,
        role: null,
        isActive: false,
        name: identity.name ?? identity.email ?? null,
      };
    }

    return {
      needsSetup: false,
      status: existing.isActive ? "active" as const : "inactive" as const,
      role: existing.role,
      isActive: existing.isActive,
      name: existing.name,
    };
  },
});

// ──────────────────────────────────────────────
// Standard employee CRUD (protected)
// ──────────────────────────────────────────────

export const list = query({
  args: { branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_employees", "employees");
    const employees = await ctx.db.query("userProfiles").collect();
    const filtered = filterByBranch(employees, user);
    if (args.branchId && user.role === "admin") {
      return filtered.filter(e => e.branchId === args.branchId);
    }
    return filtered;
  },
});

export const get = query({
  args: { id: v.id("userProfiles") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_employees", "employees");
    const employee = await ctx.db.get(args.id);
    if (employee) assertBranchAccess(user, employee);
    return employee;
  },
});

export const getByUserId = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_employees", "employees");
    const employee = await ctx.db.query("userProfiles")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .first();
    if (employee) assertBranchAccess(user, employee);
    return employee;
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "view_employees", "employees");
    const all = filterByBranch(await ctx.db.query("userProfiles").collect(), user);
    const byRole: Record<string, number> = {};
    for (const e of all) {
      byRole[e.role] = (byRole[e.role] ?? 0) + 1;
    }
    return {
      total: all.length,
      active: all.filter(e => e.isActive).length,
      inactive: all.filter(e => !e.isActive).length,
      byRole,
    };
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    return {
      id: user.employeeId,
      name: user.name,
      role: user.role,
      branchId: user.branchId,
      permissions: user.permissions,
    };
  },
});

export const setWorkingBranch = mutation({
  args: { branchId: v.id("branches") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "manage_branches", "branches");
    if (user.role !== "admin") {
      throw new ConvexError("مدير النظام فقط يمكنه تغيير فرع العمل");
    }
    const branch = await ctx.db.get(args.branchId);
    if (!branch || !branch.isActive) {
      throw new ConvexError("الفرع غير موجود أو غير نشط");
    }
    await ctx.db.patch(user.employeeId, { branchId: args.branchId });
    await logAction(ctx, { ...user, branchId: args.branchId }, {
      action: "select_branch",
      module: "branches",
      recordId: args.branchId,
      recordLabel: branch.name,
      details: `اختيار فرع العمل: ${branch.name}`,
    });
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    role: v.string(),
    branchId: v.optional(v.id("branches")),
    permissions: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "manage_users", "employees");
    if (!(args.role in ROLES)) throw new ConvexError("الدور الوظيفي غير صالح");
    const email = normalizeEmail(args.email);
    if (!isValidEmail(email)) {
      throw new ConvexError("البريد الإلكتروني غير صالح");
    }
    const duplicate = await ctx.db
      .query("userProfiles")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (duplicate) {
      throw new ConvexError("يوجد موظف مسجل بهذا البريد الإلكتروني");
    }
    const requestedPermissions = args.permissions ?? ROLE_PERMISSIONS[args.role] ?? [];
    if (requestedPermissions.some((permission) => !isPermission(permission))) {
      throw new ConvexError("توجد صلاحية غير معروفة");
    }
    const permissions = requestedPermissions.filter(isPermission);
    if (user.role !== "admin") {
      if (args.role === "admin" || permissions.some((permission) => !user.permissions.includes(permission))) {
        throw new ConvexError("لا يمكنك منح دور أو صلاحيات أعلى من صلاحياتك");
      }
    }
    const branchId = resolveWriteBranch(user, args.branchId);
    const id = await ctx.db.insert("userProfiles", {
      userId: `pending:${email}`,
      name: args.name,
      email,
      phone: args.phone,
      role: args.role,
      branchId,
      permissions,
      isActive: args.isActive ?? true,
      inviteExpiresAt: Date.now() + INVITE_TTL_MS,
    });
    await logAction(ctx, user, {
      action: "create",
      module: "employees",
      recordId: id,
      recordLabel: args.name,
      details: `إضافة موظف جديد: ${args.name} (${args.role})`,
    });
    return { id, inviteCode: String(id), email };
  },
});

export const update = mutation({
  args: {
    id: v.id("userProfiles"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: v.string(),
    branchId: v.optional(v.id("branches")),
    permissions: v.array(v.string()),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "manage_users", "employees");
    if (!(args.role in ROLES)) throw new ConvexError("الدور الوظيفي غير صالح");
    if (args.permissions.some((permission) => !isPermission(permission))) {
      throw new ConvexError("توجد صلاحية غير معروفة");
    }
    const { id } = args;
    const emp = await ctx.db.get(id);
    if (!emp) throw new ConvexError("الموظف غير موجود");
    assertBranchAccess(user, emp);
    if (user.role !== "admin" && (emp.role === "admin" || args.role === "admin")) {
      throw new ConvexError("لا يمكنك إدارة حسابات مديري النظام");
    }
    const permissions = args.permissions.filter(isPermission);
    if (user.role !== "admin" && permissions.some((permission) => !user.permissions.includes(permission))) {
      throw new ConvexError("لا يمكنك منح صلاحيات أعلى من صلاحياتك");
    }
    const email = args.email ? normalizeEmail(args.email) : emp.email;
    if (email && !isValidEmail(email)) {
      throw new ConvexError("البريد الإلكتروني غير صالح");
    }
    if (email && email !== emp.email) {
      if (emp.tokenIdentifier) {
        throw new ConvexError("لا يمكن تغيير بريد موظف فعّل حسابه");
      }
      const duplicate = await ctx.db
        .query("userProfiles")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
      if (duplicate && duplicate._id !== id) {
        throw new ConvexError("يوجد موظف مسجل بهذا البريد الإلكتروني");
      }
    }

    // Last admin protection: prevent deactivating or demoting the last active admin
    if (emp.role === "admin" && emp.isActive && (args.role !== "admin" || !args.isActive)) {
      const admins = await ctx.db
        .query("userProfiles")
        .withIndex("by_role", q => q.eq("role", "admin"))
        .filter(q => q.eq(q.field("isActive"), true))
        .collect();
      if (admins.length <= 1) {
        throw new ConvexError("لا يمكن تعطيل أو تغيير دور آخر مدير نظام نشط");
      }
    }

    const branchId = resolveWriteBranch(user, args.branchId ?? emp.branchId);
    await ctx.db.patch(id, {
      name: args.name,
      email,
      phone: args.phone,
      role: args.role,
      branchId,
      permissions,
      isActive: args.isActive,
    });
    await logAction(ctx, user, {
      action: "update",
      module: "employees",
      recordId: id,
      recordLabel: args.name,
      details: `تعديل بيانات الموظف: ${args.name}`,
    });
  },
});

export const toggleActive = mutation({
  args: { id: v.id("userProfiles") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "manage_users", "employees");
    const emp = await ctx.db.get(args.id);
    if (!emp) throw new ConvexError("الموظف غير موجود");
    assertBranchAccess(user, emp);
    if (user.role !== "admin" && emp.role === "admin") {
      throw new ConvexError("لا يمكنك إدارة حسابات مديري النظام");
    }

    // Last admin protection
    if (emp.role === "admin" && emp.isActive) {
      const admins = await ctx.db
        .query("userProfiles")
        .withIndex("by_role", q => q.eq("role", "admin"))
        .filter(q => q.eq(q.field("isActive"), true))
        .collect();
      if (admins.length <= 1) {
        throw new ConvexError("لا يمكن تعطيل آخر مدير نظام نشط");
      }
    }

    await ctx.db.patch(args.id, { isActive: !emp.isActive });
    await logAction(ctx, user, {
      action: "update",
      module: "employees",
      recordId: args.id,
      recordLabel: emp.name,
      details: `${emp.isActive ? "إيقاف" : "تفعيل"} الموظف: ${emp.name}`,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("userProfiles") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "manage_users", "employees");
    const emp = await ctx.db.get(args.id);
    if (!emp) throw new ConvexError("الموظف غير موجود");
    assertBranchAccess(user, emp);
    if (user.role !== "admin" && emp.role === "admin") {
      throw new ConvexError("لا يمكنك إدارة حسابات مديري النظام");
    }

    // Last admin protection
    if (emp.role === "admin" && emp.isActive) {
      const admins = await ctx.db
        .query("userProfiles")
        .withIndex("by_role", q => q.eq("role", "admin"))
        .filter(q => q.eq(q.field("isActive"), true))
        .collect();
      if (admins.length <= 1) {
        throw new ConvexError("لا يمكن حذف آخر مدير نظام نشط");
      }
    }

    await ctx.db.patch(args.id, {
      isActive: false,
      inviteExpiresAt: undefined,
    });
    await logAction(ctx, user, {
      action: "deactivate",
      module: "employees",
      recordId: args.id,
      recordLabel: emp.name,
      details: `إلغاء تنشيط الموظف مع الاحتفاظ بسجل الحساب: ${emp.name}`,
    });
  },
});

export const renewInvitation = mutation({
  args: { id: v.id("userProfiles") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "manage_users", "employees");
    const employee = await ctx.db.get(args.id);
    if (!employee) throw new ConvexError("الموظف غير موجود");
    assertBranchAccess(user, employee);
    if (employee.tokenIdentifier) {
      throw new ConvexError("تم تفعيل حساب هذا الموظف بالفعل");
    }
    if (!employee.email) {
      throw new ConvexError("أضف بريد الموظف أولاً");
    }
    await ctx.db.patch(args.id, {
      isActive: true,
      inviteExpiresAt: Date.now() + INVITE_TTL_MS,
    });
    await logAction(ctx, user, {
      action: "renew_invitation",
      module: "employees",
      recordId: args.id,
      recordLabel: employee.name,
      details: `تجديد دعوة الموظف: ${employee.name}`,
    });
    return { inviteCode: String(args.id), email: employee.email };
  },
});

export const updatePermissions = mutation({
  args: {
    id: v.id("userProfiles"),
    permissions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "manage_users", "employees");
    if (args.permissions.some((permission) => !isPermission(permission))) {
      throw new ConvexError("توجد صلاحية غير معروفة");
    }
    const emp = await ctx.db.get(args.id);
    if (!emp) throw new ConvexError("الموظف غير موجود");
    assertBranchAccess(user, emp);
    if (user.role !== "admin" && emp.role === "admin") {
      throw new ConvexError("لا يمكنك إدارة حسابات مديري النظام");
    }
    const permissions = args.permissions.filter(isPermission);
    if (user.role !== "admin" && permissions.some((permission) => !user.permissions.includes(permission))) {
      throw new ConvexError("لا يمكنك منح صلاحيات أعلى من صلاحياتك");
    }
    await ctx.db.patch(args.id, { permissions });
    await logAction(ctx, user, {
      action: "update",
      module: "employees",
      recordId: args.id,
      recordLabel: emp.name,
      details: `تحديث صلاحيات الموظف: ${emp.name}`,
    });
  },
});
