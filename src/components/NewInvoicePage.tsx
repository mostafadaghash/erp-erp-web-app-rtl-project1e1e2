import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import type { Page } from "./ERPApp";
import {
  ArrowRight,
  Barcode,
  CheckCircle2,
  CreditCard,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
} from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";
import { usePermission } from "../lib/access";

interface NewInvoicePageProps {
  onNavigate: (page: Page) => void;
}

interface CartItem {
  productId: Id<"products">;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export function NewInvoicePage({ onNavigate }: NewInvoicePageProps) {
  const products = (useQuery(api.products.list, {}) ?? []).filter((product) => product.isActive);
  const customers = useQuery(api.customers.list) ?? [];
  const settings = useQuery(api.settings.getPublic);
  const createInvoice = useMutation(api.invoices.create);
  const canCollect = usePermission("record_collections");
  const accounts = useQuery(api.finance.collectionAccountPicker, canCollect ? {} : "skip") ?? [];
  const requestId = useRef(crypto.randomUUID());
  const productSearchRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<() => Promise<void>>(async () => undefined);
  const [saving, setSaving] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [discount, setDiscount] = useState(0);
  const [paid, setPaid] = useState(0);
  const [accountId, setAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const taxRate = settings?.taxRate ?? 14;

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.sku.toLowerCase().includes(productSearch.toLowerCase())
  );

  const addToCart = (product: any) => {
    const existing = cart.find(i => i.productId === product._id);
    if (existing) {
      setCart(cart.map(i =>
        i.productId === product._id
          ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.unitPrice * (1 - i.discount / 100) }
          : i
      ));
    } else {
      setCart([...cart, {
        productId: product._id,
        productName: product.name,
        quantity: 1,
        unitPrice: product.sellPrice,
        discount: 0,
        total: product.sellPrice,
      }]);
    }
    setProductSearch("");
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(i => i.productId !== productId));
  };

  const updateQuantity = (productId: string, qty: number) => {
    if (qty <= 0) return removeFromCart(productId);
    setCart(cart.map(i =>
      i.productId === productId
        ? { ...i, quantity: qty, total: qty * i.unitPrice * (1 - i.discount / 100) }
        : i
    ));
  };

  const subtotal = cart.reduce((s, i) => s + i.total, 0);
  const discountAmount = (subtotal * discount) / 100;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = (afterDiscount * taxRate) / 100;
  const total = afterDiscount + taxAmount;
  const remaining = total - paid;

  const handleSelectCustomer = (id: string) => {
    const c = customers.find(c => c._id === id);
    if (c) {
      setCustomerId(id);
      setCustomerName(c.name);
      setCustomerPhone(c.phone);
    }
  };

  const handleSubmit = async () => {
    if (cart.length === 0) return toast.error("أضف منتجاً واحداً على الأقل");
    if (!customerName) return toast.error("أدخل اسم العميل");
    if (paid > 0 && !accountId) return toast.error("اختر الحساب المالي");
    if (saving) return;
    setSaving(true);
    try {
      await createInvoice({
        customerId: customerId ? customerId as Id<"customers"> : undefined,
        customerName,
        customerPhone: customerPhone || undefined,
        items: cart.map(i => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: i.discount,
          total: i.total,
        })),
        subtotal,
        discount: discountAmount,
        tax: taxAmount,
        total,
        creationRequestId: requestId.current,
        initialPayment: paid > 0 ? { amount: paid, accountId: accountId as Id<"financialAccounts">, requestId: requestId.current } : undefined,
        notes: notes || undefined,
      });
      toast.success("تم إنشاء الفاتورة بنجاح");
      requestId.current = crypto.randomUUID();
      onNavigate("invoices");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ أثناء إنشاء الفاتورة");
    } finally {
      setSaving(false);
    }
  };

  submitRef.current = handleSubmit;

  useEffect(() => {
    const handleKeyboardShortcut = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        productSearchRef.current?.focus();
        productSearchRef.current?.select();
      }
      if (event.key === "F9") {
        event.preventDefault();
        void submitRef.current();
      }
    };

    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, []);

  const addSearchResult = () => {
    const normalizedSearch = productSearch.trim().toLowerCase();
    if (!normalizedSearch) return;
    const exact = filteredProducts.find((product) =>
      product.sku.toLowerCase() === normalizedSearch ||
      product.barcode?.toLowerCase() === normalizedSearch
    );
    const selected = exact ?? filteredProducts[0];
    if (selected) addToCart(selected);
  };

  return (
    <div className="erp-pos-page" data-testid="new-invoice-page">
      <header className="erp-pos-header">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10">
            <ShoppingCart className="h-6 w-6 text-emerald-200" />
          </div>
          <div className="min-w-0">
            <span className="erp-pos-document-badge">نقطة البيع · مستند جديد</span>
            <h1 className="mt-2 truncate text-xl font-black sm:text-2xl">فاتورة مبيعات جديدة</h1>
            <p className="mt-1 text-xs text-slate-300">رقم الفاتورة يُنشأ تلقائيًا عند الإصدار</p>
          </div>
        </div>
        <button onClick={() => onNavigate("invoices")} className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/15">
          <ArrowRight className="h-4 w-4" />
          سجل الفواتير
        </button>
      </header>

      <div className="erp-pos-grid">
        <section className="erp-pos-main">
          <div className="erp-pos-customer-strip">
            <label>
              <span className="form-label flex items-center gap-1.5"><UserRound className="h-4 w-4 text-[var(--erp-accent)]" />الحساب</span>
              <select data-testid="invoice-customer-select" className="form-input" value={customerId} onChange={e => handleSelectCustomer(e.target.value)}>
                <option value="">عميل نقدي / جديد</option>
                {customers.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </label>
            <label>
              <span className="form-label">اسم العميل *</span>
              <input className="form-input" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="اسم العميل" />
            </label>
            <label>
              <span className="form-label">رقم الهاتف</span>
              <input className="form-input" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="01xxxxxxxxx" />
            </label>
          </div>

          <div className="erp-pos-search-area">
            <Search className="absolute right-7 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--erp-accent)]" />
            <input
              ref={productSearchRef}
              data-testid="invoice-product-search"
              className="form-input erp-pos-search-input"
              placeholder="ابحث باسم الصنف أو الكود، أو امسح الباركود..."
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addSearchResult();
                }
              }}
              autoComplete="off"
            />
            <span className="erp-pos-search-hint"><Barcode className="ml-1 inline h-3.5 w-3.5" />بحث سريع F2</span>

            {productSearch && (
              <div className="erp-pos-results">
                {filteredProducts.slice(0, 10).map(p => (
                  <button
                    key={p._id}
                    data-testid="invoice-product-result"
                    data-product-name={p.name}
                    onClick={() => addToCart(p)}
                    className="erp-pos-result"
                  >
                    <div className="min-w-0 text-right">
                      <p className="truncate text-sm font-black text-slate-800">{p.name}</p>
                      <p className="mt-1 text-xs text-slate-400">{p.sku} · المتاح {p.stock.toLocaleString("ar-EG")}</p>
                    </div>
                    <span className="shrink-0 text-sm font-black text-[var(--erp-accent-strong)]">{p.sellPrice.toLocaleString("ar-EG")} ج.م</span>
                  </button>
                ))}
                {filteredProducts.length === 0 && <p className="py-5 text-center text-sm text-slate-400">لا توجد أصناف مطابقة</p>}
              </div>
            )}
          </div>

          <div className="erp-pos-cart">
            {cart.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-14">#</th>
                    <th>اسم الصنف</th>
                    <th className="w-40">الكمية</th>
                    <th className="w-32">سعر البيع</th>
                    <th className="w-32">الإجمالي</th>
                    <th className="w-16" aria-label="حذف" />
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, index) => (
                    <tr key={item.productId}>
                      <td className="text-xs font-black text-slate-400">{index + 1}</td>
                      <td><p className="font-black text-slate-800">{item.productName}</p></td>
                      <td>
                        <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
                          <button onClick={() => updateQuantity(item.productId, item.quantity - 1)} className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100" aria-label={`تقليل كمية ${item.productName}`}><Minus className="h-3.5 w-3.5" /></button>
                          <span className="min-w-8 text-center font-black text-slate-800">{item.quantity.toLocaleString("ar-EG")}</span>
                          <button onClick={() => updateQuantity(item.productId, item.quantity + 1)} className="grid h-7 w-7 place-items-center rounded-md bg-[var(--erp-accent-soft)] text-[var(--erp-accent-strong)] hover:bg-emerald-100" aria-label={`زيادة كمية ${item.productName}`}><Plus className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                      <td className="font-bold">{item.unitPrice.toLocaleString("ar-EG")} ج.م</td>
                      <td className="font-black text-[var(--erp-accent-strong)]">{item.total.toLocaleString("ar-EG")} ج.م</td>
                      <td>
                        <button onClick={() => removeFromCart(item.productId)} className="grid h-8 w-8 place-items-center rounded-lg text-red-400 transition hover:bg-red-50 hover:text-red-600" aria-label={`حذف ${item.productName}`}><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="erp-pos-empty">
                <div>
                  <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-[var(--erp-accent-soft)] text-[var(--erp-accent)]"><Barcode className="h-8 w-8" /></div>
                  <p className="font-black text-slate-700">ابدأ بالبحث عن صنف أو امسح الباركود</p>
                  <p className="mt-2 text-sm text-slate-400">اضغط Enter لإضافة أول نتيجة مباشرة إلى الفاتورة</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="erp-pos-summary">
          <div className="erp-pos-total">
            <h2 className="mb-2 text-xs font-black uppercase tracking-wide text-emerald-100">ملخص الفاتورة</h2>
            <div className="flex items-center justify-between gap-3 text-sm font-bold text-emerald-50">
              <span>إجمالي الفاتورة</span>
              <span>{cart.length.toLocaleString("ar-EG")} صنف</span>
            </div>
            <p data-testid="new-invoice-total" data-value={total} className="erp-pos-total-value">{total.toLocaleString("ar-EG")} <span className="text-base">ج.م</span></p>
          </div>

          <div className="erp-pos-summary-body">
            <div className="space-y-1 border-b border-slate-100 pb-3">
              <div className="erp-pos-summary-row"><span>المجموع الفرعي</span><strong className="text-slate-800">{subtotal.toLocaleString("ar-EG")} ج.م</strong></div>
              <div className="erp-pos-summary-row">
                <span>خصم الفاتورة</span>
                <label className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2">
                  <input type="number" className="w-14 bg-transparent py-1.5 text-center text-sm font-black outline-none" value={discount} onChange={e => setDiscount(Number(e.target.value))} min="0" max="100" aria-label="نسبة خصم الفاتورة" />
                  <span className="text-xs text-slate-400">%</span>
                </label>
              </div>
              {discountAmount > 0 && <div className="erp-pos-summary-row text-red-500"><span>قيمة الخصم</span><strong>- {discountAmount.toLocaleString("ar-EG")} ج.م</strong></div>}
              <div className="erp-pos-summary-row"><span>الضريبة ({taxRate}%)</span><strong className="text-slate-800">{taxAmount.toLocaleString("ar-EG")} ج.م</strong></div>
            </div>

            <div className="mt-4 space-y-3">
              <label>
                <span className="form-label flex items-center gap-1.5"><CreditCard className="h-4 w-4 text-[var(--erp-blue)]" />حساب التحصيل</span>
                <select className="form-input" value={accountId} onChange={e => setAccountId(e.target.value)} disabled={!canCollect || paid <= 0}>
                  <option value="">{canCollect ? "اختر الخزينة أو الحساب" : "يسجل مسؤول التحصيل الدفعة لاحقًا"}</option>
                  {accounts.map(account => <option key={account._id} value={account._id}>{account.name}</option>)}
                </select>
              </label>
              <label>
                <span className="form-label">المبلغ المدفوع</span>
                <input type="number" className="form-input text-lg font-black" value={paid} onChange={e => setPaid(Number(e.target.value))} min="0" max={total} />
              </label>
              <div className={`rounded-xl border p-3 ${remaining > 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                <div className="flex items-center justify-between gap-3 text-sm font-black">
                  <span>{remaining > 0 ? "المتبقي على العميل" : "الفاتورة مسددة"}</span>
                  <span>{Math.max(0, remaining).toLocaleString("ar-EG")} ج.م</span>
                </div>
              </div>
              <label>
                <span className="form-label">ملاحظات</span>
                <textarea data-testid="invoice-notes" className="form-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات تظهر مع المستند..." />
              </label>
            </div>

            <button data-testid="invoice-submit" onClick={handleSubmit} disabled={saving || cart.length === 0} className="btn-primary mt-4 flex w-full items-center justify-center gap-2 py-3 text-base">
              <CheckCircle2 className="h-5 w-5" />
              {saving ? "جارٍ إصدار الفاتورة..." : "إصدار الفاتورة"}
            </button>

            <div className="erp-pos-shortcuts" aria-label="اختصارات الفاتورة">
              <span className="erp-pos-shortcut"><kbd>F2</kbd> بحث الصنف</span>
              <span className="erp-pos-shortcut"><kbd>Enter</kbd> إضافة</span>
              <span className="erp-pos-shortcut"><kbd>F9</kbd> إصدار</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
