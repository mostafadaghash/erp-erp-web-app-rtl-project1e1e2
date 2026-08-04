from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    source = file_path.read_text(encoding="utf-8")
    if new in source:
        return
    if old not in source:
        raise SystemExit(f"anchor not found in {path}: {old[:120]!r}")
    file_path.write_text(source.replace(old, new, 1), encoding="utf-8")


# Schema: bounded structured snapshots.
replace_once(
    "convex/schema.ts",
    '''    details: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    timestamp: v.optional(v.number()),
''',
    '''    details: v.optional(v.string()),
    beforeSnapshot: v.optional(v.array(v.object({ field: v.string(), value: v.string() }))),
    afterSnapshot: v.optional(v.array(v.object({ field: v.string(), value: v.string() }))),
    changedFields: v.optional(v.array(v.string())),
    snapshotVersion: v.optional(v.number()),
    branchId: v.optional(v.id("branches")),
    timestamp: v.optional(v.number()),
''',
)

# Central audit helper: safe/bounded snapshots and explicit record branch override.
replace_once(
    "convex/lib/auth.ts",
    '''// ──────────────────────────────────────────────
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
''',
    '''// ──────────────────────────────────────────────
// logAction — centralized immutable audit logging
// Callers pass only explicitly safe scalar snapshot fields.
// ──────────────────────────────────────────────
export type AuditSnapshotValue = string | number | boolean | null | undefined;
export type AuditSnapshotInput = Record<string, AuditSnapshotValue>;
type AuditSnapshotRow = { field: string; value: string };

const MAX_AUDIT_FIELDS = 24;
const MAX_AUDIT_VALUE_LENGTH = 300;
const SENSITIVE_AUDIT_FIELD = /(password|secret|token|hash|authorization|cookie|session|invitecode|requestfingerprint|idempotencykey)/i;

function formatAuditValue(field: string, value: AuditSnapshotValue): string {
  if (SENSITIVE_AUDIT_FIELD.test(field)) return "[محجوب]";
  if (value === undefined) return "—";
  if (value === null) return "فارغ";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "غير صالح";
  const normalized = value.trim().replace(/\\s+/g, " ");
  return (normalized || "فارغ").slice(0, MAX_AUDIT_VALUE_LENGTH);
}

export function createAuditSnapshot(
  input?: AuditSnapshotInput,
): AuditSnapshotRow[] | undefined {
  if (!input) return undefined;
  const rows = Object.entries(input)
    .slice(0, MAX_AUDIT_FIELDS)
    .map(([field, value]) => ({
      field: field.trim().slice(0, 64),
      value: formatAuditValue(field, value),
    }))
    .filter((row) => row.field.length > 0);
  return rows.length > 0 ? rows : undefined;
}

function changedAuditFields(
  before?: AuditSnapshotRow[],
  after?: AuditSnapshotRow[],
): string[] | undefined {
  if (!before && !after) return undefined;
  const beforeValues = new Map((before ?? []).map((row) => [row.field, row.value]));
  const afterValues = new Map((after ?? []).map((row) => [row.field, row.value]));
  const fields = new Set([...beforeValues.keys(), ...afterValues.keys()]);
  const changed = [...fields].filter(
    (field) => beforeValues.get(field) !== afterValues.get(field),
  );
  return changed.length > 0 ? changed : undefined;
}

export async function logAction(
  ctx: MutationCtx,
  user: AuthUser,
  params: {
    action: string;
    module: string;
    recordId?: string;
    recordLabel?: string;
    details?: string;
    branchId?: Id<"branches"> | null;
    before?: AuditSnapshotInput;
    after?: AuditSnapshotInput;
  },
) {
  const beforeSnapshot = createAuditSnapshot(params.before);
  const afterSnapshot = createAuditSnapshot(params.after);
  const hasBranchOverride = Object.prototype.hasOwnProperty.call(params, "branchId");
  await ctx.db.insert("auditLogs", {
    userId: user.userId,
    userName: user.name,
    branchId: hasBranchOverride ? params.branchId ?? undefined : user.branchId,
    action: params.action.trim().slice(0, 64),
    module: params.module.trim().slice(0, 64),
    recordId: params.recordId ? String(params.recordId).slice(0, 200) : undefined,
    recordLabel: params.recordLabel?.trim().slice(0, 200),
    details: params.details?.trim().slice(0, 1000) ?? "",
    beforeSnapshot,
    afterSnapshot,
    changedFields: changedAuditFields(beforeSnapshot, afterSnapshot),
    snapshotVersion: beforeSnapshot || afterSnapshot ? 1 : undefined,
    timestamp: Date.now(),
  });
}
''',
)

