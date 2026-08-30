from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file = Path(path)
    source = file.read_text(encoding="utf-8")
    if old not in source:
        raise RuntimeError(f"{path}: target not found: {label}")
    file.write_text(source.replace(old, new, 1), encoding="utf-8")


orders = "src/components/OrdersPage.tsx"
replace_once(orders,
    'import { getErrorMessage } from "../lib/errors";\n',
    'import { getErrorMessage } from "../lib/errors";\nimport { SearchableCombobox, type SearchableComboboxOption } from "./SearchableCombobox";\n',
    "combobox import")
replace_once(orders,
    'type OrderItem = { productName: string; quantity: number; unitPrice: number; notes?: string };',
    'type OrderItem = { productId?: string; productName: string; quantity: number; unitPrice: number; notes?: string };',
    "order item product id")
replace_once(orders,
    'const emptyItem = (): OrderItem => ({ productName: "", quantity: 1, unitPrice: 0 });',
    'const emptyItem = (): OrderItem => ({ productId: "", productName: "", quantity: 1, unitPrice: 0 });',
    "empty item")

old_items = r'''function OrderItemsEditor({ items, setItems }: { items: OrderItem[]; setItems: (items: OrderItem[]) => void }) {
  const addItem = () => setItems([...items, emptyItem()]);
  const removeItem = (index: number) => setItems(items.filter((_, itemIndex) => itemIndex !== index));
  const updateItem = (index: number, field: keyof OrderItem, value: string | number) => setItems(items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  return <div className="space-y-3"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-700">الأصناف المطلوبة</p><button type="button" onClick={addItem} className="flex items-center gap-1.5 text-indigo-600 text-sm font-medium"><Plus className="w-4 h-4" />إضافة صنف</button></div>{items.map((item, index) => <div key={index} data-testid="order-item-row" data-item-index={index} className="bg-slate-50 rounded-xl p-3 space-y-2"><div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-500">صنف {index + 1}</span>{items.length > 1 && <button type="button" onClick={() => removeItem(index)} className="p-1 hover:bg-red-100 rounded-lg text-slate-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>}</div><div className="grid grid-cols-3 gap-2"><input data-testid="order-item-name" className="form-input col-span-3 sm:col-span-1" placeholder="اسم الصنف *" value={item.productName} onChange={(event) => updateItem(index, "productName", event.target.value)} /><input data-testid="order-item-quantity" className="form-input text-center" type="number" min="1" value={item.quantity} onChange={(event) => updateItem(index, "quantity", Number(event.target.value))} /><input data-testid="order-item-price" className="form-input text-center" type="number" min="0" step="0.01" value={item.unitPrice || ""} onChange={(event) => updateItem(index, "unitPrice", Number(event.target.value))} /></div><input className="form-input text-sm" placeholder="ملاحظات (اختياري)" value={item.notes ?? ""} onChange={(event) => updateItem(index, "notes", event.target.value)} /><div className="text-left text-sm font-bold text-indigo-600">{money(item.quantity * item.unitPrice)}</div></div>)}</div>;
}'''
new_items = r'''type OrderProduct = { _id: Id<"products">; name: string; sku: string; barcode?: string; stock: number; sellPrice?: number; isActive?: boolean };

function OrderItemsEditor({ items, setItems, products }: { items: OrderItem[]; setItems: (items: OrderItem[]) => void; products: OrderProduct[] }) {
  const activeProducts = products.filter((product) => product.isActive !== false);
  const addItem = () => setItems([...items, emptyItem()]);
  const removeItem = (index: number) => setItems(items.length === 1 ? items : items.filter((_, itemIndex) => itemIndex !== index));
  const updateItem = (index: number, field: keyof OrderItem, value: string | number) => setItems(items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  const chooseProduct = (index: number, productId: string) => {
    if (!productId) {
      setItems(items.map((item, itemIndex) => itemIndex === index ? emptyItem() : item));
      return;
    }
    const product = activeProducts.find((row) => String(row._id) === productId);
    if (!product) return;
    const duplicateIndex = items.findIndex((item, itemIndex) => itemIndex !== index && item.productId === productId);
    if (duplicateIndex >= 0) {
      const next = items
        .map((item, itemIndex) => itemIndex === duplicateIndex ? { ...item, quantity: item.quantity + Math.max(1, items[index]?.quantity ?? 1) } : item)
        .filter((_, itemIndex) => itemIndex !== index || items.length === 1);
      setItems(next.length ? next : [emptyItem()]);
      toast.info("الصنف موجود بالفعل وتمت زيادة الكمية");
      return;
    }
    const next = items.map((item, itemIndex) => itemIndex === index ? {
      ...item,
      productId,
      productName: product.name,
      unitPrice: product.sellPrice ?? item.unitPrice ?? 0,
    } : item);
    if (index === items.length - 1) next.push(emptyItem());
    setItems(next);
  };

  return <section className="rounded-2xl border border-slate-200 bg-white overflow-visible" data-testid="order-items-editor">
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
      <div><p className="font-black text-slate-800">الأصناف</p><p className="mt-0.5 text-xs text-slate-500">ابحث باسم الصنف أو SKU أو الباركود، وسيظهر سطر جديد تلقائيًا بعد الاختيار.</p></div>
      <button type="button" onClick={addItem} className="erp-action shrink-0"><Plus className="w-4 h-4" />إضافة صنف</button>
    </div>
    <div className="hidden lg:grid grid-cols-[minmax(280px,1fr)_100px_140px_140px_44px] gap-2 px-4 py-2 text-[11px] font-black text-slate-500 bg-slate-50/80">
      <span>الصنف</span><span>الكمية</span><span>سعر الوحدة</span><span>الإجمالي</span><span />
    </div>
    <div className="divide-y divide-slate-100 px-3">
      {items.map((item, index) => {
        const selectedProduct = activeProducts.find((row) => String(row._id) === item.productId);
        const options: SearchableComboboxOption[] = activeProducts.map((product) => ({
          value: String(product._id),
          label: product.name,
          description: `${product.sku}${product.barcode ? ` — ${product.barcode}` : ""} — متاح ${product.stock}${typeof product.sellPrice === "number" ? ` — ${money(product.sellPrice)}` : ""}`,
          searchText: `${product.name} ${product.sku} ${product.barcode ?? ""}`,
        }));
        if (!item.productId && item.productName) options.unshift({ value: `legacy:${index}`, label: item.productName, description: "صنف محفوظ سابقًا — اختر الصنف المقابل من المخزون عند الحاجة", disabled: true });
        const pickerValue = item.productId || (item.productName ? `legacy:${index}` : "");
        return <div key={index} data-testid="order-item-row" data-item-index={index} className="grid gap-2 py-3 lg:grid-cols-[minmax(280px,1fr)_100px_140px_140px_44px] lg:items-start">
          <div>
            <label className="form-label lg:hidden">الصنف</label>
            <SearchableCombobox testId="order-item-product" value={pickerValue} onChange={(value) => chooseProduct(index, value.startsWith("legacy:") ? "" : value)} options={options} placeholder="ابحث عن صنف..." emptyText="لا يوجد صنف مطابق" />
            {selectedProduct && <p className="mt-1 text-[11px] text-slate-500">SKU: {selectedProduct.sku} · المتاح: <span className={selectedProduct.stock > 0 ? "font-bold text-emerald-700" : "font-bold text-red-600"}>{selectedProduct.stock}</span></p>}
          </div>
          <div><label className="form-label lg:hidden">الكمية</label><input data-testid="order-item-quantity" className="form-input text-center" type="number" min="1" value={item.quantity} onChange={(event) => updateItem(index, "quantity", Number(event.target.value))} /></div>
          <div><label className="form-label lg:hidden">سعر الوحدة</label><input data-testid="order-item-price" className="form-input text-center font-bold" type="number" min="0" step="0.01" value={item.unitPrice || ""} onChange={(event) => updateItem(index, "unitPrice", Number(event.target.value))} /></div>
          <div><label className="form-label lg:hidden">الإجمالي</label><div className="flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-black text-indigo-700">{money(item.quantity * item.unitPrice)}</div></div>
          <button type="button" disabled={items.length === 1} onClick={() => removeItem(index)} className="grid h-10 w-10 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" aria-label="حذف الصنف"><Trash2 className="w-4 h-4" /></button>
          <div className="lg:col-span-5"><input className="form-input text-sm" placeholder="ملاحظات الصنف (اختياري)" value={item.notes ?? ""} onChange={(event) => updateItem(index, "notes", event.target.value)} /></div>
        </div>;
      })}
    </div>
  </section>;
}'''
replace_once(orders, old_items, new_items, "professional items editor")

