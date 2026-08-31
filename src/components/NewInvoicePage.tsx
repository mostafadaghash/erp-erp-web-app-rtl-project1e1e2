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
import { useCurrency } from "../lib/utils";

interface NewInvoicePageProps {
  onNavigate: (page: Page) => void;
}

interface CartItem {
  productId: Id<"products">;
  productName: string;
  sku: string;
  unit: string;
  availableStock: number;
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
  const paymentMethods = useQuery(api.paymentMethods.listActive) ?? [];
  const paymentDefaults = useQuery(api.paymentMethods.defaultsForBranch, canCollect ? {} : "skip") ?? [];
  const { formatAmount, formatCurrency } = useCurrency();
  const requestId = useRef(crypto.randomUUID());
  const productSearchRef = useRef<HTMLInputElement>(null);
  const invoiceDiscountRef = useRef<HTMLInputElement>(null);
  const paidAmountRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<() => Promise<void>>(async () => undefined);
  const [saving, setSaving] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [discount, setDiscount] = useState(0);
  const [paid, setPaid] = useState(0);
  const [accountId, setAccountId] = useState("");
  const [paymentMethodCode, setPaymentMethodCode] = useState("cash");
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
        sku: product.sku,
        unit: product.unit ?? "قطعة",
        availableStock: product.stock,
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

  const updateItemDiscount = (productId: string, nextDiscount: number) => {
    const boundedDiscount = Math.max(0, Math.min(100, nextDiscount || 0));
    setCart(cart.map(i =>
      i.productId === productId
        ? { ...i, discount: boundedDiscount, total: i.quantity * i.unitPrice * (1 - boundedDiscount / 100) }
        : i
    ));
  };

  const subtotal = cart.reduce((s, i) => s + i.total, 0);
  const discountAmount = (subtotal * discount) / 100;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = (afterDiscount * taxRate) / 100;
  const total = afterDiscount + taxAmount;
  const remaining = total - paid;
  const selectedPaymentMethod = paymentMethods.find((method) => method.code === paymentMethodCode);
  const eligibleAccounts = selectedPaymentMethod?.requiresAccount ? accounts.filter((account) => selectedPaymentMethod.allowedAccountTypes.length === 0 || selectedPaymentMethod.allowedAccountTypes.includes(account.type)) : [];

  useEffect(() => {
    if (!selectedPaymentMethod) return;
    if (!selectedPaymentMethod.requiresAccount) { setPaid(0); setAccountId(""); return; }
    if (eligibleAccounts.some((account) => account._id === accountId)) return;
    const configuredDefault = paymentDefaults.find((item) => item.paymentMethodCode === selectedPaymentMethod.code);
    const nextAccount = eligibleAccounts.find((account) => account._id === configuredDefault?.accountId) ?? eligibleAccounts[0];
    setAccountId(nextAccount?._id ?? "");
  }, [accountId, eligibleAccounts, paymentDefaults, selectedPaymentMethod]);

  const handleSelectCustomer = (id: string) => {
    if (!id) {
      setCustomerId("");
      setCustomerName("");
      setCustomerPhone("");
      return;
    }
    const c = customers.find(c => c._id === id);
    if (c) {
      setCustomerId(id);
      setCustomerName(c.name);
      setCustomerPhone(c.phone);
    }
  };

  const resetInvoice = () => {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerId("");
    setDiscount(0);
    setPaid(0);
    setAccountId("");
    setPaymentMethodCode("cash");
    setNotes("");
    setProductSearch("");
    requestId.current = crypto.randomUUID();
    window.setTimeout(() => productSearchRef.current?.focus(), 0);
  };