# Audit read DTO.
replace_once(
    "convex/auditLogs.ts",
    '''    details: log.details ?? null,
    branchId: log.branchId ?? null,
''',
    '''    details: log.details ?? null,
    beforeSnapshot: log.beforeSnapshot ?? [],
    afterSnapshot: log.afterSnapshot ?? [],
    changedFields: log.changedFields ?? [],
    snapshotVersion: log.snapshotVersion ?? null,
    branchId: log.branchId ?? null,
''',
)

# Audit UI: searchable structured snapshots and native expandable Before/After details.
replace_once(
    "src/components/AuditLogsPage.tsx",
    '''};

function startOfDay(value: string) {
''',
    '''};

const FIELD_LABELS: Record<string, string> = {
  name: "الاسم",
  role: "الدور",
  branchId: "الفرع",
  isActive: "نشط",
  permissionsCount: "عدد الصلاحيات",
  storeName: "اسم المتجر",
  storeType: "نوع المتجر",
  currency: "العملة",
  taxRate: "الضريبة",
  phoneLast4: "آخر 4 أرقام",
  hasEmail: "يوجد بريد",
  hasAddress: "يوجد عنوان",
  hasNotes: "توجد ملاحظات",
  sku: "SKU",
  categoryId: "الفئة",
  supplierId: "المورد",
  minStock: "حد المخزون",
  unit: "الوحدة",
  stock: "المخزون",
};

type SnapshotRow = { field: string; value: string };

function SnapshotList({ title, rows }: { title: string; rows: SnapshotRow[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-2 text-xs font-bold text-slate-700">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">لا توجد بيانات</p>
      ) : (
        <dl className="space-y-1.5">
          {rows.map((row) => (
            <div key={row.field} className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-2 text-xs">
              <dt className="font-medium text-slate-500">
                {FIELD_LABELS[row.field] ?? row.field}
              </dt>
              <dd className="break-words text-slate-700">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function startOfDay(value: string) {
''',
)
replace_once(
    "src/components/AuditLogsPage.tsx",
    '''          MODULE_LABELS[log.module] ?? log.module,
        ].some((value) =>
''',
    '''          MODULE_LABELS[log.module] ?? log.module,
          ...log.beforeSnapshot.flatMap((row) => [row.field, row.value]),
          ...log.afterSnapshot.flatMap((row) => [row.field, row.value]),
          ...log.changedFields,
        ].some((value) =>
''',
)
replace_once(
    "src/components/AuditLogsPage.tsx",
    '''                      <td
                        className="px-4 py-3 text-xs text-slate-500 max-w-72"
                        title={log.details ?? undefined}
                      >
                        <span className="line-clamp-2">{log.details ?? "—"}</span>
                      </td>
''',
    '''                      <td className="px-4 py-3 text-xs text-slate-500 min-w-72 max-w-xl">
                        <div className="space-y-2">
                          <span className="line-clamp-2" title={log.details ?? undefined}>
                            {log.details ?? "—"}
                          </span>
                          {log.changedFields.length > 0 && (
                            <details className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-2">
                              <summary className="cursor-pointer font-bold text-indigo-700">
                                عرض Before / After ({log.changedFields.length})
                              </summary>
                              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                <SnapshotList title="قبل" rows={log.beforeSnapshot} />
                                <SnapshotList title="بعد" rows={log.afterSnapshot} />
                              </div>
                            </details>
                          )}
                        </div>
                      </td>
''',
)