replace_once(orders,
    '  const customers = useQuery(api.customers.list, {});\n  const canCollect = usePermission("record_collections");',
    '  const customers = useQuery(api.customers.list, {});\n  const products = (useQuery(api.products.list, {}) ?? []) as OrderProduct[];\n  const canCollect = usePermission("record_collections");',
    "new products query")
replace_once(orders,
    '''  const [items, setItems] = useState<OrderItem[]>([emptyItem()]);
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const handleCustomerSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const id = event.target.value;
    if (!id) return setForm({ ...form, customerId: "", customerName: "", customerPhone: "" });
    const customer = customers?.find((row) => row._id === id);
    if (customer) setForm({ ...form, customerId: id, customerName: customer.name, customerPhone: customer.phone });
  };''',
    '''  const [items, setItems] = useState<OrderItem[]>([emptyItem()]);
  const selectedItems = items.filter((item) => Boolean(item.productId || item.productName.trim()));
  const total = selectedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const handleCustomerSelect = (id: string) => {
    if (!id) return setForm({ ...form, customerId: "", customerName: "", customerPhone: "" });
    const customer = customers?.find((row) => String(row._id) === id);
    if (customer) setForm({ ...form, customerId: id, customerName: customer.name, customerPhone: customer.phone });
  };''',
    "new customer selection")
