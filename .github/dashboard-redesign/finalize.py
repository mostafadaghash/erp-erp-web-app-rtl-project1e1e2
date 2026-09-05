from __future__ import annotations

from pathlib import Path
import subprocess
import sys
import textwrap

ROOT = Path.cwd()
transformer = Path(sys.argv[1])
s = transformer.read_text(encoding="utf-8")

old = "pattern = r'(  useEffect\\(\\(\\) => \\{\\n    if \\(createRequestToken && canCreate\\) setShowForm\\(true\\);\\n  \\}, \\[createRequestToken, canCreate\\]\\);\\n)'"
new = "pattern = r'(  useEffect\\(\\(\\) => \\{\\n    if \\(createRequestToken && canCreate\\) openNewRepair\\(\\);\\n  \\}, \\[createRequestToken, canCreate\\]\\);\\n)'"
if old not in s:
    raise SystemExit("old RepairsPage effect pattern not found in transformer")
s = s.replace(old, new, 1)

marker = "write('src/components/RepairsPage.tsx', repair_ui)"
repair_injection = textwrap.dedent('''
repair_ui = repair_ui.replace(
    '    { key: "pending", label: "قيد الإنتظار", value: repairCounts?.pending ?? 0, icon: Clock },',
    '    { key: "pending", label: "قيد الإنتظار", value: repairCounts?.pending ?? 0, icon: Clock },\\n    { key: "technician_received", label: "تم الاستلام من الفني", value: repairCounts?.technician_received ?? 0, icon: CheckCircle },',
    1,
)
repair_ui = repair_ui.replace('shipping_rejected', 'technician_rejected').replace('مرفوض من شركة الشحن', 'مرفوض من الفني').replace('rejected_by_shipping', 'rejected_by_technician')
''')
if marker not in s:
    raise SystemExit("RepairsPage write marker not found in transformer")
s = s.replace(marker, repair_injection + marker, 1)

assert_marker = "# Assert production source no longer contains the invalid shipping-company repair state."
semantic_cleanup = textwrap.dedent(r'''
for base in ['shared', 'convex', 'src']:
    for path in (ROOT / base).rglob('*'):
        if path.is_file() and path.suffix in {'.ts', '.tsx'}:
            text = path.read_text(encoding='utf-8')
            updated = text.replace('rejected_by_shipping', 'rejected_by_technician').replace('shipping_rejected', 'technician_rejected').replace('مرفوض من شركة الشحن', 'مرفوض من الفني')
            if updated != text:
                path.write_text(updated, encoding='utf-8')

follow_path = ROOT / 'shared/customerFollowUpRules.ts'
follow = follow_path.read_text(encoding='utf-8')
follow = follow.replace('export type RepairRejectionParty = "customer" | "shipping";', 'export type RepairRejectionParty = "customer" | "technician";')
follow = follow.replace('if (/(شحن|شركة الشحن|shipping|carrier)/i.test(normalized)) return "shipping";', 'if (/(فني|الفني|technician)/i.test(normalized)) return "technician";')
follow = follow.replace('return party === "shipping" ? "مرفوض من الفني" : "مرفوض من العميل";', 'return party === "technician" ? "مرفوض من الفني" : "مرفوض من العميل";')
follow = follow.replace('  "قيد الإنتظار",\n  "جاري الصيانة",', '  "قيد الإنتظار",\n  "تم الاستلام من الفني",\n  "جاري الصيانة",')
follow = follow.replace('  if (status === "received") return "قيد الإنتظار";\n  if (status === "under_inspection" || status === "in_progress")', '  if (status === "received") return "قيد الإنتظار";\n  if (status === "received_by_technician") return "تم الاستلام من الفني";\n  if (status === "under_inspection" || status === "in_progress")')
follow_path.write_text(follow, encoding='utf-8')

customer_followups_path = ROOT / 'convex/customerFollowUps.ts'
customer_followups = customer_followups_path.read_text(encoding='utf-8')
customer_followups = customer_followups.replace('const rejectionPartyValidator = v.union(v.literal("customer"), v.literal("shipping"));', 'const rejectionPartyValidator = v.union(v.literal("customer"), v.literal("technician"));')
customer_followups_path.write_text(customer_followups, encoding='utf-8')

ops_path = ROOT / 'convex/operationFollowUps.ts'
ops = ops_path.read_text(encoding='utf-8')
ops = ops.replace('const OPEN_REPAIR_STATUSES = ["received", "under_inspection", "awaiting_approval", "in_progress", "ready", "rejected_by_technician"] as const;', 'const OPEN_REPAIR_STATUSES = ["received", "received_by_technician", "under_inspection", "awaiting_approval", "in_progress", "ready"] as const;')
ops = ops.replace('const REPAIR_TERMINAL = new Set(["delivered", "cancelled"]);', 'const REPAIR_TERMINAL = new Set(["delivered", "cancelled", "rejected_by_technician"]);')
ops_path.write_text(ops, encoding='utf-8')
''')
if assert_marker not in s:
    raise SystemExit("production assertion marker not found in transformer")