# Branch audit snapshots and record-branch attribution.
replace_once(
    "convex/branches.ts",
    '''      details: `إضافة فرع جديد: ${args.name} - ${args.address}`,
    });
''',
    '''      details: `إضافة فرع جديد: ${args.name} - ${args.address}`,
      branchId: id,
      after: { name: args.name, address: args.address, phone: args.phone, isActive: args.isActive ?? true },
    });
''',
)
replace_once(
    "convex/branches.ts",
    '''      details: `تحديث بيانات الفرع: ${args.name}`,
    });
''',
    '''      details: `تحديث بيانات الفرع: ${args.name}`,
      branchId: id,
      before: { name: branch.name, address: branch.address, phone: branch.phone, isActive: branch.isActive },
      after: { name: data.name, address: data.address, phone: data.phone, isActive: data.isActive },
    });
''',
)
replace_once(
    "convex/branches.ts",
    '''export const setActive = mutation({
  args: { id: v.id("branches"), isActive: v.boolean() },
  handler: async (ctx, args) => { const user = await requireModulePermission(ctx, "manage_branches", "branches"); const branch = await ctx.db.get(args.id); if (!branch) throw new ConvexError("الفرع غير موجود"); if (!args.isActive) { const employees = (await ctx.db.query("userProfiles").collect()).filter(profile => profile.branchId === args.id && profile.isActive); if (employees.length) throw new ConvexError("لا يمكن تعطيل فرع يحتوي على موظفين نشطين"); } await ctx.db.patch(args.id, { isActive: args.isActive }); await logAction(ctx, user, { action: args.isActive ? "activate" : "deactivate", module: "branches", recordId: args.id, recordLabel: branch.name, details: `${args.isActive ? "تفعيل" : "تعطيل"} الفرع ${branch.name}` }); },
});
''',
    '''export const setActive = mutation({
  args: { id: v.id("branches"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "manage_branches", "branches");
    const branch = await ctx.db.get(args.id);
    if (!branch) throw new ConvexError("الفرع غير موجود");
    if (branch.isActive === args.isActive) return;
    if (!args.isActive) {
      const employees = (await ctx.db.query("userProfiles").collect()).filter(
        (profile) => profile.branchId === args.id && profile.isActive,
      );
      if (employees.length) throw new ConvexError("لا يمكن تعطيل فرع يحتوي على موظفين نشطين");
    }
    await ctx.db.patch(args.id, { isActive: args.isActive });
    await logAction(ctx, user, {
      action: args.isActive ? "activate" : "deactivate",
      module: "branches",
      recordId: args.id,
      recordLabel: branch.name,
      details: `${args.isActive ? "تفعيل" : "تعطيل"} الفرع ${branch.name}`,
      branchId: args.id,
      before: { isActive: branch.isActive },
      after: { isActive: args.isActive },
    });
  },
});
''',
)
replace_once(
    "convex/branches.ts",
    '''      details: `إسناد ${assigned} سجل قديم بدون فرع إلى ${branch.name}`,
    });
''',
    '''      details: `إسناد ${assigned} سجل قديم بدون فرع إلى ${branch.name}`,
      branchId: args.branchId,
      after: { assignedRecords: assigned, targetBranch: branch.name },
    });
''',
)

# Settings are global records: never inherit the actor working branch.
replace_once(
    "convex/settings.ts",
    '''    await logAction(ctx, user, {
      action: "update",
      module: "settings",
      recordId: id,
      recordLabel: args.storeName,
      details: `تحديث إعدادات المتجر: ${args.storeName}`,
    });
''',
    '''    await logAction(ctx, user, {
      action: "update",
      module: "settings",
      recordId: id,
      recordLabel: args.storeName,
      details: `تحديث إعدادات المتجر: ${args.storeName}`,
      branchId: null,
      before: existing ? { storeName: existing.storeName, storeType: existing.storeType, currency: existing.currency, taxRate: existing.taxRate } : undefined,
      after: { storeName: normalizedArgs.storeName, storeType: normalizedArgs.storeType, currency: normalizedArgs.currency, taxRate: normalizedArgs.taxRate },
    });
''',
)
replace_once(
    "convex/settings.ts",
    '''    await logAction(ctx, user, {
      action: "update",
      module: "settings",
      recordId: id,
      recordLabel: "modules",
      details: `تحديث تفعيل الوحدات`,
    });
''',
    '''    await logAction(ctx, user, {
      action: "update",
      module: "settings",
      recordId: id,
      recordLabel: "modules",
      details: `تحديث تفعيل الوحدات`,
      branchId: null,
      before: existing?.modules,
      after: args.modules,
    });
''',
)

