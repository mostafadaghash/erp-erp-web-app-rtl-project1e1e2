import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Bell, Boxes, CalendarClock, ClipboardList, Search, Truck, Users } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { usePermission } from "../lib/access";
import type { WorkspaceRecordTarget } from "../workspace/WorkspaceRecordPage";
import type { Page } from "./ERPApp";

const NOTIFICATION_SEEN_STORAGE_PREFIX = "business-tech-erp.notifications.seen.v2";
const MAX_SEEN_NOTIFICATION_KEYS = 600;

function readSeenNotificationKeys(storageKey: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((key): key is string => typeof key === "string").slice(-MAX_SEEN_NOTIFICATION_KEYS)
      : [];
  } catch {
    return [];
  }
}

export function GlobalSearch({
  onNavigate,
  onOpenRecord,
}: {
  onNavigate: (page: Page) => void;
  onOpenRecord?: (target: WorkspaceRecordTarget) => void;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [seenNotificationKeys, setSeenNotificationKeys] = useState<string[]>([]);
  const [seenStateUserId, setSeenStateUserId] = useState<string | null>(null);
  const me = useQuery(api.employees.me);
  const canProducts = usePermission("view_products");
  const canCustomers = usePermission("view_customers");
  const canSuppliers = usePermission("view_suppliers");
  const canOrders = usePermission("view_orders");
  const canFollowUps = usePermission("view_follow_ups");
  const branchId = me?.branchId as Id<"branches"> | undefined;
  const products = useQuery(api.products.list, canProducts && value.trim().length >= 2 ? { search: value.trim(), branchId } : "skip") ?? [];
  const customers = useQuery(api.customers.list, canCustomers && branchId && value.trim().length >= 2 ? { branchId } : "skip") ?? [];
  const suppliers = useQuery(api.suppliers.list, canSuppliers && value.trim().length >= 2 ? {} : "skip") ?? [];
  const pendingOrders = useQuery(api.orderLifecycle.pendingNotifications, canOrders ? {} : "skip") ?? [];
  const pendingFollowUps = useQuery(api.customerFollowUps.list, canFollowUps ? { status: "pending", limit: 20 } : "skip") ?? [];
  const lowStockProducts = useQuery(api.products.list, canProducts ? { lowStock: true } : "skip") ?? [];
  const normalized = value.trim().toLocaleLowerCase("ar-EG");
  const userId = me?.id ? String(me.id) : null;
  const seenStorageKey = userId ? `${NOTIFICATION_SEEN_STORAGE_PREFIX}:${userId}` : null;

  const notificationKeys = useMemo(() => [
    ...pendingOrders.map(row => `order:${String(row.id)}:${row.createdAt}`),
    ...pendingFollowUps.map(row => `follow-up:${String(row._id)}:${row.updatedAt}:${row.status}:${row.followUpDate}`),
    ...lowStockProducts.map(row => `stock:${String(row._id)}:${row.stock}:${row.minStock}`),
  ], [pendingOrders, pendingFollowUps, lowStockProducts]);
  const notificationSignature = notificationKeys.join("|");
  const seenNotificationSet = useMemo(() => new Set(seenNotificationKeys), [seenNotificationKeys]);
  const seenStateReady = Boolean(userId && seenStateUserId === userId);
  const unreadCount = seenStateReady
    ? notificationKeys.filter(key => !seenNotificationSet.has(key)).length
    : 0;
  const currentNotificationCount = notificationKeys.length;

  useEffect(() => {
    if (!userId || !seenStorageKey) {
      setSeenNotificationKeys([]);
      setSeenStateUserId(null);
      return;
    }
    const syncReadState = () => {
      setSeenNotificationKeys(readSeenNotificationKeys(seenStorageKey));
      setSeenStateUserId(userId);
    };
    syncReadState();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === seenStorageKey) syncReadState();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") syncReadState();
    };
    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [seenStorageKey, userId]);

  const markCurrentNotificationsRead = () => {
    if (!userId || !seenStorageKey) return;
    setSeenNotificationKeys((previous) => {
      const merged = [...new Set([...previous, ...notificationKeys])].slice(-MAX_SEEN_NOTIFICATION_KEYS);
      try {
        window.localStorage.setItem(seenStorageKey, JSON.stringify(merged));
      } catch {
        // Read state remains valid for the current session when storage is unavailable.
      }
      return merged;
    });
    setSeenStateUserId(userId);
  };

  useEffect(() => {
    if (notificationsOpen && seenStateReady) markCurrentNotificationsRead();
    // notificationSignature intentionally retriggers while the notification center is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationsOpen, notificationSignature, seenStateReady]);

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
    <div
      className="hidden min-w-0 flex-1 items-center gap-2 md:flex"
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false);
          setNotificationsOpen(false);
        }
      }}
    >
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="form-input w-full pr-9"
          placeholder="بحث شامل: صنف، عميل، مورد…"
          value={value}
          onFocus={() => { setFocused(true); setNotificationsOpen(false); }}
          onChange={event => { setValue(event.target.value); setFocused(true); setNotificationsOpen(false); }}
          aria-label="البحث الشامل"
        />
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

      {(canOrders || canFollowUps || canProducts) && (
        <div className="relative shrink-0">
          <button
            type="button"
            data-testid="header-operational-notifications"
            className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 transition hover:bg-slate-50"
            onClick={() => {
              const nextOpen = !notificationsOpen;
              setNotificationsOpen(nextOpen);
              setFocused(false);
              if (nextOpen && seenStateReady) markCurrentNotificationsRead();
            }}
            aria-expanded={notificationsOpen}
            title={unreadCount > 0 ? `${unreadCount} إشعار جديد` : "الإشعارات"}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span data-testid="header-notification-unread-count" className="absolute -left-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
          {notificationsOpen && (
            <div data-testid="header-operational-notifications-menu" className="absolute left-0 top-[calc(100%+8px)] z-50 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
              <div className="flex items-center justify-between px-2 pb-2 pt-1">
                <span className="text-xs font-black text-slate-500">الإشعارات</span>
                <span className="text-[10px] font-bold text-slate-400">تمت قراءة الظاهر</span>
              </div>
              {canOrders && (
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl p-3 text-right hover:bg-indigo-50"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => { onNavigate("orders"); setNotificationsOpen(false); }}
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><ClipboardList className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><strong className="block text-sm text-slate-800">طلبات بيع بانتظار المراجعة</strong><small className="text-slate-500">{pendingOrders.length} طلب قيد الانتظار</small></span>
                  {pendingOrders.length > 0 && <span className="badge badge-warning">{pendingOrders.length}</span>}
                </button>
              )}
              {canFollowUps && (
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl p-3 text-right hover:bg-emerald-50"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => { onNavigate("follow-ups"); setNotificationsOpen(false); }}
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><CalendarClock className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><strong className="block text-sm text-slate-800">متابعات عميل مفتوحة</strong><small className="text-slate-500">{pendingFollowUps.length} متابعة تحتاج إجراء</small></span>
                  {pendingFollowUps.length > 0 && <span className="badge badge-success">{pendingFollowUps.length}</span>}
                </button>
              )}
              {canProducts && (
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl p-3 text-right hover:bg-violet-50"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => { onNavigate("inventory"); setNotificationsOpen(false); }}
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-700"><Boxes className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><strong className="block text-sm text-slate-800">تنبيهات المخزون</strong><small className="text-slate-500">{lowStockProducts.length} صنف عند أو تحت حد إعادة الطلب</small></span>
                  {lowStockProducts.length > 0 && <span className="badge badge-warning">{lowStockProducts.length}</span>}
                </button>
              )}
              {currentNotificationCount === 0 && <p className="px-3 py-4 text-center text-sm text-slate-400">لا توجد إشعارات حالية.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