replace_once(orders,
    '    if (items.some((item) => !item.productName.trim() || !Number.isInteger(item.quantity) || item.quantity <= 0 || item.unitPrice < 0)) return toast.error("راجع بيانات الأصناف والكميات والأسعار");',
    '    if (!selectedItems.length) return toast.error("اختر صنفًا واحدًا على الأقل");\n    if (selectedItems.some((item) => !item.productName.trim() || !Number.isInteger(item.quantity) || item.quantity <= 0 || item.unitPrice < 0)) return toast.error("راجع بيانات الأصناف والكميات والأسعار");',
    "new validation")
replace_once(orders,
    'items: items.map((item) => ({ ...item, notes: item.notes?.trim() || undefined }))',
    'items: selectedItems.map((item) => ({ productId: item.productId ? item.productId as Id<"products"> : undefined, productName: item.productName, quantity: item.quantity, unitPrice: item.unitPrice, notes: item.notes?.trim() || undefined }))',
    "new payload")

old_new_return = r'''  return <OrderFormShell title="أمر بيع جديد" onClose={onClose}><form data-testid="order-create-form" onSubmit={handleSubmit} className="p-6 space-y-5"><CustomerEditor form={form} setForm={setForm} customers={customers ?? []} onSelect={handleCustomerSelect} /><OrderItemsEditor items={items} setItems={setItems} /><div className="bg-indigo-50 rounded-xl p-4 space-y-3"><div className="flex justify-between"><span className="font-semibold">الإجمالي</span><span data-testid="order-total" data-value={total} className="font-black text-xl text-indigo-700">{money(total)}</span></div><div><label className="form-label">العربون / الدفعة الأولى</label><input data-testid="order-deposit" className="form-input" type="number" min="0" step="0.01" disabled={!canCollect} value={form.deposit} onChange={(event) => setForm({ ...form, deposit: event.target.value })} />{canCollect && Number(form.deposit) > 0 && <select className="form-input mt-2" value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">اختر حساب التحصيل</option>{accounts.map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}</select>}</div></div><DateNotesEditor form={form} setForm={setForm} /><div className="flex gap-3"><button type="button" disabled={saving} onClick={onClose} className="btn-secondary flex-1">إلغاء</button><button data-testid="order-submit" type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">{saving ? "جارٍ الحفظ..." : "حفظ أمر البيع"}</button></div></form></OrderFormShell>;'''
new_new_return = r'''  const accountOptions: SearchableComboboxOption[] = accounts.map((account) => ({ value: String(account._id), label: account.name, searchText: account.name }));
  return <OrderFormShell title="أمر بيع جديد" subtitle="اختر العميل والأصناف وسجل العربون وموعد التسليم من شاشة واحدة." onClose={onClose}><form data-testid="order-create-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col"><div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5 space-y-4"><CustomerEditor form={form} setForm={setForm} customers={customers ?? []} onSelect={handleCustomerSelect} /><OrderItemsEditor items={items} setItems={setItems} products={products} /><div className="grid gap-4 lg:grid-cols-[1fr_320px]"><DateNotesEditor form={form} setForm={setForm} /><div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 space-y-3"><div className="flex items-center justify-between"><span className="font-bold text-slate-700">إجمالي أمر البيع</span><span data-testid="order-total" data-value={total} className="font-black text-xl text-indigo-700">{money(total)}</span></div><div><label className="form-label">العربون / الدفعة الأولى</label><input data-testid="order-deposit" className="form-input bg-white" type="number" min="0" step="0.01" disabled={!canCollect} value={form.deposit} onChange={(event) => setForm({ ...form, deposit: event.target.value })} />{canCollect && Number(form.deposit) > 0 && <div className="mt-2"><SearchableCombobox value={accountId} onChange={setAccountId} options={accountOptions} placeholder="ابحث عن حساب التحصيل..." emptyText="لا توجد حسابات تحصيل" /></div>}</div><div className="flex justify-between border-t border-indigo-100 pt-2 text-sm"><span>المتبقي</span><strong className="text-amber-700">{money(Math.max(0, total - (Number(form.deposit) || 0)))}</strong></div></div></div></div><div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 lg:px-5"><button type="button" disabled={saving} onClick={onClose} className="btn-secondary">إلغاء</button><button data-testid="order-submit" type="submit" disabled={saving} className="btn-primary min-w-40 disabled:opacity-50">{saving ? "جارٍ الحفظ..." : "حفظ أمر البيع"}</button></div></form></OrderFormShell>;'''