# Customer master data: branch-correct, safe snapshots without full contact details.
replace_once(
    "convex/customers.ts",
    '''      details: `إضافة عميل جديد: ${normalized.name} - ${normalized.phone}`,
    });
''',
    '''      details: `إضافة عميل جديد: ${normalized.name} - ${normalized.phone}`,
      branchId,
      after: { name: normalized.name, phoneLast4: normalized.phone.slice(-4), hasEmail: Boolean(normalized.email), hasAddress: Boolean(normalized.address), hasNotes: Boolean(normalized.notes), isActive: true },
    });
''',
)
replace_once(
    "convex/customers.ts",
    '''      details: `تحديث بيانات العميل: ${customer.name} ← ${normalized.name}`,
    });
''',
    '''      details: `تحديث بيانات العميل: ${customer.name} ← ${normalized.name}`,
      branchId: customer.branchId,
      before: { name: customer.name, phoneLast4: customer.phone.slice(-4), hasEmail: Boolean(customer.email), hasAddress: Boolean(customer.address), hasNotes: Boolean(customer.notes) },
      after: { name: normalized.name, phoneLast4: normalized.phone.slice(-4), hasEmail: Boolean(normalized.email), hasAddress: Boolean(normalized.address), hasNotes: Boolean(normalized.notes) },
    });
''',
)
replace_once(
    "convex/customers.ts",
    '''    await logAction(ctx, user, { action: args.isActive ? "activate" : "deactivate", module: "customers", recordId: args.id, recordLabel: customer.name, details: `${args.isActive ? "تفعيل" : "تعطيل"} العميل ${customer.name}` });
''',
    '''    await logAction(ctx, user, { action: args.isActive ? "activate" : "deactivate", module: "customers", recordId: args.id, recordLabel: customer.name, details: `${args.isActive ? "تفعيل" : "تعطيل"} العميل ${customer.name}`, branchId: customer.branchId, before: { isActive: customer.isActive ?? true }, after: { isActive: args.isActive } });
''',
)

# Supplier master data is global; do not attach actor branch.
replace_once(
    "convex/suppliers.ts",
    '''      details: `إضافة مورد جديد: ${normalized.name} - ${normalized.phone}`,
    });
''',
    '''      details: `إضافة مورد جديد: ${normalized.name} - ${normalized.phone}`,
      branchId: null,
      after: { name: normalized.name, phoneLast4: normalized.phone.slice(-4), hasEmail: Boolean(normalized.email), hasAddress: Boolean(normalized.address), hasNotes: Boolean(normalized.notes), isActive: true },
    });
''',
)
replace_once(
    "convex/suppliers.ts",
    '''      details: `تحديث بيانات المورد: ${supplier.name} ← ${normalized.name}`,
    });
''',
    '''      details: `تحديث بيانات المورد: ${supplier.name} ← ${normalized.name}`,
      branchId: null,
      before: { name: supplier.name, phoneLast4: supplier.phone.slice(-4), hasEmail: Boolean(supplier.email), hasAddress: Boolean(supplier.address), hasNotes: Boolean(supplier.notes) },
      after: { name: normalized.name, phoneLast4: normalized.phone.slice(-4), hasEmail: Boolean(normalized.email), hasAddress: Boolean(normalized.address), hasNotes: Boolean(normalized.notes) },
    });
''',
)
replace_once(
    "convex/suppliers.ts",
    '''    await logAction(ctx, user, { action: args.isActive ? "activate" : "deactivate", module: "suppliers", recordId: args.id, recordLabel: supplier.name, details: `${args.isActive ? "تفعيل" : "تعطيل"} المورد ${supplier.name}` });
''',
    '''    await logAction(ctx, user, { action: args.isActive ? "activate" : "deactivate", module: "suppliers", recordId: args.id, recordLabel: supplier.name, details: `${args.isActive ? "تفعيل" : "تعطيل"} المورد ${supplier.name}`, branchId: null, before: { isActive: supplier.isActive ?? true }, after: { isActive: args.isActive } });
''',
)

