import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Boxes, Search, Truck, Users } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { usePermission } from "../lib/access";
import type { WorkspaceRecordTarget } from "../workspace/WorkspaceRecordPage";
import type { Page } from "./ERPApp";

export function GlobalSearch({
  onNavigate,
  onOpenRecord,
}: {
  onNavigate: (page: Page) => void;
  onOpenRecord?: (target: WorkspaceRecordTarget) => void;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const me = useQuery(api.employees.me);
  const canProducts = usePermission("view_products");
  const canCustomers = usePermission("view_customers");
  const canSuppliers = usePermission("view_suppliers");
  const branchId = me?.branchId as Id<"branches"> | undefined;
  const products = useQuery(api.products.list, canProducts && value.trim().length >= 2 ? { search: value.trim(), branchId } : "skip") ?? [];
  const customers = useQuery(api.customers.list, canCustomers && branchId && value.trim().length >= 2 ? { branchId } : "skip") ?? [];
  const suppliers = useQuery(api.suppliers.list, canSuppliers && value.trim().length >= 2 ? {} : "skip") ?? [];
  const normalized = value.trim().toLocaleLowerCase("ar-EG");
  const results = useMemo(() => [
    ...products.slice(0, 4).map(row => ({
      key: String(row._id),
      title: row.name,
      subtitle: `صنف — ${row.sku}`,
      page: "inventory" as Page,
      icon: Boxes,
      target: { type: "product", id: String(row._id), title: row.name, group: "المخزون" } satisfies WorkspaceRecordTarget,
    })),
    ...customers
      .filter(row => row.name.toLocaleLowerCase("ar-EG").includes(normalized) || row.phone.includes(value.trim()))
      .slice(0, 4)
      .map(row => ({
        key: String(row._id),
        title: row.name,
        subtitle: `عميل — ${row.phone}`,
        page: "customers" as Page,
        icon: Users,
        target: { type: "customer", id: String(row._id), title: `العميل: ${row.name}`, group: "العملاء" } satisfies WorkspaceRecordTarget,
      })),
    ...suppliers
      .filter(row => row.name.toLocaleLowerCase("ar-EG").includes(normalized) || row.phone.includes(value.trim()))
      .slice(0, 4)
      .map(row => ({
        key: String(row._id),
        title: row.name,
        subtitle: `مورد — ${row.phone}`,
        page: "suppliers" as Page,
        icon: Truck,
        target: { type: "supplier", id: String(row._id), title: `المورد: ${row.name}`, group: "المشتريات" } satisfies WorkspaceRecordTarget,
      })),
  ], [products, customers, suppliers, normalized, value]);

  return (
    <div className="relative hidden min-w-0 flex-1 md:block" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input className="form-input w-full pr-9" placeholder="بحث شامل: صنف، عميل، مورد…" value={value} onFocus={() => setFocused(true)} onChange={event => { setValue(event.target.value); setFocused(true); }} aria-label="البحث الشامل" />
      {focused && value.trim().length >= 2 && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-full min-w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
          {results.map(result => {
            const Icon = result.icon;
            return (
              <button
                key={`${result.page}-${result.key}`}
                className="flex w-full items-center gap-3 rounded-xl p-3 text-right hover:bg-slate-50"
                onMouseDown={event => event.preventDefault()}
                onClick={() => {
                  if (onOpenRecord) onOpenRecord(result.target);
                  else onNavigate(result.page);
                  setFocused(false);
                  setValue("");
                }}
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600"><Icon className="h-4 w-4" /></span>
                <span><strong className="block text-sm text-slate-800">{result.title}</strong><small className="text-slate-500">{result.subtitle}</small></span>
              </button>
            );
          })}
          {results.length === 0 && <p className="p-4 text-center text-sm text-slate-500">لا توجد نتائج مطابقة.</p>}
        </div>
      )}
    </div>
  );
}