replace_once(orders, old_new_return, new_new_return, "new professional form")

replace_once(orders,
    '  const customers = useQuery(api.customers.list, {});\n  const [saving, setSaving] = useState(false);',
    '  const customers = useQuery(api.customers.list, {});\n  const products = (useQuery(api.products.list, {}) ?? []) as OrderProduct[];\n  const [saving, setSaving] = useState(false);',
    "edit products query")
replace_once(orders,
    '''  const [items, setItems] = useState<OrderItem[]>(order.items.map((item) => ({ ...item })));
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const handleCustomerSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const id = event.target.value;
    if (order.deposit > 0) return;
    if (!id) return setForm({ ...form, customerId: "", customerName: "", customerPhone: "" });
    const customer = customers?.find((row) => row._id === id);
    if (customer) setForm({ ...form, customerId: id, customerName: customer.name, customerPhone: customer.phone });
  };''',
    '''  const [items, setItems] = useState<OrderItem[]>(order.items.map((item) => ({ ...item, productId: "productId" in item && item.productId ? String(item.productId) : undefined })));
  const selectedItems = items.filter((item) => Boolean(item.productId || item.productName.trim()));
  const total = selectedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const handleCustomerSelect = (id: string) => {
    if (order.deposit > 0) return;
    if (!id) return setForm({ ...form, customerId: "", customerName: "", customerPhone: "" });
    const customer = customers?.find((row) => String(row._id) === id);
    if (customer) setForm({ ...form, customerId: id, customerName: customer.name, customerPhone: customer.phone });
  };''',
    "edit customer selection")
replace_once(orders,
    '    if (items.some((item) => !item.productName.trim() || !Number.isInteger(item.quantity) || item.quantity <= 0 || item.unitPrice < 0)) return toast.error("راجع بيانات الأصناف والكميات والأسعار");',
    '    if (!selectedItems.length) return toast.error("اختر صنفًا واحدًا على الأقل");\n    if (selectedItems.some((item) => !item.productName.trim() || !Number.isInteger(item.quantity) || item.quantity <= 0 || item.unitPrice < 0)) return toast.error("راجع بيانات الأصناف والكميات والأسعار");',
    "edit validation")