# Product master/inventory actions: omit cost and price from generic audit DTO.
replace_once(
    "convex/products.ts",
    '''    await logAction(ctx, user, { action: "create", module: "products", recordId: id, recordLabel: normalized.name, details: `إضافة منتج جديد: ${normalized.name}` });
''',
    '''    await logAction(ctx, user, { action: "create", module: "products", recordId: id, recordLabel: normalized.name, details: `إضافة منتج جديد: ${normalized.name}`, branchId, after: { name: normalized.name, sku: normalized.sku, categoryId: args.categoryId ? String(args.categoryId) : null, supplierId: args.supplierId ? String(args.supplierId) : null, minStock: args.minStock, unit: normalized.unit, stock: args.stock, isActive: true } });
''',
)
replace_once(
    "convex/products.ts",
    '''    await logAction(ctx, user, { action: "update", module: "products", recordId: args.id, recordLabel: normalized.name, details: `تعديل المنتج: ${normalized.name}` });
''',
    '''    await logAction(ctx, user, { action: "update", module: "products", recordId: args.id, recordLabel: normalized.name, details: `تعديل المنتج: ${normalized.name}`, branchId, before: { name: product.name, sku: product.sku, categoryId: product.categoryId ? String(product.categoryId) : null, supplierId: product.supplierId ? String(product.supplierId) : null, minStock: product.minStock, unit: product.unit }, after: { name: normalized.name, sku: normalized.sku, categoryId: args.categoryId ? String(args.categoryId) : null, supplierId: args.supplierId ? String(args.supplierId) : null, minStock: args.minStock, unit: normalized.unit } });
''',
)
replace_once(
    "convex/products.ts",
    '''    await logAction(ctx, user, { action: "update", module: "products", recordId: args.id, details: `تعديل يدوي للمخزون: ${args.adjustment > 0 ? "+" : ""}${args.adjustment} - ${args.reason.trim()}` });
''',
    '''    await logAction(ctx, user, { action: "adjust_stock", module: "products", recordId: args.id, recordLabel: current.name, details: `تعديل يدوي للمخزون: ${args.adjustment > 0 ? "+" : ""}${args.adjustment} - ${args.reason.trim()}`, branchId: current.branchId, before: { stock: current.stock }, after: { stock: current.stock + args.adjustment, adjustment: args.adjustment, reason: args.reason.trim() } });
''',
)
replace_once(
    "convex/products.ts",
    '''  await logAction(ctx, user, { action: "update", module: "products", recordId: id, recordLabel: product.name, details: `${isActive ? "إعادة تفعيل" : "تعطيل"} المنتج: ${product.name}` });
''',
    '''  await logAction(ctx, user, { action: isActive ? "activate" : "deactivate", module: "products", recordId: id, recordLabel: product.name, details: `${isActive ? "إعادة تفعيل" : "تعطيل"} المنتج: ${product.name}`, branchId: product.branchId, before: { isActive: product.isActive ?? true }, after: { isActive } });
''',
)