s = s.replace(assert_marker, semantic_cleanup + assert_marker, 1)
transformer.write_text(s, encoding="utf-8")
subprocess.run([sys.executable, "-m", "py_compile", str(transformer)], check=True)
subprocess.run([sys.executable, str(transformer)], check=True)

rules_path = ROOT / "shared/businessRules.ts"
rules = rules_path.read_text(encoding="utf-8")
start = rules.index("export const REPAIR_STATUSES = [")
comment_start = rules.rfind("/**", 0, start)
end = rules.index("\n\nexport const DELIVERY_STATUSES", start)
repair_section = '''/**
 * دورة الصيانة التجارية الموحدة.
 * لا توجد لشركة الشحن أي حالة قرار داخل الصيانة.
 * يجب تسجيل استلام الفني قبل بدء الفحص أو الصيانة.
 */
export const REPAIR_STATUSES = [
  "received",
  "received_by_technician",
  "under_inspection",
  "awaiting_approval",
  "in_progress",
  "ready",
  "delivered",
  "cancelled",
  "rejected_by_technician",
] as const;
export type RepairStatus = (typeof REPAIR_STATUSES)[number];
export type RepairLifecycleStatus =
  | "pending"
  | "technician_received"
  | "in_progress"
  | "new_issue"
  | "repaired"
  | "delivered_to_customer"
  | "rejected_by_customer"
  | "rejected_by_technician";

export const REPAIR_STATUS_LABELS: Readonly<Record<RepairLifecycleStatus, string>> = {
  pending: "قيد الإنتظار",
  technician_received: "تم الاستلام من الفني",
  in_progress: "جاري الصيانة",
  new_issue: "ظهور مشكلة جديدة",
  repaired: "تم الإصلاح",
  delivered_to_customer: "تم التسليم للعميل",
  rejected_by_customer: "مرفوض من العميل",
  rejected_by_technician: "مرفوض من الفني",
};

export function isRepairStatus(value: string): value is RepairStatus {
  return (REPAIR_STATUSES as readonly string[]).includes(value);
}

export function normalizeRepairStatus(value: string): RepairLifecycleStatus | null {
  if (value === "received") return "pending";
  if (value === "received_by_technician") return "technician_received";
  if (value === "under_inspection" || value === "in_progress") return "in_progress";
  if (value === "awaiting_approval") return "new_issue";
  if (value === "ready") return "repaired";
  if (value === "delivered") return "delivered_to_customer";
  if (value === "cancelled") return "rejected_by_customer";
  if (value === "rejected_by_technician") return "rejected_by_technician";
  return null;
}

export function repairStatusLabel(value: string): string {
  const normalized = normalizeRepairStatus(value);
  return normalized ? REPAIR_STATUS_LABELS[normalized] : value;
}

export const REPAIR_TRANSITIONS: Readonly<Record<RepairStatus, readonly RepairStatus[]>> = {
  received: ["received_by_technician", "cancelled"],
  received_by_technician: ["under_inspection", "cancelled", "rejected_by_technician"],
  under_inspection: ["awaiting_approval", "in_progress", "cancelled", "rejected_by_technician"],
  awaiting_approval: ["in_progress", "cancelled", "rejected_by_technician"],
  in_progress: ["ready", "awaiting_approval", "cancelled", "rejected_by_technician"],
  ready: ["delivered", "in_progress", "cancelled", "rejected_by_technician"],
  rejected_by_technician: [],
  delivered: [],
  cancelled: [],
};
'''
rules_path.write_text(rules[:comment_start] + repair_section + rules[end:], encoding="utf-8")