replace_once(orders,
    'items: items.map((item) => ({ ...item, notes: item.notes?.trim() || undefined }))',
    'items: selectedItems.map((item) => ({ productId: item.productId ? item.productId as Id<"products"> : undefined, productName: item.productName, quantity: item.quantity, unitPrice: item.unitPrice, notes: item.notes?.trim() || undefined }))',
    "edit payload")

old_edit_return = r'''  return <OrderFormShell title={`تعديل ${order.orderNumber}`} onClose={onClose}><form onSubmit={handleSubmit} className="p-6 space-y-5"><CustomerEditor form={form} setForm={setForm} customers={customers ?? []} onSelect={handleCustomerSelect} disabledCustomer={order.deposit > 0} /><OrderItemsEditor items={items} setItems={setItems} /><div className="bg-indigo-50 rounded-xl p-4"><div className="flex justify-between"><span className="font-semibold">الإجمالي الجديد</span><span className="font-black text-xl text-indigo-700">{money(total)}</span></div><div className="flex justify-between text-sm mt-2"><span>العربون المحفوظ</span><span>{money(order.deposit)}</span></div><div className="flex justify-between text-sm mt-1"><span>المتبقي بعد الحفظ</span><span className="font-bold text-amber-700">{money(Math.max(0, total - order.deposit))}</span></div></div><DateNotesEditor form={form} setForm={setForm} /><div className="flex gap-3"><button type="button" disabled={saving} onClick={onClose} className="btn-secondary flex-1">إلغاء</button><button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">{saving ? "جارٍ الحفظ..." : "حفظ التعديلات"}</button></div></form></OrderFormShell>;'''
new_edit_return = r'''  return <OrderFormShell title={`تعديل ${order.orderNumber}`} subtitle="تعديل العميل والأصناف مسموح قبل تجهيز الطلب وربطه بالفاتورة." onClose={onClose}><form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col"><div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5 space-y-4"><CustomerEditor form={form} setForm={setForm} customers={customers ?? []} onSelect={handleCustomerSelect} disabledCustomer={order.deposit > 0} /><OrderItemsEditor items={items} setItems={setItems} products={products} /><div className="grid gap-4 lg:grid-cols-[1fr_320px]"><DateNotesEditor form={form} setForm={setForm} /><div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4"><div className="flex justify-between"><span className="font-semibold">الإجمالي</span><span className="font-black text-xl text-indigo-700">{money(total)}</span></div><div className="flex justify-between text-sm mt-3"><span>العربون المحفوظ</span><span>{money(order.deposit)}</span></div><div className="flex justify-between text-sm mt-1"><span>المتبقي</span><span className="font-bold text-amber-700">{money(Math.max(0, total - order.deposit))}</span></div></div></div></div><div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 lg:px-5"><button type="button" disabled={saving} onClick={onClose} className="btn-secondary">إلغاء</button><button type="submit" disabled={saving} className="btn-primary min-w-40 disabled:opacity-50">{saving ? "جارٍ الحفظ..." : "حفظ التعديلات"}</button></div></form></OrderFormShell>;'''
replace_once(orders, old_edit_return, new_edit_return, "edit professional form")

