import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import type { Page } from "./ERPApp";
import { Plus, Trash2, ShoppingCart, Search } from "lucide-react";

interface NewInvoicePageProps {
  onNavigate: (page: Page) => void;
}

interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export function NewInvoicePage({ onNavigate }: NewInvoicePageProps) {
  const products = useQuery(api.products.list, {}) ?? [];
  const customers = useQuery(api.customers.list) ?? [];
  const createInvoice = useMutation(api.invoices.create);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [discount, setDiscount] = useState(0);
  const [paid, setPaid] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [taxRate] = useState(15);

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
    try {
      await createInvoice({
        customerId: customerId ? customerId as any : undefined,
        customerName,
        customerPhone: customerPhone || undefined,
        items: cart.map(i => ({
          productId: i.productId as any,
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
        paid,
        remaining,
        paymentMethod,
        notes: notes || undefined,
        type: "sale",
      });
      toast.success("تم إنشاء الفاتورة بنجاح");
      onNavigate("invoices");
    } catch (err) {
      toast.error("حدث خطأ أثناء إنشاء الفاتورة");
    }
  };

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-indigo-600" />
            فاتورة جديدة
          </h1>
        </div>
        <button onClick={() => onNavigate("invoices")} className="btn-secondary">
          رجوع
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Products & Cart */}
        <div className="lg:col-span-2 space-y-4">
          {/* Customer */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h2 className="font-bold text-slate-800 mb-4">بيانات العميل</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="form-label">اختر عميل</label>
                <select className="form-input" value={customerId} onChange={e => handleSelectCustomer(e.target.value)}>
                  <option value="">عميل جديد</option>
                  {customers.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">اسم العميل *</label>
                <input className="form-input" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="اسم العميل" />
              </div>
              <div>
                <label className="form-label">رقم الهاتف</label>
                <input className="form-input" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="05xxxxxxxx" />
              </div>
            </div>
          </div>

          {/* Product Search */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h2 className="font-bold text-slate-800 mb-4">إضافة منتجات</h2>
            <div className="relative mb-4">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                className="form-input pr-10"
                placeholder="ابحث عن منتج..."
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
              />
            </div>
            {productSearch && (
              <div className="border border-slate-200 rounded-xl overflow-hidden mb-4 max-h-48 overflow-y-auto">
                {filteredProducts.slice(0, 8).map(p => (
                  <button
                    key={p._id}
                    onClick={() => addToCart(p)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-indigo-50 transition-colors border-b border-slate-100 last:border-0"
                  >
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.sku} • متوفر: {p.stock}</p>
                    </div>
                    <span className="text-indigo-600 font-bold text-sm">{p.sellPrice.toLocaleString("ar-SA")} ريال</span>
                  </button>
                ))}
                {filteredProducts.length === 0 && (
                  <p className="text-center py-4 text-slate-400 text-sm">لا توجد نتائج</p>
                )}
              </div>
            )}

            {/* Cart */}
            {cart.length > 0 ? (
              <div className="space-y-2">
                {cart.map((item) => (
                  <div key={item.productId} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{item.productName}</p>
                      <p className="text-xs text-slate-500">{item.unitPrice.toLocaleString("ar-SA")} ريال/قطعة</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                        className="w-7 h-7 bg-white border border-slate-200 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-600 font-bold"
                      >-</button>
                      <span className="w-8 text-center font-bold text-slate-800">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                        className="w-7 h-7 bg-white border border-slate-200 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-600 font-bold"
                      >+</button>
                    </div>
                    <span className="font-bold text-indigo-600 text-sm w-24 text-left">
                      {item.total.toLocaleString("ar-SA")} ريال
                    </span>
                    <button
                      onClick={() => removeFromCart(item.productId)}
                      className="p-1.5 hover:bg-red-100 rounded-lg transition-colors text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">ابحث عن منتج لإضافته</p>
              </div>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sticky top-4">
            <h2 className="font-bold text-slate-800 mb-4">ملخص الفاتورة</h2>

            <div className="space-y-3 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">المجموع الفرعي</span>
                <span className="font-medium">{subtotal.toLocaleString("ar-SA")} ريال</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">خصم (%)</span>
                <input
                  type="number"
                  className="w-20 text-center border border-slate-200 rounded-lg px-2 py-1 text-sm"
                  value={discount}
                  onChange={e => setDiscount(Number(e.target.value))}
                  min="0" max="100"
                />
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-red-500">
                  <span>قيمة الخصم</span>
                  <span>- {discountAmount.toLocaleString("ar-SA")} ريال</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">ضريبة القيمة المضافة ({taxRate}%)</span>
                <span className="font-medium">{taxAmount.toLocaleString("ar-SA")} ريال</span>
              </div>
              <div className="border-t border-slate-200 pt-3 flex justify-between">
                <span className="font-bold text-slate-800">الإجمالي</span>
                <span className="font-black text-xl text-indigo-600">{total.toLocaleString("ar-SA")} ريال</span>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="form-label">طريقة الدفع</label>
                <select className="form-input" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                  <option value="cash">نقدي</option>
                  <option value="card">بطاقة</option>
                  <option value="transfer">تحويل بنكي</option>
                  <option value="credit">آجل</option>
                </select>
              </div>
              <div>
                <label className="form-label">المبلغ المدفوع</label>
                <input
                  type="number"
                  className="form-input"
                  value={paid}
                  onChange={e => setPaid(Number(e.target.value))}
                  max={total}
                />
              </div>
              {remaining > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-sm text-amber-700 font-medium">
                    المتبقي: {remaining.toLocaleString("ar-SA")} ريال
                  </p>
                </div>
              )}
              <div>
                <label className="form-label">ملاحظات</label>
                <textarea className="form-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات..." />
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={cart.length === 0}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              إصدار الفاتورة
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