# Employee administration: branch-correct snapshots without email/phone/permission contents.
replace_once(
    "convex/employees.ts",
    '''import { assertBranchAccess, filterByBranch, requireAuth, requireModulePermission, resolveWriteBranch, logAction, hasAdmin, getAuthProfile } from "./lib/auth";
''',
    '''import { assertBranchAccess, filterByBranch, requireAuth, requireModulePermission, resolveWriteBranch, logAction, hasAdmin, getAuthProfile, createAuditSnapshot } from "./lib/auth";
''',
)
replace_once(
    "convex/employees.ts",
    '''      await ctx.db.patch(existing._id, {
        role: "admin",
        name: args.name,
        phone: args.phone,
        permissions: [...ROLE_PERMISSIONS.admin],
        isActive: true,
        userId: stableUserId,
        tokenIdentifier: stableUserId,
      });
      return existing._id;
''',
    '''      await ctx.db.patch(existing._id, {
        role: "admin",
        name: args.name,
        phone: args.phone,
        permissions: [...ROLE_PERMISSIONS.admin],
        isActive: true,
        userId: stableUserId,
        tokenIdentifier: stableUserId,
      });
      const beforeSnapshot = createAuditSnapshot({ name: existing.name, role: existing.role, branchId: existing.branchId ? String(existing.branchId) : null, isActive: existing.isActive, permissionsCount: existing.permissions.length });
      const afterSnapshot = createAuditSnapshot({ name: args.name, role: "admin", branchId: existing.branchId ? String(existing.branchId) : null, isActive: true, permissionsCount: ROLE_PERMISSIONS.admin.length });
      await ctx.db.insert("auditLogs", {
        userId: stableUserId,
        userName: args.name,
        action: "setup",
        module: "system",
        recordId: String(existing._id),
        recordLabel: args.name,
        details: `إعداد النظام وترقية أول مدير: ${args.name}`,
        branchId: existing.branchId,
        beforeSnapshot,
        afterSnapshot,
        changedFields: ["name", "role", "isActive", "permissionsCount"],
        snapshotVersion: 1,
        timestamp: Date.now(),
      });
      return existing._id;
''',
)
replace_once(
    "convex/employees.ts",
    '''      details: `إعداد النظام وإنشاء أول مدير: ${args.name}`,
    });
''',
    '''      details: `إعداد النظام وإنشاء أول مدير: ${args.name}`,
      afterSnapshot: createAuditSnapshot({ name: args.name, role: "admin", branchId: null, isActive: true, permissionsCount: ROLE_PERMISSIONS.admin.length }),
      changedFields: ["name", "role", "isActive", "permissionsCount"],
      snapshotVersion: 1,
      timestamp: Date.now(),
    });
''',
)
replace_once(
    "convex/employees.ts",
    '''      details: `اختيار فرع العمل: ${branch.name}`,
    });
''',
    '''      details: `اختيار فرع العمل: ${branch.name}`,
      branchId: args.branchId,
      before: { branchId: user.branchId ? String(user.branchId) : null },
      after: { branchId: String(args.branchId) },
    });
''',
)
replace_once(
    "convex/employees.ts",
    '''      details: `إضافة موظف جديد: ${args.name} (${args.role})`,
    });
''',
    '''      details: `إضافة موظف جديد: ${args.name} (${args.role})`,
      branchId,
      after: { name: args.name, role: args.role, branchId: branchId ? String(branchId) : null, isActive: args.isActive ?? true, permissionsCount: permissions.length },
    });
''',
)
replace_once(
    "convex/employees.ts",
    '''      details: `تعديل بيانات الموظف: ${args.name}`,
    });
''',
    '''      details: `تعديل بيانات الموظف: ${args.name}`,
      branchId,
      before: { name: emp.name, role: emp.role, branchId: emp.branchId ? String(emp.branchId) : null, isActive: emp.isActive, permissionsCount: emp.permissions.length },
      after: { name: args.name, role: args.role, branchId: branchId ? String(branchId) : null, isActive: args.isActive, permissionsCount: permissions.length },
    });
''',
)
replace_once(
    "convex/employees.ts",
    '''      action: "update",
      module: "employees",
      recordId: args.id,
      recordLabel: emp.name,
      details: `${emp.isActive ? "إيقاف" : "تفعيل"} الموظف: ${emp.name}`,
    });
''',
    '''      action: emp.isActive ? "deactivate" : "activate",
      module: "employees",
      recordId: args.id,
      recordLabel: emp.name,
      details: `${emp.isActive ? "إيقاف" : "تفعيل"} الموظف: ${emp.name}`,
      branchId: emp.branchId,
      before: { isActive: emp.isActive },
      after: { isActive: !emp.isActive },
    });
''',
)
replace_once(
    "convex/employees.ts",
    '''      details: `إلغاء تنشيط الموظف مع الاحتفاظ بسجل الحساب: ${emp.name}`,
    });
''',
    '''      details: `إلغاء تنشيط الموظف مع الاحتفاظ بسجل الحساب: ${emp.name}`,
      branchId: emp.branchId,
      before: { isActive: emp.isActive, invitationActive: Boolean(emp.inviteExpiresAt) },
      after: { isActive: false, invitationActive: false },
    });
''',
)
replace_once(
    "convex/employees.ts",
    '''      details: `تجديد دعوة الموظف: ${employee.name}`,
    });
''',
    '''      details: `تجديد دعوة الموظف: ${employee.name}`,
      branchId: employee.branchId,
      before: { isActive: employee.isActive, invitationActive: Boolean(employee.inviteExpiresAt) },
      after: { isActive: true, invitationActive: true },
    });
''',
)
replace_once(
    "convex/employees.ts",
    '''      details: `تحديث صلاحيات الموظف: ${emp.name}`,
    });
''',
    '''      details: `تحديث صلاحيات الموظف: ${emp.name}`,
      branchId: emp.branchId,
      before: { permissionsCount: emp.permissions.length },
      after: { permissionsCount: permissions.length },
    });
''',
)

print("structured audit patch applied")
