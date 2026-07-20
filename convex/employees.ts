import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireAuth, requirePermission, logAction, hasAdmin } from "./lib/auth";
import { ROLES, ROLE_PERMISSIONS } from "./lib/permissions";

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

    // Get the current identity (user must be signed in via Convex Auth)
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("يجب تسجيل الدخول أولاً قبل إعداد النظام");
    }

    // Check if a profile already exists for this token
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();

    if (existing) {
      // Upgrade existing profile to admin
      await ctx.db.patch(existing._id, {
        role: "admin",
        name: args.name,
        phone: args.phone,
        permissions: [...ROLE_PERMISSIONS.admin],
        isActive: true,
      });
      return existing._id;
    }

    // Create new admin profile
    const id = await ctx.db.insert("userProfiles", {
      userId: identity.subject,
      tokenIdentifier: identity.subject,
      name: args.name,
      phone: args.phone,
      role: "admin",
      permissions: [...ROLE_PERMISSIONS.admin],
      isActive: true,
    });

    // Log the setup action (manual log since no user profile existed before)
    await ctx.db.insert("auditLogs", {
      userId: identity.subject,
      userName: args.name,
      action: "setup",
      module: "system",
      recordId: id as any,
      recordLabel: args.name,
      details: `إعداد النظام وإنشاء أول مدير: ${args.name}`,
    });

    return id;
  },
});

// ──────────────────────────────────────────────
// AUTH: Ensure profile exists for signed-in user
// Called by frontend after authentication.
// - If no admin exists yet → returns { needsSetup: true }
// - If admin exists but user has no profile → creates viewer profile, returns { needsSetup: false, profile: "viewer" }
// - If user has profile → returns { needsSetup: false, profile: existing role }
// ──────────────────────────────────────────────
export const ensureProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("يجب تسجيل الدخول");
    }

    // Check if any admin exists
    const adminExists = await hasAdmin(ctx);

    // Check if user already has a profile
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
      .unique();

    if (existing) {
      return {
        needsSetup: !adminExists,
        role: existing.role,
        isActive: existing.isActive,
      };
    }

    // No profile yet
    if (!adminExists) {
      // No admin yet — user should go through setup wizard
      return { needsSetup: true, role: null, isActive: false };
    }

    // Admin exists but this user has no profile → create viewer (pending approval)
    const name = identity.name ?? identity.email ?? "مستخدم جديد";
    const id = await ctx.db.insert("userProfiles", {
      userId: identity.subject,
      tokenIdentifier: identity.subject,
      name,
      role: "viewer",
      permissions: [...ROLE_PERMISSIONS.viewer],
      isActive: true,
    });

    await ctx.db.insert("auditLogs", {
      userId: identity.subject,
      userName: name,
      action: "login",
      module: "auth",
      recordId: id as any,
      recordLabel: name,
      details: `تسجيل مستخدم جديد بدور مشاهد (بانتظار الموافقة): ${name}`,
    });

    return { needsSetup: false, role: "viewer", isActive: true };
  },
});

// ──────────────────────────────────────────────
// Standard employee CRUD (protected)
// ──────────────────────────────────────────────

export const list = query({
  args: { branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const employees = await ctx.db.query("userProfiles").collect();
    // Non-admins can only see employees in their branch
    let filtered = employees;
    if (user.role !== "admin" && user.branchId) {
      filtered = filtered.filter(e => !e.branchId || e.branchId === user.branchId);
    }
    if (args.branchId) {
      return filtered.filter(e => e.branchId === args.branchId);
    }
    return filtered;
  },
});

export const get = query({
  args: { id: v.id("userProfiles") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db.get(args.id);
  },
});

export const getByUserId = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.query("userProfiles")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .first();
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const all = await ctx.db.query("userProfiles").collect();
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

export const create = mutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    role: v.string(),
    branchId: v.optional(v.id("branches")),
    permissions: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "manage_users");
    const permissions = args.permissions ?? ROLE_PERMISSIONS[args.role] ?? [];
    const userId = "emp_" + Date.now().toString();
    const id = await ctx.db.insert("userProfiles", {
      userId,
      name: args.name,
      phone: args.phone,
      role: args.role,
      branchId: args.branchId,
      permissions,
      isActive: args.isActive ?? true,
    });
    await logAction(ctx, user, {
      action: "create",
      module: "employees",
      recordId: id,
      recordLabel: args.name,
      details: `إضافة موظف جديد: ${args.name} (${args.role})`,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("userProfiles"),
    name: v.string(),
    phone: v.optional(v.string()),
    role: v.string(),
    branchId: v.optional(v.id("branches")),
    permissions: v.array(v.string()),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "manage_users");
    const { id, ...data } = args;
    const emp = await ctx.db.get(id);
    if (!emp) throw new ConvexError("الموظف غير موجود");

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

    await ctx.db.patch(id, data);
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
    const user = await requirePermission(ctx, "manage_users");
    const emp = await ctx.db.get(args.id);
    if (!emp) throw new ConvexError("الموظف غير موجود");

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
    const user = await requirePermission(ctx, "manage_users");
    const emp = await ctx.db.get(args.id);
    if (!emp) throw new ConvexError("الموظف غير موجود");

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

    await ctx.db.delete(args.id);
    await logAction(ctx, user, {
      action: "delete",
      module: "employees",
      recordId: args.id,
      recordLabel: emp.name,
      details: `حذف الموظف: ${emp.name}`,
    });
  },
});

export const updatePermissions = mutation({
  args: {
    id: v.id("userProfiles"),
    permissions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePermission(ctx, "manage_users");
    const emp = await ctx.db.get(args.id);
    if (!emp) throw new ConvexError("الموظف غير موجود");
    await ctx.db.patch(args.id, { permissions: args.permissions });
    await logAction(ctx, user, {
      action: "update",
      module: "employees",
      recordId: args.id,
      recordLabel: emp.name,
      details: `تحديث صلاحيات الموظف: ${emp.name}`,
    });
  },
});