repairs_path = ROOT / "convex/repairs.ts"
repairs = repairs_path.read_text(encoding="utf-8")
repairs = repairs.replace('["received", "under_inspection", "awaiting_approval", "in_progress", "rejected_by_technician"].includes(repair.status)', '["received", "received_by_technician", "under_inspection", "awaiting_approval", "in_progress"].includes(repair.status)')
repairs = repairs.replace("لا يمكن تعديل تفاصيل الصيانة بعد التسليم أو رفض العميل", "لا يمكن تعديل تفاصيل الصيانة بعد انتهاء أو رفض أمر الصيانة")
repairs = repairs.replace("لا يمكن التحصيل لأمر مرفوض من العميل أو مسلم", "لا يمكن التحصيل لأمر صيانة مرفوض أو مُسلَّم")
repairs_path.write_text(repairs, encoding="utf-8")

status_dashboard_path = ROOT / "convex/operationStatusDashboard.ts"
status_dashboard = status_dashboard_path.read_text(encoding="utf-8")
status_dashboard = status_dashboard.replace("received_by_technician: 0,", "technician_received: 0,")
status_dashboard_path.write_text(status_dashboard, encoding="utf-8")

ui_path = ROOT / "src/components/RepairsPage.tsx"
ui = ui_path.read_text(encoding="utf-8")
ui = ui.replace("repairCounts?.received_by_technician", "repairCounts?.technician_received")
ui_path.write_text(ui, encoding="utf-8")

test_path = ROOT / "tests/dashboardOperationalLifecycle.test.ts"
test_path.write_text(r'''import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canTransition, REPAIR_TRANSITIONS, normalizeRepairStatus, repairStatusLabel } from "../shared/businessRules.ts";

const repairsSource = readFileSync(new URL("../convex/repairs.ts", import.meta.url), "utf8");
const followUpRulesSource = readFileSync(new URL("../shared/customerFollowUpRules.ts", import.meta.url), "utf8");

test("repair lifecycle requires technician receipt and has technician rejection only", () => {
  assert.equal(canTransition(REPAIR_TRANSITIONS, "received", "received_by_technician"), true);
  assert.equal(canTransition(REPAIR_TRANSITIONS, "received", "under_inspection"), false);
  assert.equal(canTransition(REPAIR_TRANSITIONS, "received", "in_progress"), false);
  assert.equal(canTransition(REPAIR_TRANSITIONS, "received_by_technician", "under_inspection"), true);
  assert.equal(normalizeRepairStatus("received_by_technician"), "technician_received");
  assert.equal(repairStatusLabel("received_by_technician"), "تم الاستلام من الفني");
  assert.equal(repairStatusLabel("rejected_by_technician"), "مرفوض من الفني");
  assert.doesNotMatch(repairsSource, /rejected_by_shipping/);
  assert.doesNotMatch(repairsSource, /مرفوض من شركة الشحن/);
  assert.doesNotMatch(followUpRulesSource, /rejected_by_shipping|شركة الشحن/);
});

test("technician rejection uses the protected accounting reversal path", () => {
  assert.match(repairsSource, /isRejection = args\.status === "cancelled" \|\| args\.status === "rejected_by_technician"/);
  assert.match(repairsSource, /يجب استرداد عربون الصيانة بالكامل قبل الرفض/);
  assert.match(repairsSource, /repairPartReversal/);
  assert.match(repairsSource, /type: "repair_cancel"/);
  assert.match(repairsSource, /reverseRepairRevenueJournal/);
  assert.match(repairsSource, /rejected_by_technician: \[\]/);
});

test("operational dashboard is backend permission-aware and exposes stable drilldowns", () => {
  const source = readFileSync(new URL("../convex/dashboardOperations.ts", import.meta.url), "utf8");
  assert.match(source, /requirePermission/);
  assert.match(source, /view_orders/);
  assert.match(source, /view_repairs/);
  assert.match(source, /view_deliveries/);
  assert.match(source, /drilldown/);
});

test("order dashboard business buckets retain internal workflow states", () => {
  const source = readFileSync(new URL("../convex/dashboardOperations.ts", import.meta.url), "utf8");
  assert.match(source, /pending/);
  assert.match(source, /preparing/);
  assert.match(source, /ready/);
  assert.match(source, /handed_to_shipping/);
});
''', encoding="utf-8")

for path in [ROOT / "shared", ROOT / "convex", ROOT / "src"]:
    for file in path.rglob("*"):
        if file.is_file() and file.suffix in {".ts", ".tsx"}:
            text = file.read_text(encoding="utf-8")
            if "rejected_by_shipping" in text or "مرفوض من شركة الشحن" in text:
                raise SystemExit(f"obsolete shipping rejection remains in {file}")

print("Dashboard redesign finalization complete.")