old_customer = r'''function CustomerEditor({ form, setForm, customers, onSelect, disabledCustomer = false }: { form: FormState; setForm: (form: FormState) => void; customers: Array<{ _id: Id<"customers">; name: string; phone: string }>; onSelect: (event: React.ChangeEvent<HTMLSelectElement>) => void; disabledCustomer?: boolean }) {
  return <div className="bg-slate-50 rounded-xl p-4 space-y-3"><p className="text-sm font-semibold text-slate-700">بيانات العميل</p><div><label className="form-label">اختر عميلاً (اختياري)</label><select data-testid="order-customer-select" disabled={disabledCustomer} className="form-input disabled:bg-slate-100" value={form.customerId} onChange={onSelect}><option value="">— بدون ربط —</option>{customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name} — {customer.phone}</option>)}</select>{disabledCustomer && <p className="text-xs text-amber-700 mt-1">لا يمكن تغيير العميل بعد تسجيل عربون.</p>}</div><div className="grid grid-cols-2 gap-3"><div><label className="form-label">اسم العميل *</label><input disabled={disabledCustomer} className="form-input disabled:bg-slate-100" value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} /></div><div><label className="form-label">رقم الهاتف</label><input disabled={disabledCustomer} className="form-input disabled:bg-slate-100" value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} /></div></div></div>;
}'''
new_customer = r'''function CustomerEditor({ form, setForm, customers, onSelect, disabledCustomer = false }: { form: FormState; setForm: (form: FormState) => void; customers: Array<{ _id: Id<"customers">; name: string; phone: string }>; onSelect: (value: string) => void; disabledCustomer?: boolean }) {
  const customerOptions: SearchableComboboxOption[] = customers.map((customer) => ({ value: String(customer._id), label: customer.name, description: customer.phone, searchText: `${customer.name} ${customer.phone}` }));
  return <section className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="order-customer-editor">
    <div className="mb-3 flex items-center justify-between gap-3"><div><p className="font-black text-slate-800">العميل</p><p className="mt-0.5 text-xs text-slate-500">اكتب جزءًا من الاسم أو رقم الهاتف للوصول للعميل مباشرة.</p></div>{form.customerId && <span className="badge badge-success">عميل مسجل</span>}</div>
    <SearchableCombobox testId="order-customer-combobox" disabled={disabledCustomer} value={form.customerId} onChange={onSelect} options={customerOptions} placeholder="ابحث باسم العميل أو رقم الهاتف..." emptyText="لا يوجد عميل مطابق" />
    {disabledCustomer && <p className="text-xs text-amber-700 mt-2">لا يمكن تغيير العميل بعد تسجيل عربون.</p>}
    {form.customerId ? <div className="mt-3 grid gap-2 rounded-xl bg-emerald-50 px-4 py-3 sm:grid-cols-2"><div><p className="text-[11px] font-bold text-emerald-700">اسم العميل</p><p className="mt-1 font-black text-slate-800">{form.customerName}</p></div><div><p className="text-[11px] font-bold text-emerald-700">رقم الهاتف</p><p className="mt-1 font-mono font-bold text-slate-800" dir="ltr">{form.customerPhone || "—"}</p></div></div> : <div className="mt-3 grid gap-3 sm:grid-cols-2"><div><label className="form-label">اسم العميل *</label><input disabled={disabledCustomer} className="form-input disabled:bg-slate-100" placeholder="عميل غير مسجل" value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} /></div><div><label className="form-label">رقم الهاتف</label><input disabled={disabledCustomer} className="form-input disabled:bg-slate-100" placeholder="01xxxxxxxxx" value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} /></div></div>}
  </section>;
}'''
replace_once(orders, old_customer, new_customer, "customer combobox")

old_date = r'''function DateNotesEditor({ form, setForm }: { form: FormState; setForm: (form: FormState) => void }) {
  return <div className="grid grid-cols-2 gap-3"><div><label className="form-label">تاريخ التسليم المتوقع</label><input className="form-input" type="date" value={form.expectedDate} onChange={(event) => setForm({ ...form, expectedDate: event.target.value })} /></div><div><label className="form-label">ملاحظات</label><input className="form-input" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div></div>;
}'''
new_date = r'''function DateNotesEditor({ form, setForm }: { form: FormState; setForm: (form: FormState) => void }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="mb-3 font-black text-slate-800">التسليم والملاحظات</p><div className="grid gap-3 sm:grid-cols-2"><div><label className="form-label">تاريخ التسليم المتوقع</label><input className="form-input" type="date" value={form.expectedDate} onChange={(event) => setForm({ ...form, expectedDate: event.target.value })} /></div><div className="sm:col-span-2"><label className="form-label">ملاحظات أمر البيع</label><textarea className="form-input min-h-20" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="أي ملاحظات تخص التجهيز أو التسليم..." /></div></div></div>;
}'''
replace_once(orders, old_date, new_date, "date notes")

