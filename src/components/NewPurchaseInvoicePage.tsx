import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  Minus,
  PackagePlus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  Truck,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useCurrency } from "../lib/utils";
import type { Page } from "./ERPApp";
import "../new-purchase-invoice-pos.css";

interface NewPurchaseInvoicePageProps {
  onNavigate: (page: Page) => void;
}

interface PurchaseItem {
  productId: Id<"products">;
  productName: string;
  quantity: number;
  unitCost: number;
  total: number;
}

export function NewPurchaseInvoicePage({ onNavigate }: NewPurchaseInvoicePageProps) {
  const options = useQuery(api.shipments.creationOptions);
  const createShipment = useMutation(api.shipments.create);
  const { formatAmount, formatCurrency } = useCurrency();

  const productSearchRef = useRef<HTMLInputElement>(null);
  const shippingCostRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<() => Promise<void>>(async () => undefined);

  const [saving, setSaving] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [shippingCost, setShippingCost] = useState(0);
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");

  const suppliers = options?.suppliers ?? [];
  const products = options?.products ?? [];
  const selectedSupplier = suppliers.find((supplier) => supplier._id === supplierId);
  const normalizedSearch = productSearch.trim().toLocaleLowerCase("ar");
  const filteredProducts = normalizedSearch
    ? products.filter((product) => product.name.toLocaleLowerCase("ar").includes(normalizedSearch))
    : [];

  const goodsTotal = items.reduce((sum, item) => sum + item.total, 0);
  const safeShippingCost = Number.isFinite(shippingCost) && shippingCost > 0 ? shippingCost : 0;
  const grandTotal = goodsTotal + safeShippingCost;
  const purchaseDate = new Date().toLocaleDateString("ar-EG-u-nu-latn");

  const resetPurchase = () => {
    setSupplierId("");
    setProductSearch("");
    setItems([]);
    setShippingCost(0);
    setExpectedDate("");
    setNotes("");
    window.setTimeout(() => productSearchRef.current?.focus(), 0);
  };

  const addProduct = (product: { _id: Id<"products">; name: string }) => {
    setItems((current) => {
      const existing = current.find((item) => item.productId === product._id);
      if (existing) {
        return current.map((item) =>
          item.productId === product._id
            ? {
                ...item,
                quantity: item.quantity + 1,
                total: (item.quantity + 1) * item.unitCost,
              }
            : item,
        );
      }
      return [
        ...current,
        {
          productId: product._id,
          productName: product.name,
          quantity: 1,
          unitCost: 0,
          total: 0,
        },
      ];
    });
    setProductSearch("");
    window.setTimeout(() => {
      const costInputs = Array.from(document.querySelectorAll<HTMLInputElement>("[data-purchase-unit-cost]"));
      const input = costInputs.at(-1);
      input?.focus();
      input?.select();
    }, 0);
  };

  const addFirstSearchResult = () => {
    const selected = filteredProducts[0];
    if (selected) addProduct(selected);
  };

  const updateQuantity = (productId: Id<"products">, nextQuantity: number) => {
    if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
      setItems((current) => current.filter((item) => item.productId !== productId));
      return;
    }
    const quantity = Math.max(1, Math.trunc(nextQuantity));
    setItems((current) =>
      current.map((item) =>
        item.productId === productId
          ? { ...item, quantity, total: quantity * item.unitCost }
          : item,
      ),
    );
  };

  const updateUnitCost = (productId: Id<"products">, nextCost: number) => {
    const unitCost = Number.isFinite(nextCost) ? Math.max(0, nextCost) : 0;
    setItems((current) =>
      current.map((item) =>
        item.productId === productId
          ? { ...item, unitCost, total: item.quantity * unitCost }
          : item,
      ),
    );
  };

  const removeItem = (productId: Id<"products">) => {
    setItems((current) => current.filter((item) => item.productId !== productId));
  };

  const focusLast = (selector: string) => {
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(selector));
    const input = inputs.at(-1);
    input?.focus();
    input?.select();
  };

  const handleSubmit = async () => {
    if (saving) return;
    if (!selectedSupplier) return void toast.error("اختر المورد أولاً");
    if (items.length === 0) return void toast.error("أضف صنفاً واحداً على الأقل");
    if (items.some((item) => !Number.isInteger(item.quantity) || item.quantity <= 0)) {
      return void toast.error("راجع كميات الأصناف");
    }
    if (items.some((item) => !Number.isFinite(item.unitCost) || item.unitCost <= 0)) {
      return void toast.error("أدخل تكلفة شراء صحيحة لكل صنف");
    }
    if (!Number.isFinite(shippingCost) || shippingCost < 0) {
      return void toast.error("تكلفة الشحن غير صالحة");
    }

    setSaving(true);
    try {
      await createShipment({
        supplierId: selectedSupplier._id,
        supplierName: selectedSupplier.name,
        items: items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitCost: item.unitCost,
          total: item.total,
        })),
        totalCost: goodsTotal,
        shippingCost: safeShippingCost,
        grandTotal,
        expectedDate: expectedDate || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("تم إنشاء فاتورة المشتريات وحفظها بانتظار الاستلام");
      onNavigate("shipments");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء فاتورة المشتريات");
    } finally {
      setSaving(false);
    }
  };

  submitRef.current = handleSubmit;

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        productSearchRef.current?.focus();
        productSearchRef.current?.select();
      }
      if (event.key === "F5") {
        event.preventDefault();
        focusLast("[data-purchase-quantity]");
      }
      if (event.key === "F6") {
        event.preventDefault();
        focusLast("[data-purchase-unit-cost]");
      }
      if (event.key === "F7") {
        event.preventDefault();
        shippingCostRef.current?.focus();
        shippingCostRef.current?.select();
      }
      if (event.key === "F8") {
        event.preventDefault();
        setItems((current) => (current.length > 0 ? current.slice(0, -1) : current));
      }
      if (event.key === "F9") {
        event.preventDefault();
        void submitRef.current();
      }
      if (event.key === "F10") {
        event.preventDefault();
        resetPurchase();
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <div className="purchase-pos-page" data-testid="new-purchase-invoice-page">
      <header className="purchase-pos-command-header">
        <div className="purchase-pos-heading">
          <div className="purchase-pos-title-icon"><ShoppingBag className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h1>فاتورة مشتريات جديدة</h1>
            <div className="purchase-pos-meta-line">
              <span>رقم العملية: تلقائي</span>
              <span>{purchaseDate}</span>
              <span>الحالة بعد الحفظ: تم الطلب</span>
            </div>
          </div>
        </div>
        <div className="purchase-pos-header-actions">
          <button type="button" onClick={() => onNavigate("shipments")} className="purchase-header-action">
            <ArrowRight className="h-4 w-4" /> سجل المشتريات
          </button>
          <button type="button" onClick={resetPurchase} className="purchase-header-action">جديد <kbd>F10</kbd></button>
          <button type="button" onClick={() => void handleSubmit()} disabled={saving || items.length === 0} className="purchase-header-action purchase-header-action-primary">
            {saving ? "جارٍ الحفظ..." : "حفظ"} <kbd>F9</kbd>
          </button>
        </div>
      </header>

      <div className="purchase-pos-layout">
        <section className="purchase-pos-workspace">
          <div className="purchase-pos-search-zone">
            <Search className="purchase-pos-search-icon" />
            <input
              ref={productSearchRef}
              data-testid="purchase-product-search"
              className="form-input purchase-pos-search-input"
              placeholder="ابحث باسم الصنف لإضافته إلى فاتورة المشتريات..."
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addFirstSearchResult();
                }
              }}
              autoComplete="off"
            />
            <span className="purchase-pos-search-hint"><PackagePlus className="h-3.5 w-3.5" />F2 بحث سريع</span>
            {productSearch && (
              <div className="purchase-pos-results">
                {filteredProducts.slice(0, 10).map((product) => (
                  <button key={product._id} type="button" data-testid="purchase-product-result" onClick={() => addProduct(product)} className="purchase-pos-result">
                    <div className="min-w-0 text-right">
                      <p className="truncate text-sm font-black text-slate-800">{product.name}</p>
                      <p className="mt-1 text-xs text-slate-400">اضغط لإضافة الصنف وتسجيل تكلفة الشراء</p>
                    </div>
                    <Plus className="h-4 w-4 shrink-0" />
                  </button>
                ))}
                {filteredProducts.length === 0 && <p className="py-5 text-center text-sm text-slate-400">لا توجد أصناف مطابقة</p>}
              </div>
            )}
          </div>

          <div className="purchase-pos-info-row">
            <label>
              <span className="form-label flex items-center gap-1.5"><Truck className="h-4 w-4" />المورد *</span>
              <select data-testid="purchase-supplier-select" className="form-input" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                <option value="">اختر المورد</option>
                {suppliers.map((supplier) => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}
              </select>
            </label>
            <label>
              <span className="form-label">تاريخ الوصول المتوقع</span>
              <input data-testid="purchase-expected-date" type="date" className="form-input" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} />
            </label>
            <label>
              <span className="form-label">تكلفة الشحن</span>
              <input ref={shippingCostRef} data-testid="purchase-shipping-cost" type="number" min="0" step="0.01" className="form-input" value={shippingCost || ""} onChange={(event) => setShippingCost(Number(event.target.value))} placeholder="0.00" />
            </label>
            <label>
              <span className="form-label">ملاحظات</span>
              <input data-testid="purchase-notes" className="form-input" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="ملاحظات فاتورة المشتريات..." />
            </label>
          </div>

          <div className="purchase-pos-items-grid">
            <div className="purchase-pos-items-title">
              <span>أصناف فاتورة المشتريات</span>
              <span>{formatAmount(items.length)} صنف</span>
            </div>
            <table className="data-table purchase-pos-table">
              <thead>
                <tr>
                  <th className="w-14">#</th>
                  <th>اسم الصنف</th>
                  <th className="w-40">الكمية</th>
                  <th className="w-44">تكلفة الوحدة</th>
                  <th className="w-44">الإجمالي</th>
                  <th className="w-16" aria-label="حذف" />
                </tr>
              </thead>
              <tbody>
                {items.length > 0 ? items.map((item, index) => (
                  <tr key={item.productId}>
                    <td className="text-xs font-black text-slate-400">{index + 1}</td>
                    <td><p className="font-black text-slate-800">{item.productName}</p></td>
                    <td>
                      <div className="purchase-pos-quantity-control">
                        <button type="button" onClick={() => updateQuantity(item.productId, item.quantity - 1)} aria-label={`تقليل كمية ${item.productName}`}><Minus className="h-3.5 w-3.5" /></button>
                        <input data-purchase-quantity type="number" min="1" value={item.quantity} onChange={(event) => updateQuantity(item.productId, Number(event.target.value))} aria-label={`كمية ${item.productName}`} />
                        <button type="button" onClick={() => updateQuantity(item.productId, item.quantity + 1)} aria-label={`زيادة كمية ${item.productName}`}><Plus className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                    <td>
                      <input data-purchase-unit-cost className="purchase-pos-cost-input" type="number" min="0" step="0.01" value={item.unitCost || ""} onChange={(event) => updateUnitCost(item.productId, Number(event.target.value))} placeholder="0.00" aria-label={`تكلفة ${item.productName}`} />
                    </td>
                    <td className="font-black text-[var(--purchase-accent-dark)]">{formatCurrency(item.total)}</td>
                    <td><button type="button" onClick={() => removeItem(item.productId)} className="purchase-pos-delete" aria-label={`حذف ${item.productName}`}><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                )) : (
                  <tr className="purchase-pos-empty-row">
                    <td colSpan={6}>
                      <div className="purchase-pos-empty">
                        <div>
                          <div className="purchase-pos-empty-icon"><PackagePlus className="h-8 w-8" /></div>
                          <p className="font-black">ابدأ بإضافة أصناف فاتورة المشتريات</p>
                          <p className="mt-2">ابحث عن الصنف ثم أدخل الكمية وتكلفة الشراء</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="purchase-pos-summary-panel">
          <div className="purchase-pos-total-card">
            <h2>ملخص فاتورة المشتريات</h2>
            <div className="purchase-pos-total-caption"><span>إجمالي التكلفة</span><span>{formatAmount(items.length)} صنف</span></div>
            <p data-testid="new-purchase-total" data-value={grandTotal} className="purchase-pos-total-value">{formatCurrency(grandTotal)}</p>
            <div className="purchase-pos-document-meta"><span>رقم العملية: تلقائي</span><span>{purchaseDate}</span></div>
          </div>

          <div className="purchase-pos-summary-body">
            <div className="purchase-pos-summary-totals">
              <div className="purchase-pos-summary-row"><span>تكلفة البضاعة</span><strong>{formatCurrency(goodsTotal)}</strong></div>
              <div className="purchase-pos-summary-row"><span>تكلفة الشحن</span><strong>{formatCurrency(safeShippingCost)}</strong></div>
              <div className="purchase-pos-grand-total-row"><span>الإجمالي الكلي</span><strong>{formatCurrency(grandTotal)}</strong></div>
            </div>

            <div className="purchase-pos-status-card">
              <span>المورد</span><strong>{selectedSupplier?.name ?? "لم يتم الاختيار"}</strong>
              <span>الوصول المتوقع</span><strong>{expectedDate || "غير محدد"}</strong>
              <span>حالة العملية</span><strong>تم الطلب</strong>
            </div>

            <div className="purchase-pos-accounting-note">
              <CheckCircle2 className="h-4 w-4" />
              <p>تحديث المخزون وتكلفة الصنف ومديونية المورد يتم عند استلام فاتورة الشراء من سجل المشتريات، حفاظاً على سلامة الترحيل المحاسبي.</p>
            </div>

            <button data-testid="purchase-submit" type="button" onClick={() => void handleSubmit()} disabled={saving || items.length === 0} className="purchase-pos-issue-button">
              <CheckCircle2 className="h-5 w-5" />
              {saving ? "جارٍ حفظ الفاتورة..." : "حفظ فاتورة المشتريات"}
            </button>
          </div>
        </aside>
      </div>

      <nav className="purchase-pos-bottom-bar" aria-label="اختصارات فاتورة المشتريات">
        <button type="button" onClick={() => { productSearchRef.current?.focus(); productSearchRef.current?.select(); }}><kbd>F2</kbd><span>بحث صنف</span></button>
        <button type="button" onClick={() => focusLast("[data-purchase-quantity]")} disabled={items.length === 0}><kbd>F5</kbd><span>الكمية</span></button>
        <button type="button" onClick={() => focusLast("[data-purchase-unit-cost]")} disabled={items.length === 0}><kbd>F6</kbd><span>التكلفة</span></button>
        <button type="button" onClick={() => { shippingCostRef.current?.focus(); shippingCostRef.current?.select(); }}><kbd>F7</kbd><span>الشحن</span></button>
        <button type="button" onClick={() => setItems((current) => current.length > 0 ? current.slice(0, -1) : current)} disabled={items.length === 0}><kbd>F8</kbd><span>حذف آخر صنف</span></button>
        <button type="button" onClick={() => void handleSubmit()} disabled={saving || items.length === 0}><kbd>F9</kbd><span>حفظ</span></button>
        <button type="button" onClick={resetPurchase}><kbd>F10</kbd><span>فاتورة جديدة</span></button>
        <button type="button" onClick={() => onNavigate("shipments")}><ArrowRight className="h-4 w-4" /><span>سجل المشتريات</span></button>
      </nav>
    </div>
  );
}