  const handleSubmit = async () => {
    if (cart.length === 0) return toast.error("أضف منتجاً واحداً على الأقل");
    if (!customerName) return toast.error("أدخل اسم العميل");
    if (!selectedPaymentMethod) return toast.error("اختر طريقة السداد");
    if (selectedPaymentMethod.requiresAccount && paid <= 0) return toast.error("أدخل المبلغ المدفوع أو اختر آجل");
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
        paymentMethodCode,
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

  const focusLastQuantity = () => {
    const quantityInputs = Array.from(document.querySelectorAll<HTMLInputElement>("[data-invoice-quantity]"));
    const lastInput = quantityInputs.at(-1);
    lastInput?.focus();
    lastInput?.select();
  };

  useEffect(() => {
    const handleKeyboardShortcut = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        productSearchRef.current?.focus();
        productSearchRef.current?.select();
      }
      if (event.key === "F5") {
        event.preventDefault();
        focusLastQuantity();
      }
      if (event.key === "F7") {
        event.preventDefault();
        invoiceDiscountRef.current?.focus();
        invoiceDiscountRef.current?.select();
      }
      if (event.key === "F8") {
        event.preventDefault();
        setCart(current => current.length > 0 ? current.slice(0, -1) : current);
      }
      if (event.key === "F9") {
        event.preventDefault();
        void submitRef.current();
      }
      if (event.key === "F10") {
        event.preventDefault();
        resetInvoice();
      }
      if (event.key === "F11") {
        event.preventDefault();
        paidAmountRef.current?.focus();
        paidAmountRef.current?.select();
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

  const invoiceDate = new Date().toLocaleDateString("ar-EG-u-nu-latn");

  return (
    <div className="erp-pos-page pos-invoice-v3" data-testid="new-invoice-page">
      <header className="erp-pos-header pos-invoice-command-header">
        <div className="pos-invoice-heading">
          <div className="pos-invoice-title-icon"><ShoppingCart className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h1 className="truncate">فاتورة بيع جديدة</h1>
            <div className="pos-invoice-meta-line">
              <span>رقم الفاتورة: تلقائي</span>
              <span>{invoiceDate}</span>
            </div>
          </div>
        </div>
        <div className="pos-invoice-header-actions">
          <button type="button" onClick={() => onNavigate("invoices")} className="pos-header-action">
            <ArrowRight className="h-4 w-4" /> سجل الفواتير
          </button>
          <button type="button" onClick={resetInvoice} className="pos-header-action">جديد <kbd>F10</kbd></button>
          <button type="button" onClick={() => void handleSubmit()} disabled={saving || cart.length === 0} className="pos-header-action pos-header-action-primary">
            {saving ? "جارٍ الحفظ..." : "حفظ"} <kbd>F9</kbd>
          </button>
        </div>
      </header>

      <div className="erp-pos-grid pos-invoice-layout">
        <section className="erp-pos-main pos-invoice-workspace">
          <div className="erp-pos-search-area pos-invoice-search-zone">
            <Search className="pos-invoice-search-icon" />
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
            <span className="erp-pos-search-hint"><Barcode className="h-3.5 w-3.5" />F2 بحث سريع</span>

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
                      <p className="mt-1 text-xs text-slate-400">{p.sku} · المتاح {formatAmount(p.stock)}</p>
                    </div>
                    <span className="shrink-0 text-sm font-black text-[var(--erp-accent-strong)]">{formatCurrency(p.sellPrice)}</span>
                  </button>
                ))}
                {filteredProducts.length === 0 && <p className="py-5 text-center text-sm text-slate-400">لا توجد أصناف مطابقة</p>}
              </div>
            )}
          </div>

          <div className="erp-pos-customer-strip pos-invoice-customer-row">
            <label>
              <span className="form-label flex items-center gap-1.5"><UserRound className="h-4 w-4 text-[var(--erp-accent)]" />الحساب / العميل</span>
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
            <label>
              <span className="form-label">ملاحظات</span>
              <input data-testid="invoice-notes" className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات الفاتورة..." />
            </label>
          </div>

          <div className="erp-pos-cart pos-invoice-items-grid">
            <div className="pos-invoice-items-title">
              <span>أصناف الفاتورة</span>
              <span>{formatAmount(cart.length)} صنف</span>
            </div>
            <table className="data-table pos-invoice-table">
              <thead>
                <tr>
                  <th className="w-12">#</th>
                  <th className="w-28">رقم الصنف</th>
                  <th>اسم الصنف</th>
                  <th className="w-20">الوحدة</th>
                  <th className="w-20">المتاح</th>
                  <th className="w-36">الكمية</th>
                  <th className="w-28">السعر</th>
                  <th className="w-24">خصم %</th>
                  <th className="w-32">الإجمالي</th>
                  <th className="w-14" aria-label="حذف" />
                </tr>
              </thead>
              <tbody>
                {cart.length > 0 ? cart.map((item, index) => (
                  <tr key={item.productId}>
                    <td className="text-xs font-black text-slate-400">{index + 1}</td>
                    <td className="text-xs font-bold text-slate-500">{item.sku}</td>
                    <td><p className="font-black text-slate-800">{item.productName}</p></td>
                    <td className="text-sm font-bold">{item.unit}</td>
                    <td className="text-sm font-bold">{formatAmount(item.availableStock)}</td>
                    <td>
                      <div className="pos-invoice-quantity-control">
                        <button type="button" onClick={() => updateQuantity(item.productId, item.quantity - 1)} aria-label={`تقليل كمية ${item.productName}`}><Minus className="h-3.5 w-3.5" /></button>
                        <input
                          data-invoice-quantity
                          aria-label={`كمية ${item.productName}`}
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => updateQuantity(item.productId, Number(e.target.value))}
                        />
                        <button type="button" onClick={() => updateQuantity(item.productId, item.quantity + 1)} aria-label={`زيادة كمية ${item.productName}`}><Plus className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                    <td className="font-bold">{formatCurrency(item.unitPrice)}</td>
                    <td>
                      <input
                        className="pos-line-discount"
                        type="number"
                        min="0"
                        max="100"
                        aria-label={`خصم ${item.productName}`}
                        value={item.discount}
                        onChange={e => updateItemDiscount(item.productId, Number(e.target.value))}
                      />
                    </td>
                    <td className="font-black text-[var(--erp-accent-strong)]">{formatCurrency(item.total)}</td>
                    <td>
                      <button type="button" onClick={() => removeFromCart(item.productId)} className="pos-line-delete" aria-label={`حذف ${item.productName}`}><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                )) : (
                  <tr className="pos-invoice-empty-row">
                    <td colSpan={10}>
                      <div className="erp-pos-empty">
                        <div>
                          <div className="mx-auto mb-3 grid place-items-center"><Barcode className="h-8 w-8" /></div>
                          <p className="font-black">ابدأ بالبحث عن صنف أو امسح الباركود</p>
                          <p className="mt-2">اكتب اسم الصنف أو الكود ثم اضغط Enter لإضافته مباشرة</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="erp-pos-summary pos-invoice-summary-panel">
          <div className="erp-pos-total pos-invoice-total-card">
            <h2>ملخص الفاتورة</h2>
            <div className="pos-invoice-total-caption">
              <span>الإجمالي النهائي</span>
              <span>{formatAmount(cart.length)} صنف</span>
            </div>
            <p data-testid="new-invoice-total" data-value={total} className="erp-pos-total-value">{formatCurrency(total)}</p>
            <div className="erp-pos-document-meta"><span>رقم الفاتورة: تلقائي</span><span>{invoiceDate}</span></div>
          </div>

          <div className="erp-pos-summary-body">
            <div className="pos-invoice-summary-totals">
              <div className="erp-pos-summary-row"><span>المجموع الفرعي</span><strong>{formatCurrency(subtotal)}</strong></div>
              <div className="erp-pos-summary-row">
                <span>خصم الفاتورة</span>
                <label className="pos-summary-percent-input">
                  <input ref={invoiceDiscountRef} type="number" value={discount} onChange={e => setDiscount(Number(e.target.value))} min="0" max="100" aria-label="نسبة خصم الفاتورة" />
                  <span>%</span>
                </label>
              </div>
              {discountAmount > 0 && <div className="erp-pos-summary-row text-red-500"><span>قيمة الخصم</span><strong>- {formatCurrency(discountAmount)}</strong></div>}
              <div className="erp-pos-summary-row"><span>الضريبة ({formatAmount(taxRate)}%)</span><strong>{formatCurrency(taxAmount)}</strong></div>
              <div className="pos-invoice-grand-total-row"><span>الإجمالي الكلي</span><strong>{formatCurrency(total)}</strong></div>
            </div>

            <div className="pos-invoice-payment-stack">
              <label><span className="form-label flex items-center gap-1.5"><CreditCard className="h-4 w-4 text-[var(--erp-blue)]" />طريقة السداد</span><select data-testid="invoice-payment-method" className="form-input" value={paymentMethodCode} onChange={(event) => setPaymentMethodCode(event.target.value)}>{paymentMethods.map((method) => <option key={method.code} value={method.code}>{method.name}</option>)}</select></label>
              <label><span className="form-label">الخزنة / الحساب المستلم</span><select data-testid="invoice-payment-account" className="form-input" value={accountId} onChange={e => setAccountId(e.target.value)} disabled={!canCollect || !selectedPaymentMethod?.requiresAccount}><option value="">{!selectedPaymentMethod?.requiresAccount ? "البيع الآجل لا يحرك أي خزنة" : canCollect ? "اختر الخزينة أو الحساب" : "يسجل مسؤول التحصيل الدفعة لاحقًا"}</option>{eligibleAccounts.map(account => <option key={account._id} value={account._id}>{account.name}</option>)}</select></label>
              <label>
                <span className="form-label">المبلغ المدفوع</span>
                <input ref={paidAmountRef} data-testid="invoice-paid-amount" type="number" className="form-input pos-paid-input" value={paid} onChange={e => setPaid(Number(e.target.value))} min="0" max={total} disabled={!selectedPaymentMethod?.requiresAccount} />
              </label>
              <div className={`pos-invoice-balance-card ${remaining > 0 ? "is-due" : "is-settled"}`}>
                <span>{cart.length === 0 ? "المتبقي" : remaining > 0 ? "المتبقي على العميل" : "الفاتورة مسددة"}</span>
                <strong>{formatCurrency(Math.max(0, remaining))}</strong>
              </div>
            </div>

            <button data-testid="invoice-submit" onClick={handleSubmit} disabled={saving || cart.length === 0} className="erp-pos-save-action pos-invoice-issue-button">
              <CheckCircle2 className="h-5 w-5" />
              {saving ? "جارٍ إصدار الفاتورة..." : "إصدار الفاتورة"}
            </button>
          </div>
        </aside>
      </div>

      <nav className="pos-invoice-bottom-bar" aria-label="اختصارات فاتورة المبيعات">
        <button type="button" onClick={() => { productSearchRef.current?.focus(); productSearchRef.current?.select(); }}><kbd>F2</kbd><span>بحث صنف</span></button>
        <button type="button" onClick={focusLastQuantity} disabled={cart.length === 0}><kbd>F5</kbd><span>الكمية</span></button>
        <button type="button" onClick={() => { invoiceDiscountRef.current?.focus(); invoiceDiscountRef.current?.select(); }}><kbd>F7</kbd><span>خصم</span></button>
        <button type="button" onClick={() => setCart(current => current.length > 0 ? current.slice(0, -1) : current)} disabled={cart.length === 0}><kbd>F8</kbd><span>حذف آخر صنف</span></button>
        <button type="button" onClick={() => void handleSubmit()} disabled={saving || cart.length === 0}><kbd>F9</kbd><span>حفظ</span></button>
        <button type="button" onClick={resetInvoice}><kbd>F10</kbd><span>فاتورة جديدة</span></button>
        <button type="button" onClick={() => { paidAmountRef.current?.focus(); paidAmountRef.current?.select(); }}><kbd>F11</kbd><span>سداد</span></button>
        <button type="button" onClick={() => onNavigate("invoices")}><ArrowRight className="h-4 w-4" /><span>سجل الفواتير</span></button>
      </nav>
    </div>
  );
}