old_shell = r'''function OrderFormShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"><div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"><div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-2xl z-10"><h2 className="font-bold text-slate-800 flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-indigo-600" />{title}</h2><button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button></div>{children}</div></div>;
}'''
new_shell = r'''function OrderFormShell({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4"><div className="flex h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:h-auto sm:max-h-[94vh] sm:rounded-2xl"><div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 lg:px-5"><div><h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><ShoppingCart className="w-5 h-5 text-indigo-600" />{title}</h2>{subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}</div><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" aria-label="إغلاق"><X className="w-4 h-4" /></button></div>{children}</div></div>;
}'''
replace_once(orders, old_shell, new_shell, "form shell")

schema = "convex/schema.ts"
replace_once(schema,
    '''    items: v.array(v.object({
      productName: v.string(),''',
    '''    items: v.array(v.object({
      productId: v.optional(v.id("products")),
      productName: v.string(),''',
    "orders schema product id")

backend = "convex/orders.ts"
replace_once(backend,
    'import { query, mutation } from "./_generated/server";',
    'import { query, mutation } from "./_generated/server";\nimport type { Id } from "./_generated/dataModel";\nimport type { MutationCtx } from "./_generated/server";',
    "backend types")
replace_once(backend,
    '''function normalizeOrderItems(items: Array<{ productName: string; quantity: number; unitPrice: number; notes?: string }>) {
  if (items.length === 0) throw new ConvexError("أضف منتجاً واحداً على الأقل");
  return items.map((item) => {
    const productName = item.productName.trim();
    if (!productName) throw new ConvexError("اسم المنتج مطلوب");
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new ConvexError("الكمية يجب أن تكون عدداً صحيحاً أكبر من صفر");
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw new ConvexError("سعر المنتج غير صالح");
    const notes = item.notes?.trim() || undefined;
    return { productName, quantity: item.quantity, unitPrice: roundMoney(item.unitPrice), notes };
  });
}''',
    '''async function normalizeOrderItems(ctx: MutationCtx, branchId: Id<"branches"> | undefined, items: Array<{ productId?: Id<"products">; productName: string; quantity: number; unitPrice: number; notes?: string }>) {
  if (items.length === 0) throw new ConvexError("أضف صنفاً واحداً على الأقل");
  return await Promise.all(items.map(async (item) => {
    let productName = item.productName.trim();
    if (item.productId) {
      const product = await ctx.db.get(item.productId);
      if (!product || product.isActive === false) throw new ConvexError("أحد الأصناف غير موجود أو غير متاح للبيع");
      if (branchId && product.branchId && product.branchId !== branchId) throw new ConvexError("أحد الأصناف يتبع فرعاً آخر");
      productName = product.name;
    }
    if (!productName) throw new ConvexError("اسم الصنف مطلوب");
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new ConvexError("الكمية يجب أن تكون عدداً صحيحاً أكبر من صفر");
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw new ConvexError("سعر الصنف غير صالح");
    const notes = item.notes?.trim() || undefined;
    return { productId: item.productId, productName, quantity: item.quantity, unitPrice: roundMoney(item.unitPrice), notes };
  }));
}''',
    "backend canonical item")
replace_once(backend,
    '''    items: v.array(v.object({
      productName: v.string(),''',
    '''    items: v.array(v.object({
      productId: v.optional(v.id("products")),
      productName: v.string(),''',
    "create product id")
replace_once(backend,
    '    const items = normalizeOrderItems(args.items);',
    '    const items = await normalizeOrderItems(ctx, branchId, args.items);',
    "create normalize")
replace_once(backend,
    '    items: v.array(v.object({ productName: v.string(), quantity: v.number(), unitPrice: v.number(), notes: v.optional(v.string()) })),',
    '    items: v.array(v.object({ productId: v.optional(v.id("products")), productName: v.string(), quantity: v.number(), unitPrice: v.number(), notes: v.optional(v.string()) })),',
    "update product id")
replace_once(backend,
    '    const items = normalizeOrderItems(args.items);',
    '    const items = await normalizeOrderItems(ctx, order.branchId, args.items);',
    "update normalize")

print("Sales order editor upgraded")
