# Performance & Index Audit

> تدقيق قراءة فقط مولّد من أحدث نسخة للمستودع. لم يغيّر أي ملف إنتاجي أو Schema أو سلوك تشغيل.

## النطاق والمنهجية

- فحص جميع ملفات `convex/**/*.ts` باستثناء `_generated`، وجميع مكونات `src/**/*.tsx`.
- البحث عن `collect()` غير المحدود، الفلاتر دون Index، `first/take` دون Index ظاهر، N+1، DTOs الخام، pagination/aggregation المحلية، واستعلامات دون حارس صلاحية واضح.
- الدرجات أدناه Static Analysis؛ البنود الموسومة «مرشح قوي» تحتاج تأكيدًا يدويًا قبل أي تعديل.
- لم يتم قياس latency أو cardinality على بيانات Production؛ شدة بعض البنود قد ترتفع أو تنخفض بعد القياس.

## الملخص التنفيذي

- **إجمالي البنود:** 305
- **Critical:** 8
- **High:** 54
- **Medium:** 243
- **Low:** 0

### أعلى 10 إصلاحات أولوية

1. **[Critical] Delivery/COD — `convex/deliveries.ts:146` / `getStats`**: Unbounded collect. استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
2. **[Critical] Expenses — `convex/expenses.ts:12` / `list`**: Unbounded collect. استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
3. **[Critical] Expenses — `convex/expenses.ts:88` / `getStats`**: Unbounded collect. استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
4. **[Critical] Invoices — `convex/invoices.ts:109` / `list`**: Unbounded collect. استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
5. **[Critical] Invoices — `convex/invoices.ts:408` / `stats`**: Unbounded collect. استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
6. **[Critical] Repairs — `convex/repairs.ts:1003` / `getStats`**: Unbounded collect. استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
7. **[Critical] Sales Returns — `convex/salesReturns.ts:32` / `eligibleInvoices`**: Unbounded collect. استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
8. **[Critical] Shipments — `convex/shipments.ts:47` / `stats`**: Unbounded collect. استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
9. **[High] Branches — `convex/branches.ts:10` / `list`**: Unbounded collect. استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
10. **[High] Branches — `convex/branches.ts:10` / `list`**: Raw document DTO. حوّل النتائج إلى DTO allowlist داخل الـBackend، وأعد فقط الحقول اللازمة للعرض والإجراءات المصرح بها.

## النتائج حسب الوحدة

### Orders

عدد البنود: **7**

#### Orders-1: [Medium] Unbounded collect

- **الموقع:** `convex/orders.ts:47` — `details`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `> { const user = await requireModulePermission(ctx, "view_orders", "orders"); const order = await ctx.db.get(args.id); if (!order) throw new ConvexError("الطلب غير موجود"); assertB`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `customerLedgerEntries` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Orders-2: [Medium] Unbounded collect

- **الموقع:** `convex/orders.ts:48` — `details`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `nvexError("الطلب غير موجود"); assertBranchAccess(user, order); const [invoice, deliveries, transactions, directLedger, appliedLedger] = await Promise.all([ order.linkedInvoiceId ? `
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `customerLedgerEntries` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Orders-3: [Medium] Unbounded collect

- **الموقع:** `convex/orders.ts:49` — `details`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ise.all([ order.linkedInvoiceId ? ctx.db.get(order.linkedInvoiceId) : null, ctx.db.query("deliveries").withIndex("by_order_status", q => q.eq("orderId", order._id)).order("desc").c`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `customerLedgerEntries` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Orders-4: [Medium] Unbounded collect

- **الموقع:** `convex/orders.ts:50` — `details`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `rder._id)).order("desc").collect(), ctx.db.query("financialTransactions").withIndex("by_reference", q => q.eq("referenceType", "order").eq("referenceId", String(order._id))).collec`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `customerLedgerEntries` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Orders-5: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/OrdersPage.tsx:105` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `rder = useMutation(api.orders.cancel); const collectionAccounts = useQuery(api.finance.collectionAccountPicker, canCollect && showPayment !== null ? {} : "skip") ?? []; const refun`
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

#### Orders-6: [Medium] Client-side aggregation

- **الموقع:** `src/components/OrdersPage.tsx:301` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `tRequestId] = useState(() => crypto.randomUUID()); const [saving, setSaving] = useState(false); const [form, setForm] = useState({ customerName: "", customerPhone: "", customerId: `
- **الأثر:** التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.
- **الإصلاح المقترح:** استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.
- **Index / Query design:** Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.

#### Orders-7: [Medium] Client-side aggregation

- **الموقع:** `src/components/OrdersPage.tsx:341` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `customerPhone: order.customerPhone ?? "", customerId: order.customerId ? String(order.customerId) : "", expectedDate: order.expectedDate ?? "", notes: order.notes ?? "", deposit: S`
- **الأثر:** التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.
- **الإصلاح المقترح:** استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.
- **Index / Query design:** Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.

### Invoices

عدد البنود: **13**

#### Invoices-1: [Critical] Unbounded collect

- **الموقع:** `convex/invoices.ts:109` — `list`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ex]; }); return { normalizedItems, productDocs, requested, cogsTotal: roundMoney(normalizedItems.reduce((sum, item) => sum + item.costTotal, 0)), ...totals }; } export const list =`
- **الأثر:** قراءة جدول كبير بالكامل في طلب واحد قد تتجاوز حدود Convex وتزيد زمن الاستجابة والتكلفة مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `invoices`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Invoices-2: [Critical] Unbounded collect

- **الموقع:** `convex/invoices.ts:408` — `stats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ordId: args.id, recordLabel: inv.invoiceNumber, details: 'إلغاء الفاتورة ${inv.invoiceNumber}: ${reason}', }); }, }); export const remove = mutation({ args: { id: v.id("invoices") `
- **الأثر:** قراءة جدول كبير بالكامل في طلب واحد قد تتجاوز حدود Convex وتزيد زمن الاستجابة والتكلفة مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `invoices`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Invoices-3: [Medium] Potential N+1

- **الموقع:** `convex/invoices.ts:37` — `prepareInvoice`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const item of items) { if (!Number.isInteger(item.quantity) || item.quantity <= 0) { throw new ConvexError("كمية المنتج يجب أن تكون عدداً صحيحاً أكبر من صفر"); } if (!Number.isFinite(item.discount) || item.discount `
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Invoices-4: [Medium] Potential N+1

- **الموقع:** `convex/invoices.ts:49` — `prepareInvoice`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const item of items) { const key = String(item.productId); if (productDocs.has(key)) continue; const product = await ctx.db.get(item.productId); if (!product || !product.isActive) throw new ConvexError('المنتج غير م`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Invoices-5: [Medium] Unindexed first

- **الموقع:** `convex/invoices.ts:78` — `prepareInvoice`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `* item.quantity * (1 - item.discount / 100)); return { productId: item.productId, productName: product.name, quantity: item.quantity, unitPrice: product.sellPrice, discount: item.d`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `settings` يطابق مفاتيح البحث والترتيب المستخدمة في `prepareInvoice`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### Invoices-6: [Medium] Potential N+1

- **الموقع:** `convex/invoices.ts:378` — `update`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const item of inv.items) { const key = String(item.productId); quantities.set(key, (quantities.get(key) ?? 0) + item.quantity); } for (const [productId, quantity] of quantities) { const product = await ctx.db.get(pr`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Invoices-7: [Medium] Potential N+1

- **الموقع:** `convex/invoices.ts:382` — `cancel`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const [productId, quantity] of quantities) { const product = await ctx.db.get(productId as Id<"products">); if (!product) throw new ConvexError("تعذر استعادة مخزون منتج محذوف من الفاتورة"); assertBranchAccess(user, `
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Invoices-8: [Medium] Client-side aggregation

- **الموقع:** `src/components/InvoicesPage.tsx:64` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `invoices.filter(inv => inv.invoiceNumber.includes(search) || inv.customerName.toLowerCase().includes(search.toLowerCase()) ).filter(inv => !filterStatus || inv.status === filterSta`
- **الأثر:** التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.
- **الإصلاح المقترح:** استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.
- **Index / Query design:** Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.

#### Invoices-9: [Medium] Client-side aggregation

- **الموقع:** `src/components/InvoicesPage.tsx:65` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `e.toLowerCase().includes(search.toLowerCase()) ).filter(inv => !filterStatus || inv.status === filterStatus); const activeFiltered = filtered.filter(invoice => invoice.status !== "`
- **الأثر:** التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.
- **الإصلاح المقترح:** استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.
- **Index / Query design:** Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.

#### Invoices-10: [Medium] Client-side aggregation

- **الموقع:** `src/components/InvoicesPage.tsx:66` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `rStatus || inv.status === filterStatus); const activeFiltered = filtered.filter(invoice => invoice.status !== "cancelled"); const totalRevenue = activeFiltered.reduce((s, i) => s +`
- **الأثر:** التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.
- **الإصلاح المقترح:** استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.
- **Index / Query design:** Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.

#### Invoices-11: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/NewInvoicePage.tsx:24` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `ngCart, Search } from "lucide-react"; import type { Id } from "../../convex/_generated/dataModel"; import { usePermission } from "../lib/access"; interface NewInvoicePageProps { on`
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

#### Invoices-12: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/NewInvoicePage.tsx:44` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `e<CartItem[]>([]); const [customerName, setCustomerName] = useState(""); const [customerPhone, setCustomerPhone] = useState(""); const [customerId, setCustomerId] = useState(""); c`
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

#### Invoices-13: [Medium] Client-side aggregation

- **الموقع:** `src/components/NewInvoicePage.tsx:83` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `tId)); }; const updateQuantity = (productId: string, qty: number) => { if (qty <= 0) return removeFromCart(productId); setCart(cart.map(i => i.productId === productId ? { ...i, qua`
- **الأثر:** التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.
- **الإصلاح المقترح:** استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.
- **Index / Query design:** Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.

### Products

عدد البنود: **6**

#### Products-1: [High] Unbounded collect

- **الموقع:** `convex/categories.ts:9` — `list`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `import { query, mutation } from "./_generated/server"; import { ConvexError, v } from "convex/values"; import { requirePermission, logAction } from "./lib/auth"; export const list `
- **الأثر:** الاستعلام غير محدود ويعتمد على حجم الجدول كاملًا؛ الخطر يتصاعد خطيًا مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `categories`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Products-2: [High] Raw document DTO

- **الموقع:** `convex/categories.ts:9` — `list`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `ry({ args: {}, handler: async (ctx) => { await requirePermission(ctx, "view_products"); return await ctx.db.query("categories").collect(); }, }); export const create = mutation({ a`
- **الأثر:** إرجاع مستندات الجدول كاملة يرفع حجم payload وقد يكشف حقولًا داخلية أو مالية لا تحتاجها الواجهة.
- **الإصلاح المقترح:** حوّل النتائج إلى DTO allowlist داخل الـBackend، وأعد فقط الحقول اللازمة للعرض والإجراءات المصرح بها.
- **Index / Query design:** لا يعتمد على Index مباشرة؛ طبّق DTO بعد الاستعلام المحدود للجدول `categories`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، بشرط حصر جميع الحقول التي تستخدمها الواجهة والاختبارات قبل إزالة الباقي.

#### Products-3: [High] Unbounded collect

- **الموقع:** `convex/products.ts:27` — `list`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `فئة المحددة غير موجودة أو تم حذفها"); if (supplierId && !(await ctx.db.get(supplierId))) throw new ConvexError("المورد المحدد غير موجود أو تم حذفه"); } export const list = query({ `
- **الأثر:** الاستعلام غير محدود ويعتمد على حجم الجدول كاملًا؛ الخطر يتصاعد خطيًا مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `products`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Products-4: [High] Unbounded collect

- **الموقع:** `convex/products.ts:157` — `stats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `te(ctx, user, args.id, args.isActive); }, }); export const remove = mutation({ args: { id: v.id("products") }, handler: async (ctx) => { await requirePermission(ctx, "delete_produc`
- **الأثر:** الاستعلام غير محدود ويعتمد على حجم الجدول كاملًا؛ الخطر يتصاعد خطيًا مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `products`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Products-5: [Medium] Unbounded collect

- **الموقع:** `convex/products.ts:123` — `movements`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `s.reason.trim() } }); }, }); export const movements = query({ args: { productId: v.id("products") }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "view`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `inventoryMovements` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Products-6: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/ProductsPage.tsx:45` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `d); setForm({ name: product.name, sku: product.sku, costPrice: product.costPrice?.toString() ?? "", sellPrice: product.sellPrice?.toString() ?? "", stock: product.stock.toString(),`
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

### Delivery/COD

عدد البنود: **17**

#### Delivery/COD-1: [Critical] Unbounded collect

- **الموقع:** `convex/deliveries.ts:146` — `getStats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `tion({ args: { id: v.id("deliveries") }, handler: async () => { throw new ConvexError("استخدم تحديث الحالة إلى ملغاة مع إدخال السبب"); } }); export const getStats = query({ args: {`
- **الأثر:** قراءة جدول كبير بالكامل في طلب واحد قد تتجاوز حدود Convex وتزيد زمن الاستجابة والتكلفة مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `deliveries`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Delivery/COD-2: [High] Potential N+1

- **الموقع:** `convex/deliveries.ts:248` — `unsettled`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `export const createCodSettlement=mutation({args:{deliveryIds:v.array(v.id("deliveries")),sourceAccountId:v.id("financialAccounts"),destinationAccountId:v.id("financialAccounts"),feeAmount:v.number(),date:v.string(),branc`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Delivery/COD-3: [High] Potential N+1

- **الموقع:** `convex/deliveries.ts:250` — `createCodSettlement`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `export const reverseCodSettlement=mutation({args:{settlementId:v.id("codSettlements"),reason:v.string(),date:v.string(),requestId:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"reverse_cod_`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Delivery/COD-4: [Medium] Unbounded collect

- **الموقع:** `convex/deliveries.ts:30` — `list`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `Cost:d.shippingCost,status:d.status, expectedDate:d.expectedDate,deliveredDate:d.deliveredDate,notes:d.notes,branchId:d.branchId, }); export const list = query({ args: { status: v.`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `deliveries` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Delivery/COD-5: [Medium] Unbounded collect

- **الموقع:** `convex/deliveries.ts:31` — `list`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `eredDate,notes:d.notes,branchId:d.branchId, }); export const list = query({ args: { status: v.optional(v.string()), city: v.optional(v.string()) }, handler: async (ctx, args) => { `
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `deliveries` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Delivery/COD-6: [Medium] Unbounded collect

- **الموقع:** `convex/deliveries.ts:154` — `getStats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `= branchId); const pending = d.filter(x => x.status === "pending").length; const shipped = d.filter(x => x.status === "shipped").length; const delivered = d.filter(x => x.status ==`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `codSettlements` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Delivery/COD-7: [Medium] Unbounded collect

- **الموقع:** `convex/deliveries.ts:155` — `getStats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `delivered = d.filter(x => x.status === "delivered").length; const returned = d.filter(x => x.status === "returned").length; const cancelled = d.filter(x => x.status === "cancelled"`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `codSettlements` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Delivery/COD-8: [Medium] Unbounded collect

- **الموقع:** `convex/deliveries.ts:229` — `confirmDelivered`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `جد تأكيد منشور بالفعل");if(delivery.status!=="shipped")throw new ConvexError("يجب شحن التوصيل أولاً"); if(user.role!=="admin"&&user.role!=="accountant"&&user.branchId!==delivery.br`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `deliveryConfirmations` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Delivery/COD-9: [Medium] Unbounded collect

- **الموقع:** `convex/deliveries.ts:239` — `accountPicker`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `rmation_cod"),v.literal("settlement_source"),v.literal("settlement_destination"))},handler:async(ctx,args)=>{const permission=args.purpose==="confirmation_cod"?"confirm_cod_deliver`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `financialAccounts` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Delivery/COD-10: [Medium] Unbounded collect

- **الموقع:** `convex/deliveries.ts:241` — `creationOptions`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `anchId",branchId)).collect();return rows.filter(x=>x.isActive&&types.includes(x.type)).map(x=>({_id:x._id,name:x.name,type:x.type,branchId:x.branchId}));}}); export const creationO`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `invoices` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Delivery/COD-11: [Medium] Unbounded collect

- **الموقع:** `convex/deliveries.ts:243` — `confirmationHistory`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `tTotal:i.netTotal??i.total,paid:i.paid,remaining:i.remaining}))}));}}); export const confirmationHistory=query({args:{deliveryId:v.id("deliveries")},handler:async(ctx,args)=>{const`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `deliveryConfirmations` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Delivery/COD-12: [Medium] Unbounded collect

- **الموقع:** `convex/deliveries.ts:246` — `unsettled`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `AccountId:v.id("financialAccounts")},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"view_cod_settlements"),branchId=selectableBranch(user,args.branchId);const ac`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `deliveries` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Delivery/COD-13: [Medium] Unbounded collect

- **الموقع:** `convex/deliveries.ts:250` — `reverseCodSettlement`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ement.status==="reversed")throw new ConvexError("سبق عكس التسوية بطلب مختلف");await requireFinanceInitialized(ctx,args.date);const reversal=await reversePostedFinancialTransaction(`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `codSettlementItems` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Delivery/COD-14: [Medium] Unbounded collect

- **الموقع:** `convex/deliveries.ts:257` — `legacyReview`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `mentNumber:s.settlementNumber,date:s.date,status:s.status,grossAmount:s.grossAmount,feeAmount:s.feeAmount,netAmount:s.netAmount,branchId:s.branchId,reversalReason:s.reversalReason}`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `deliveries` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Delivery/COD-15: [Medium] Unbounded collect

- **الموقع:** `convex/deliveries.ts:259` — `printCodSettlement`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `port const printCodSettlement=query({args:{settlementId:v.id("codSettlements")},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"print_cod_settlements"),s=await ct`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `codSettlementItems` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Delivery/COD-16: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/DeliveriesPage.tsx:149` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `ts, canViewSettlements && activeBranch ? { branchId: activeBranch } : "skip", { initialNumItems: 10 }, ); const deliveryDetails = useQuery( api.deliveries.get, modal === "details" `
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

#### Delivery/COD-17: [Medium] Client-side aggregation

- **الموقع:** `src/components/DeliveriesPage.tsx:150` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `); const chosenOrder = options?.find((order) => String(order.orderId) === orderId); const chosenInvoice = chosenOrder?.invoices.find((invoice) => String(invoice.invoiceId) === invo`
- **الأثر:** التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.
- **الإصلاح المقترح:** استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.
- **Index / Query design:** Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.

### Repairs

عدد البنود: **14**

#### Repairs-1: [Critical] Unbounded collect

- **الموقع:** `convex/repairs.ts:1003` — `getStats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `nvexError("أمر الصيانة غير موجود"); const date = args.date ?? new Date().toISOString().slice(0, 10); return transitionRepair(ctx, user, { ...args, date, requestId: args.requestId ?`
- **الأثر:** قراءة جدول كبير بالكامل في طلب واحد قد تتجاوز حدود Convex وتزيد زمن الاستجابة والتكلفة مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `repairs`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Repairs-2: [Medium] Unindexed first

- **الموقع:** `convex/lib/generalLedgerRepairs.ts:19` — `repairPostingState`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `ated/server"; import type { AuthUser } from "./auth"; import { postJournal, type PostingLine } from "./generalLedger.ts"; import { assertIsoDate, fromCents, toCents, } from "./gene`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `generalLedgerSettings` يطابق مفاتيح البحث والترتيب المستخدمة في `repairPostingState`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### Repairs-3: [Medium] Unindexed first

- **الموقع:** `convex/lib/generalLedgerRepairs.ts:27` — `operationalSettings`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `"cogs"; export async function repairPostingState(ctx: MutationCtx) { const settings = await ctx.db.query("generalLedgerSettings").first(); return { financial: settings?.financialPo`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `generalLedgerSettings` يطابق مفاتيح البحث والترتيب المستخدمة في `operationalSettings`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### Repairs-4: [Medium] Unbounded collect

- **الموقع:** `convex/lib/generalLedgerRepairs.ts:180` — `reverseRepairRevenueJournal`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `lEntryId); if ( !original || original.branchId !== input.branchId || original.referenceType !== "repair" || original.referenceId !== String(input.repairId) ) { throw new ConvexErro`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `journalLines` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Repairs-5: [Medium] Potential N+1

- **الموقع:** `convex/repairs.ts:71` — `canonicalPartRequests`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const row of rows) { if (!Number.isInteger(row.quantity) || row.quantity <= 0) { throw new ConvexError("كمية قطعة الغيار يجب أن تكون عددًا صحيحًا أكبر من صفر"); } const key = String(row.productId); if (seen.has(key)`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Repairs-6: [Medium] Potential N+1

- **الموقع:** `convex/repairs.ts:90` — `prepareRepairParts`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const row of parts) { const product = await ctx.db.get(row.productId); if (!product || !product.isActive) { throw new ConvexError("قطعة الغيار غير موجودة أو غير نشطة"); } if (product.branchId !== branchId) { throw n`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Repairs-7: [Medium] Unbounded collect

- **الموقع:** `convex/repairs.ts:230` — `list`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `t user = await requireModulePermission(ctx, "view_repairs", "repairs"); const requestedBranchId = args.branchId; if (requestedBranchId) assertBranchAccess(user, { branchId: request`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `repairs` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Repairs-8: [Medium] Unbounded collect

- **الموقع:** `convex/repairs.ts:257` — `partPicker`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `rn repair ? publicRepair(repair, user.permissions.includes("view_profits")) : null; }, }); export const partPicker = query({ args: { branchId: v.optional(v.id("branches")) }, handl`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `products` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Repairs-9: [Medium] Unbounded collect

- **الموقع:** `convex/repairs.ts:281` — `technicianPicker`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `sku, stock, unit, sellPrice, branchId, })); }, }); export const technicianPicker = query({ args: { branchId: v.optional(v.id("branches")) }, handler: async (ctx, args) => { const u`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `userProfiles` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Repairs-10: [Medium] Potential N+1

- **الموقع:** `convex/repairs.ts:307` — `historyPaginated`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `result.page.map(async (entry) => ({ _id: entry._id, fromStatus: entry.fromStatus, toStatus: entry.toStatus, date: entry.date, diagnosis: entry.diagnosisSnapshot, technicianName: entry.technicianNameSnapshot, qualityCheck`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Repairs-11: [Medium] Unbounded collect

- **الموقع:** `convex/repairs.ts:334` — `repairForPrint`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `port const repairForPrint = query({ args: { id: v.id("repairs") }, handler: async (ctx, args) => { const user = await requireModulePermission(ctx, "print_repairs", "repairs"); cons`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `repairStatusHistory` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Repairs-12: [Medium] Potential N+1

- **الموقع:** `convex/repairs.ts:369` — `repairForPrint`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `history.map(async (entry) => ({ fromStatus: entry.fromStatus, toStatus: entry.toStatus, date: entry.date, reason: entry.reason, employeeName: await resolveEmployeeName(ctx, entry.changedBy), })), ), }; }, }); export cons`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Repairs-13: [Medium] Potential N+1

- **الموقع:** `convex/repairs.ts:833` — `updateDetails`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const part of repair.parts) { if ( !part.productId || part.inventoryValueRemoved === undefined || !Number.isFinite(part.inventoryValueRemoved) ) { throw new ConvexError( "أمر الصيانة القديم يحتوي قطعًا بلا تكلفة مخز`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Repairs-14: [Medium] Client-side aggregation

- **الموقع:** `src/components/RepairsPage.tsx:216` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `collectionTarget ? collectionAccounts.filter( (account) => account.branchId === collectionTarget.branchId, ) : []; const targetRefundAccounts = refundTarget ? refundAccounts.filter`
- **الأثر:** التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.
- **الإصلاح المقترح:** استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.
- **Index / Query design:** Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.

### Customers

عدد البنود: **24**

#### Customers-1: [High] Unbounded collect

- **الموقع:** `convex/customerLedger.ts:15` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `./lib/customerLedger.ts"; function assertLedgerBranch(user: AuthUser, branchId: Id<"branches">) { if (user.role !== "admin" && user.role !== "accountant" && user.branchId !== branc`
- **الأثر:** الاستعلام غير محدود ويعتمد على حجم الجدول كاملًا؛ الخطر يتصاعد خطيًا مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `branches`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Customers-2: [High] Potential N+1

- **الموقع:** `convex/customerLedger.ts:27` — `branchBalances`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `return Promise.all(balances.map(async balance => { const customer = await ctx.db.get(balance.customerId); return { customerId: balance.customerId, customerName: customer?.name ?? "عميل غير معروف", phone: customer?.phone `
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Customers-3: [High] Potential N+1

- **الموقع:** `convex/customerLedger.ts:35` — `customerOptions`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `return { cutoverDate: settings?.cutoverDate ?? null, customers: await Promise.all(customers.map(async customer => { const balance = await ctx.db.query("customerBalances").withIndex("by_customer_branch", q => q.eq("custom`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Customers-4: [High] Potential N+1

- **الموقع:** `convex/customerLedger.ts:53` — `statementForPrint`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `const safeEntries = await Promise.all(entries.map(async entry => { let profile = await ctx.db.query("userProfiles").withIndex("by_user", q => q.eq("userId", entry.createdBy)).first(); if (!profile) profile = await ctx.db`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Customers-5: [High] Potential N+1

- **الموقع:** `convex/lib/customerLedger.ts:68` — `postCustomerLedgerEntry`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const value of [input.receivableDelta, input.advanceDelta, input.purchasesDelta]) if (!precise(value)) throw new ConvexError("قيم دفتر العميل يجب أن تكون finite ومقربة إلى قرشين"); if (!isValidIsoDate(input.date)) t`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Customers-6: [Medium] Unbounded collect

- **الموقع:** `convex/customerLedger.ts:26` — `branchBalances`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `er = await requirePermission(ctx, "initialize_customer_ledger"); assertLedgerBranch(user, args.branchId); return initializeCustomerBalance(ctx, user, args); } }); export const bran`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `customerBalances` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Customers-7: [Medium] Unbounded collect

- **الموقع:** `convex/customerLedger.ts:34` — `customerOptions`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `rOptions = query({ args: { branchId: v.id("branches") }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "view_customer_ledger"); assertLedgerBranch(user,`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `customerBalances` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Customers-8: [Medium] Unbounded collect

- **الموقع:** `convex/customerLedger.ts:52` — `statementForPrint`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `= await requirePermission(ctx, "print_customer_statements"); assertLedgerBranch(user, args.branchId); const customer = await ctx.db.get(args.customerId), branch = await ctx.db.get(`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `userProfiles` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Customers-9: [Medium] Unbounded collect

- **الموقع:** `convex/customerLedger.ts:60` — `legacyReview`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `In: entries.reduce((sum, x) => sum + Math.max(x.purchasesDelta, 0), 0), purchasesOut: entries.reduce((sum, x) => sum + Math.max(-x.purchasesDelta, 0), 0) } }; } }); export const le`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `customers` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Customers-10: [Medium] Unbounded collect

- **الموقع:** `convex/customers.ts:46` — `assertUniqueCustomerPhone`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `alContactText(input.notes, 1000), }; } catch { throw new ConvexError("أدخل اسمًا ورقم هاتف صحيحين، وتأكد من أطوال بيانات العميل"); } } async function assertUniqueCustomerPhone( ctx`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `customers` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Customers-11: [Medium] Unbounded collect

- **الموقع:** `convex/customers.ts:50` — `assertUniqueCustomerPhone`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `انات العميل"); } } async function assertUniqueCustomerPhone( ctx: MutationCtx, branchId: Id<"branches"> | undefined, phone: string, exceptId?: Id<"customers">, ) { const exactMatch`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `customers` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Customers-12: [Medium] Unbounded collect

- **الموقع:** `convex/customers.ts:56` — `assertUniqueCustomerPhone`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `? await ctx.db .query("customers") .withIndex("by_branch_phone", (q) => q.eq("branchId", branchId).eq("phone", phone), ) .collect() : await ctx.db .query("customers") .withIndex("b`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `customers` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Customers-13: [Medium] Unbounded collect

- **الموقع:** `convex/customers.ts:60` — `assertUniqueCustomerPhone`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ne", phone), ) .collect() : await ctx.db .query("customers") .withIndex("by_phone", (q) => q.eq("phone", phone)) .collect(); const branchCustomers = exactMatches.length === 0 ? bra`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `customers` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Customers-14: [Medium] Unbounded collect

- **الموقع:** `convex/customers.ts:93` — `list`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `= query({ args: { branchId: v.optional(v.id("branches")) }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "view_customers"); if (args.branchId) assertBr`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `customers` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Customers-15: [Medium] Unbounded collect

- **الموقع:** `convex/customers.ts:95` — `list`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `tx, args) => { const user = await requirePermission(ctx, "view_customers"); if (args.branchId) assertBranchAccess(user, { branchId: args.branchId }); const branchId = user.role ===`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `customers` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Customers-16: [Medium] Unbounded collect

- **الموقع:** `convex/customers.ts:115` — `repairPicker`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `handler: async (ctx, args) => { const user = await requirePermission(ctx, "create_repairs"); const requestedBranchId = args.branchId; if (requestedBranchId) assertBranchAccess(user`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `customers` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Customers-17: [Medium] Unindexed first

- **الموقع:** `convex/customers.ts:154` — `create`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `create_customers"); const branchId = resolveWriteBranch(user, args.branchId); const normalized = customerData(args); await assertUniqueCustomerPhone(ctx, branchId, normalized.phone`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `financeSettings` يطابق مفاتيح البحث والترتيب المستخدمة في `create`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### Customers-18: [Medium] Unbounded collect

- **الموقع:** `convex/lib/customerLedger.ts:32` — `deriveCustomerLedgerOpeningState`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `dgerOpeningState> { const customer = await ctx.db.get(customerId); if (!customer || customer.branchId !== branchId) throw new ConvexError("العميل لا ينتمي إلى الفرع المحدد"); const`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `invoices` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Customers-19: [Medium] Unbounded collect

- **الموقع:** `convex/lib/customerLedger.ts:35` — `deriveCustomerLedgerOpeningState`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `branch", q => q.eq("customerId", customerId).eq("branchId", branchId)).unique(); const entries = await ctx.db.query("customerLedgerEntries").withIndex("by_customer_branch_date", q `
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `repairs` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Customers-20: [Medium] Unbounded collect

- **الموقع:** `convex/lib/customerLedger.ts:36` — `deriveCustomerLedgerOpeningState`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `wait ctx.db.query("customerLedgerEntries").withIndex("by_customer_branch_date", q => q.eq("customerId", customerId).eq("branchId", branchId)).collect(); const references = new Set(`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `repairs` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Customers-21: [Medium] Unbounded collect

- **الموقع:** `convex/lib/customerLedger.ts:37` — `deriveCustomerLedgerOpeningState`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `", customerId).eq("branchId", branchId)).collect(); const references = new Set(entries.map(entry => '${entry.referenceType}:${entry.referenceId}')); const [invoices, orders, repair`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `repairs` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Customers-22: [Medium] Unindexed first

- **الموقع:** `convex/lib/customerLedger.ts:76` — `postCustomerLedgerEntry`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `trim() }; const customer = await ctx.db.get(input.customerId); const branch = await ctx.db.get(input.branchId); if (!customer) throw new ConvexError("العميل غير موجود"); if (!branc`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `financeSettings` يطابق مفاتيح البحث والترتيب المستخدمة في `postCustomerLedgerEntry`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### Customers-23: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/CustomersPage.tsx:109` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `etActive); const balanceFor = (id: Id<"customers">) => balances?.find((balance) => balance.customerId === id); const hasBalanceScope = canViewLedger && Boolean(effectiveBranchId) &`
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

#### Customers-24: [Medium] Client-side aggregation

- **الموقع:** `src/components/CustomersPage.tsx:301` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `ance ?? 0) > 0, ).length : "—" } color="amber" /> <StatCard label="إجمالي المديونيات" value={ balancesLoading ? "…" : hasBalanceScope ? '${(balances ?? []) .reduce( (sum, balance) `
- **الأثر:** التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.
- **الإصلاح المقترح:** استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.
- **Index / Query design:** Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.

### Suppliers

عدد البنود: **22**

#### Suppliers-1: [High] Potential N+1

- **الموقع:** `convex/supplierPayments.ts:34` — `create`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `const receipts = await Promise.all(sorted.map(async allocation => { const receipt = await ctx.db.get(allocation.purchaseReceiptId); if (!receipt) throw new ConvexError("مستند شراء غير موجود"); if (receipt.supplierId !== `
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Suppliers-2: [High] Potential N+1

- **الموقع:** `convex/supplierPayments.ts:39` — `create`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (let index = 0; index < sorted.length; index++) await ctx.db.insert("supplierPaymentAllocations", { paymentId, purchaseReceiptId: receipts[index]._id, receiptNumber: receipts[index].receiptNumber, supplierId: supplie`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Suppliers-3: [High] Potential N+1

- **الموقع:** `convex/supplierPayments.ts:42` — `create`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (let index = 0; index < sorted.length; index++) await ctx.db.patch(receipts[index]._id, derivePurchaseReceiptState(receipts[index].netPayableAmount ?? receipts[index].payableAmount, receipts[index].paidAmount + sorte`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Suppliers-4: [High] Potential N+1

- **الموقع:** `convex/supplierPayments.ts:57` — `reverse`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const allocation of allocations) { const receipt = await ctx.db.get(allocation.purchaseReceiptId); if (!receipt) throw new ConvexError("مستند شراء مرتبط مفقود"); const net=receipt.netPayableAmount??receipt.payableAm`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Suppliers-5: [High] Potential N+1

- **الموقع:** `convex/supplierPayments.ts:60` — `reverse`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const allocation of allocations) { const receipt = await ctx.db.get(allocation.purchaseReceiptId); if (!receipt) throw new ConvexError("مستند شراء مرتبط مفقود"); await ctx.db.patch(receipt._id, reverseAllocatedPayme`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Suppliers-6: [High] Potential N+1

- **الموقع:** `convex/supplierPayments.ts:67` — `list`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `export const receiptHistory = query({ args: { purchaseReceiptId: v.id("purchaseReceipts") }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "view_supplier_ledger"); const receipt = await ctx.db`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Suppliers-7: [High] Unbounded collect

- **الموقع:** `convex/supplierPayments.ts:69` — `supplierOptions`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ountName: payment.accountName, amount: payment.amount, notes: payment.notes, status: payment.status, createdBy: creator?.name ?? "مستخدم غير معروف", allocations: allocations.map(ro`
- **الأثر:** الاستعلام غير محدود ويعتمد على حجم الجدول كاملًا؛ الخطر يتصاعد خطيًا مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `suppliers`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Suppliers-8: [High] Unbounded collect

- **الموقع:** `convex/suppliers.ts:67` — `list`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `query("suppliers").collect() : exactMatches; if (suppliers.some((supplier) => { if (supplier._id === exceptId) return false; try { return normalizeContactPhone(supplier.phone) === `
- **الأثر:** الاستعلام غير محدود ويعتمد على حجم الجدول كاملًا؛ الخطر يتصاعد خطيًا مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `suppliers`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Suppliers-9: [Medium] Unbounded collect

- **الموقع:** `convex/supplierPayments.ts:56` — `reverse`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `row new ConvexError("تم عكس سند الدفع سابقاً بطلب عكس مختلف"); if (payment.reversalFingerprint !== reversalFingerprint) throw new ConvexError("أعيد استخدام معرف طلب العكس بتاريخ أو`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `supplierPaymentAllocations` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Suppliers-10: [Medium] Unbounded collect

- **الموقع:** `convex/supplierPayments.ts:65` — `openPurchaseReceipts`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `lId; } }); export const openPurchaseReceipts = query({ args: { supplierId: v.id("suppliers"), branchId: v.optional(v.id("branches")) }, handler: async (ctx, args) => { const user =`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `purchaseReceipts` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Suppliers-11: [Medium] Unbounded collect

- **الموقع:** `convex/supplierPayments.ts:67` — `receiptHistory`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `eCursor: result.continueCursor }; } }); export const receiptHistory = query({ args: { purchaseReceiptId: v.id("purchaseReceipts") }, handler: async (ctx, args) => { const user = aw`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `supplierPaymentAllocations` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Suppliers-12: [Medium] Unbounded collect

- **الموقع:** `convex/supplierPayments.ts:68` — `print`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `eversalDate: payment.reversalDate }; })); } }); export const print = query({ args: { paymentId: v.id("supplierPayments") }, handler: async (ctx, args) => { const user = await requi`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `userProfiles` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Suppliers-13: [Medium] Unbounded collect

- **الموقع:** `convex/suppliers.ts:47` — `assertUniqueSupplierPhone`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ontactEmail(input.email), address: normalizeOptionalContactText(input.address, 300), notes: normalizeOptionalContactText(input.notes, 1000), }; } catch { throw new ConvexError("أدخ`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `suppliers` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Suppliers-14: [Medium] Unbounded collect

- **الموقع:** `convex/suppliers.ts:49` — `assertUniqueSupplierPhone`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `notes: normalizeOptionalContactText(input.notes, 1000), }; } catch { throw new ConvexError("أدخل اسمًا ورقم هاتف صحيحين، وتأكد من أطوال بيانات المورد"); } } async function assertUn`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `suppliers` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Suppliers-15: [Medium] Unbounded collect

- **الموقع:** `convex/suppliers.ts:85` — `branchBalances`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `uppliers", "suppliers"); const supplier = await ctx.db.get(args.id); return supplier ? publicSupplier(supplier) : null; }, }); export const branchBalances = query({ args: { branchI`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `supplierBalances` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Suppliers-16: [Medium] Unbounded collect

- **الموقع:** `convex/suppliers.ts:95` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ranchAccess(user, { branchId: args.branchId }); const balances = await ctx.db.query("supplierBalances").withIndex("by_branch", q => q.eq("branchId", args.branchId)).collect(); retu`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `branches` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Suppliers-17: [Medium] Unbounded collect

- **الموقع:** `convex/suppliers.ts:141` — `legacyReview`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `eceipt = query({ args: { id: v.id("purchaseReceipts") }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "view_supplier_ledger"); const receipt = await ct`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `suppliers` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Suppliers-18: [Medium] Unbounded collect

- **الموقع:** `convex/suppliers.ts:143` — `legacyReview`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `supplier_ledger"); const receipt = await ctx.db.get(args.id); if (receipt) assertBranchAccess(user, receipt); return receipt; } }); export const legacyReview = query({ args: {}, ha`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `suppliers` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Suppliers-19: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/SupplierPaymentsPage.tsx:24` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `ts.openPurchaseReceipts, supplierId && effectiveBranchId && canRecord ? { supplierId, branchId: effectiveBranchId } : "skip") ?? []; const balance = useQuery(api.supplierPayments.s`
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

#### Suppliers-20: [Medium] Client-side aggregation

- **الموقع:** `src/components/SupplierPaymentsPage.tsx:28` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `ments"> | null>(null); const printDto = useQuery(api.supplierPayments.print, canPrint && printPaymentId ? { paymentId: printPaymentId } : "skip"); const createPayment = useMutation`
- **الأثر:** التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.
- **الإصلاح المقترح:** استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.
- **Index / Query design:** Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.

#### Suppliers-21: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/SupplierPaymentsPage.tsx:29` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `ierPayments"> | null>(null); const printDto = useQuery(api.supplierPayments.print, canPrint && printPaymentId ? { paymentId: printPaymentId } : "skip"); const createPayment = useMu`
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

#### Suppliers-22: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/SuppliersPage.tsx:122` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `ffectiveBranch, } : "skip"; const { results: ledgerEntries, status: ledgerStatus, loadMore: loadMoreLedger, } = usePaginatedQuery(api.suppliers.ledger, ledgerArgs, { initialNumItem`
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

### Finance

عدد البنود: **23**

#### Finance-1: [High] Potential N+1

- **الموقع:** `convex/finance.ts:54` — `confirmInitialization`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `const branches = await ctx.db.query("branches").collect(); for (const branch of branches.filter(b => b.isActive)) { const accounts = await ctx.db.query("financialAccounts").withIndex("by_branch", q => q.eq("branchId", br`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Finance-2: [High] Potential N+1

- **الموقع:** `convex/finance.ts:93` — `disbursementAccountPicker`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `export const accounts = query({ args: { branchId: v.optional(v.id("branches")), onDate: v.optional(v.string()) }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "view_finance"); const branchId `
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Finance-3: [High] Unbounded collect

- **الموقع:** `convex/finance.ts:94` — `initializationStatus`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `{ const availableBalance = await calculateAvailableBalance(ctx, account._id, args.onDate ?? new Date().toISOString().slice(0, 10)); return { ...account, availableBalance, pendingBa`
- **الأثر:** الاستعلام غير محدود ويعتمد على حجم الجدول كاملًا؛ الخطر يتصاعد خطيًا مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `financialAccounts`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Finance-4: [High] Potential N+1

- **الموقع:** `convex/finance.ts:95` — `initializationStatus`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `export const ledger = query({ args: { branchId: v.optional(v.id("branches")), accountId: v.optional(v.id("financialAccounts")), paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => { const user = awai`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Finance-5: [Medium] Unindexed first

- **الموقع:** `convex/finance.ts:35` — `configureInitialization`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `.isActive ?? account.isActive, updatedAt: Date.now() }); } }); export const configureInitialization = mutation({ args: { cutoverDate: v.string(), defaultClearingDelayDays: v.number`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `financeSettings` يطابق مفاتيح البحث والترتيب المستخدمة في `configureInitialization`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### Finance-6: [Medium] Unindexed first

- **الموقع:** `convex/finance.ts:42` — `postOpeningBalance`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `export const postOpeningBalance = mutation({ args: { accountId: v.id("financialAccounts"), amount: v.number(), date: v.string(), requestId: v.string() }, handler: async (ctx, args)`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `financeSettings` يطابق مفاتيح البحث والترتيب المستخدمة في `postOpeningBalance`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### Finance-7: [Medium] Unindexed first

- **الموقع:** `convex/finance.ts:53` — `confirmInitialization`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `Amount: args.amount }], allowBeforeInitialization: true }); if (!posted.duplicate) await ctx.db.patch(account._id, { openingBalancePostedAt: Date.now(), updatedAt: Date.now() }); r`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `financeSettings` يطابق مفاتيح البحث والترتيب المستخدمة في `confirmInitialization`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### Finance-8: [Medium] Unbounded collect

- **الموقع:** `convex/finance.ts:54` — `confirmInitialization`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ePostedAt: Date.now(), updatedAt: Date.now() }); return posted.transactionId; } }); export const confirmInitialization = mutation({ args: {}, handler: async (ctx) => { const user =`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `financialAccounts` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Finance-9: [Medium] Unbounded collect

- **الموقع:** `convex/finance.ts:84` — `reverseTransaction`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `مستخدم ببيانات مختلفة"); return retry._id; } if (original.status === "reversed" || original.reversalTransactionId) throw new ConvexError("تم عكس المعاملة سابقاً"); if (!["opening_b`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `financialMovements` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Finance-10: [Medium] Unbounded collect

- **الموقع:** `convex/finance.ts:90` — `collectionAccountPicker`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `)) }); if (!posted.duplicate) await ctx.db.patch(original._id, { status: "reversed", reversedAt: Date.now(), reversedBy: user.userId, reversalReason: reason, reversalTransactionId:`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `financialAccounts` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Finance-11: [Medium] Unbounded collect

- **الموقع:** `convex/finance.ts:91` — `refundAccountPicker`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ndex("by_active", q => q.eq("isActive", true)).collect(); return accounts.filter(a => user.role === "admin" || user.role === "accountant" || a.branchId === user.branchId).map(({ _i`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `financialAccounts` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Finance-12: [Medium] Unbounded collect

- **الموقع:** `convex/finance.ts:92` — `disbursementAccountPicker`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `_active", q => q.eq("isActive", true)).collect(); return accounts.filter(a => user.role === "admin" || user.role === "accountant" || a.branchId === user.branchId).map(({ _id, name,`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `financialAccounts` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Finance-13: [Medium] Unbounded collect

- **الموقع:** `convex/finance.ts:93` — `accounts`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `{ _id, name, type, branchId }) => ({ _id, name, type, branchId })); } }); export const accounts = query({ args: { branchId: v.optional(v.id("branches")), onDate: v.optional(v.strin`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `financialAccounts` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Finance-14: [Medium] Unindexed first

- **الموقع:** `convex/finance.ts:94` — `initializationStatus`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `ableBalance = await calculateAvailableBalance(ctx, account._id, args.onDate ?? new Date().toISOString().slice(0, 10)); return { ...account, availableBalance, pendingBalance: roundM`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `financialAccounts` يطابق مفاتيح البحث والترتيب المستخدمة في `initializationStatus`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### Finance-15: [Medium] Unbounded collect

- **الموقع:** `convex/finance.ts:97` — `legacyReview`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `.name, employeeName: employee?.name ?? transaction.userId, transactionStatus: transaction.status, feeAmount: transaction.feeAmount, incoming: movement.signedAmount > 0 ? movement.s`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `payments`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Finance-16: [Medium] Unbounded collect

- **الموقع:** `convex/finance.ts:98` — `legacyPaymentsCount`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `t(), ctx.db.query("payments").collect()]); return { invoicesWithPaid: invoices.filter(x => x.paid > 0).length, ordersWithDeposit: orders.filter(x => x.deposit > 0).length, repairsW`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `payments`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Finance-17: [Medium] Unbounded collect

- **الموقع:** `convex/finance.ts:100` — `referenceTransactions`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `args: {}, handler: async ctx => { await requireAdmin(ctx); return { count: (await ctx.db.query("payments").collect()).length }; } }); export const referenceTransactions = query({ a`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `financialTransactions` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Finance-18: [Medium] Unbounded collect

- **الموقع:** `convex/finance.ts:102` — `dailySummary`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `row.branchId === user.branchId); } }); export const dailySummary = query({ args: { branchId: v.id("branches"), date: v.string() }, handler: async (ctx, args) => { const user = awai`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `financialMovements` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Finance-19: [Medium] Unbounded collect

- **الموقع:** `convex/finance.ts:104` — `collectionSummary`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ounts.map(a => calculateAvailableBalance(ctx, a._id, args.date)))).reduce((s, n) => s + n, 0)) }; } }); export const collectionSummary = query({ args: { branchId: v.id("branches"),`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `financialTransactions` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Finance-20: [Medium] Unindexed first

- **الموقع:** `convex/lib/finance.ts:45` — `requireFinanceInitialized`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `cialAccountBranch(account: Doc<"financialAccounts">, branchId: Id<"branches">): void { if (account.branchId !== branchId) throw new ConvexError("الحساب المالي لا ينتمي إلى فرع المس`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `financeSettings` يطابق مفاتيح البحث والترتيب المستخدمة في `requireFinanceInitialized`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### Finance-21: [Medium] Unbounded collect

- **الموقع:** `convex/lib/finance.ts:59` — `calculateAvailableBalance`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ncludes(account.type)) return undefined; const value = new Date('${date}T00:00:00.000Z'); value.setUTCDate(value.getUTCDate() + account.settlementDelayDays); return value.toISOStri`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `financialMovements` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Finance-22: [Medium] Potential N+1

- **الموقع:** `convex/lib/finance.ts:121` — `postFinancialTransaction`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const movement of prepared) { await ctx.db.patch(movement.account._id, { currentBalance: movement.after, updatedAt: Date.now() }); await ctx.db.insert("financialMovements", { transactionId, accountId: movement.accou`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Finance-23: [Medium] Unbounded collect

- **الموقع:** `convex/lib/finance.ts:146` — `reversePostedFinancialTransaction`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ncialTransactionByRequest(ctx, "reversal", user.userId, input.requestId); if (existing) { if (existing.originalTransactionId !== original._id) throw new ConvexError("معرف طلب العكس`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `financialMovements` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

### General Ledger

عدد البنود: **41**

#### General Ledger-1: [High] Potential N+1

- **الموقع:** `convex/generalLedger.ts:23` — `initialize`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for(const item of DEFAULT_CHART){const parentId=item.parentCode?ids.get(item.parentCode):undefined;if(item.parentCode&&!parentId)throw new ConvexError("قالب الدليل غير مرتب");const id=await ctx.db.insert("chartOfAccounts`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### General Ledger-2: [High] Unbounded collect

- **الموقع:** `convex/generalLedger.ts:27` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `Id,initializationFingerprint:fp}); await logAction(ctx,user,{action:"initialize",module:"general_ledger",recordId:String(id),details:"Foundation only; operational posting disabled"`
- **الأثر:** الاستعلام غير محدود ويعتمد على حجم الجدول كاملًا؛ الخطر يتصاعد خطيًا مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `branches`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-3: [High] Potential N+1

- **الموقع:** `convex/generalLedger.ts:89` — `accountLedgerPaginated`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for(const line of result.page){runningBalance+=signed(line.debit,line.credit);const entry=await ctx.db.get(line.entryId);page.push({entryNumber:line.entryNumber,date:line.entryDate,lineNumber:line.lineNumber,description:`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### General Ledger-4: [High] Potential N+1

- **الموقع:** `convex/generalLedger.ts:92` — `accountLedgerPaginated`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `async function trial(ctx:QueryCtx,branchId:Id<"branches">,periodKey:string){const prior=await ctx.db.query("generalLedgerPeriodBalances").withIndex("by_branch_period",q=>q.eq("branchId",branchId).lt("periodKey",periodKey`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### General Ledger-5: [High] Potential N+1

- **الموقع:** `convex/lib/generalLedger.ts:47` — `postJournal`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for(const [index,line] of input.lines.entries()) { const debit=toCents(line.debit),credit=toCents(line.credit); if((debit>0)===(credit>0)) throw new ConvexError("كل سطر يجب أن يحتوي مدينًا أو دائنًا موجبًا فقط"); const i`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### General Ledger-6: [Medium] Unindexed first

- **الموقع:** `convex/generalLedger.ts:28` — `status`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `(branch=>branch.isActive).map(branch=>({_id:branch._id,name:branch.name}));}if(!user.branchId)throw new ConvexError("المستخدم غير مربوط بفرع");const branch=await ctx.db.get(user.br`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `generalLedgerSettings` يطابق مفاتيح البحث والترتيب المستخدمة في `status`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### General Ledger-7: [Medium] Unindexed first

- **الموقع:** `convex/generalLedger.ts:30` — `enableFinancialPosting`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `uery({args:{cutoverDate:v.string()},handler:async(ctx,args)=>{await requirePermission(ctx,"initialize_general_ledger");return financialPostingReadiness(ctx,args.cutoverDate);}}); e`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `generalLedgerSettings` يطابق مفاتيح البحث والترتيب المستخدمة في `enableFinancialPosting`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### General Ledger-8: [Medium] Unbounded collect

- **الموقع:** `convex/generalLedger.ts:31` — `chart`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `,{action:"activate_financial_posting",module:"general_ledger",recordId:String(settings._id),details:'Financial bridge cutover ${args.cutoverDate}'});return {enabled:settings.financ`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `chartOfAccounts` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-9: [Medium] Unbounded collect

- **الموقع:** `convex/generalLedger.ts:32` — `accountPicker`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `.eq("isActive",true)).collect();return rows.map(a=>({_id:a._id,code:a.code,nameAr:a.nameAr,nameEn:a.nameEn,parentId:a.parentId,accountClass:a.accountClass,normalSide:a.normalSide,i`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `chartOfAccounts` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-10: [Medium] Unbounded collect

- **الموقع:** `convex/generalLedger.ts:36` — `closePeriod`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `od=mutation({args:{periodKey:v.string(),reason:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"close_accounting_periods"),p=await ctx.db.query("accoun`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `generalLedgerPeriodBalances` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-11: [Medium] Unbounded collect

- **الموقع:** `convex/generalLedger.ts:38` — `periods`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `s!=="closed"||!reason)throw new ConvexError("الفترة أو السبب غير صالح");await ctx.db.patch(p._id,{status:"open",reopenedAt:Date.now(),reopenedBy:user.userId,reopenReason:reason});a`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `accountingPeriods` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-12: [Medium] Unbounded collect

- **الموقع:** `convex/generalLedger.ts:45` — `reverseJournal`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `irePermission(ctx,"reverse_journal_entries"),original=await ctx.db.get(args.entryId),reason=normalizeText(args.reason),reversalDate=assertIsoDate(args.reversalDate),requestId=norma`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `journalLines` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-13: [Medium] Unbounded collect

- **الموقع:** `convex/generalLedger.ts:54` — `entriesPaginated`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `y)).unique();return byToken?.name??"مستخدم غير معروف";} async function details(ctx:QueryCtx,entryId:Id<"journalEntries">,print=false){const user=await requirePermission(ctx,print?"`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `journalLines` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-14: [Medium] Unbounded collect

- **الموقع:** `convex/generalLedger.ts:66` — `accountLedgerPaginated`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `debit; const sumLines=(rows:Array<{debit:number;credit:number}>)=>rows.reduce((sum,row)=>sum+signed(row.debit,row.credit),0); const sumPeriods=(rows:Array<{debitTotal:number;credit`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `journalLines` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-15: [Medium] Unbounded collect

- **الموقع:** `convex/generalLedger.ts:67` — `accountLedgerPaginated`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `d(row.debitTotal,row.creditTotal),0); const fromPeriod=periodKeyOf(from); const priorPeriods=await ctx.db.query("generalLedgerPeriodBalances").withIndex("by_account_branch_period",`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `journalLines` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-16: [Medium] Unbounded collect

- **الموقع:** `convex/generalLedger.ts:74` — `accountLedgerPaginated`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `args.accountId).eq("branchId",branchId).gte("entryDate",from).lte("entryDate",to)).order("asc").paginate(args.paginationOpts); const movementBeforeDate=async(toExclusive:string)=>{`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `journalLines` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-17: [Medium] Unbounded collect

- **الموقع:** `convex/generalLedger.ts:76` — `accountLedgerPaginated`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `dKeyOf(toExclusive); if(endPeriod===fromPeriod){ return sumLines(await ctx.db.query("journalLines").withIndex("by_account_branch_date_number_line",q=>q.eq("accountId",args.accountI`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `generalLedgerPeriodBalances` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-18: [Medium] Unbounded collect

- **الموقع:** `convex/generalLedger.ts:77` — `accountLedgerPaginated`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `lt("entryDate",toExclusive)).collect()); } const firstPartial=await ctx.db.query("journalLines").withIndex("by_account_branch_date_number_line",q=>q.eq("accountId",args.accountId).`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `journalLines` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-19: [Medium] Unbounded collect

- **الموقع:** `convex/generalLedger.ts:78` — `accountLedgerPaginated`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `tryDate",'${fromPeriod}-31')).collect(); const middlePeriods=await ctx.db.query("generalLedgerPeriodBalances").withIndex("by_account_branch_period",q=>q.eq("accountId",args.account`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `journalLines` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-20: [Medium] Unbounded collect

- **الموقع:** `convex/generalLedger.ts:84` — `accountLedgerPaginated`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `d",branchId).gte("entryDate",'${endPeriod}-01').lt("entryDate",toExclusive)).collect(); return sumLines(firstPartial)+sumPeriods(middlePeriods)+sumLines(lastPartial); }; let balanc`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `journalLines` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-21: [Medium] Unbounded collect

- **الموقع:** `convex/generalLedger.ts:85` — `accountLedgerPaginated`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `rSameDay=await ctx.db.query("journalLines").withIndex("by_account_branch_date_number_line",q=>q.eq("accountId",args.accountId).eq("branchId",branchId).eq("entryDate",first.entryDat`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `journalLines` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-22: [Medium] Unbounded collect

- **الموقع:** `convex/generalLedger.ts:92` — `accountLedgerPaginated`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ryNumber,date:line.entryDate,lineNumber:line.lineNumber,description:line.description??"",debit:line.debit,credit:line.credit,runningBalance,status:entry?.status??"posted",sourceTyp`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `generalLedgerPeriodBalances` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-23: [Medium] Potential N+1

- **الموقع:** `convex/lib/generalLedger.ts:57` — `postJournal`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for(const line of prepared) { await ctx.db.insert("journalLines",{entryId,entryNumber,lineNumber:line.lineNumber,branchId:input.branchId,entryDate:date,periodKey,accountId:line.account._id,accountCodeSnapshot:line.accoun`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### General Ledger-24: [Medium] Potential N+1

- **الموقع:** `convex/lib/generalLedgerOperations.ts:89` — `assetLines`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const [index, movement] of movements.entries()) { const account = await ctx.db.get(movement.accountId); if (!account) throw new ConvexError("الحساب المالي المرتبط بالحركة غير موجود"); const cents = signedCents(movem`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### General Ledger-25: [Medium] Unindexed first

- **الموقع:** `convex/lib/generalLedgerOperations.ts:235` — `financialPostingReadiness`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `"صافي التسوية"); await add("shipping_fees", fee, 0, "رسوم التسوية"); break; case "reversal": throw new ConvexError("يجب اشتقاق قيد العكس من المعاملة الأصلية"); } return lines; } ex`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `financeSettings` يطابق مفاتيح البحث والترتيب المستخدمة في `financialPostingReadiness`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### General Ledger-26: [Medium] Unindexed first

- **الموقع:** `convex/lib/generalLedgerOperations.ts:236` — `financialPostingReadiness`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `); break; case "reversal": throw new ConvexError("يجب اشتقاق قيد العكس من المعاملة الأصلية"); } return lines; } export async function financialPostingReadiness( ctx: ReadCtx, cutov`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `financeSettings` يطابق مفاتيح البحث والترتيب المستخدمة في `financialPostingReadiness`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### General Ledger-27: [Medium] Potential N+1

- **الموقع:** `convex/lib/generalLedgerOperations.ts:248` — `financialPostingReadiness`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const key of FINANCIAL_POSTING_SYSTEM_KEYS) { try { accounts.set(key, await systemAccount(ctx, key)); } catch { issues.push('حساب النظام غير جاهز: ${key}'); } } const branches = (await ctx.db.query("branches").colle`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### General Ledger-28: [Medium] Unbounded collect

- **الموقع:** `convex/lib/generalLedgerOperations.ts:256` — `financialPostingReadiness`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ds") .withIndex("by_key", (q) => q.eq("periodKey", periodKeyOf(cutoverDate))) .unique(); if (!period || period.status !== "open") issues.push("فترة تاريخ الربط ليست مفتوحة"); const`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `generalLedgerOpenings` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-29: [Medium] Unbounded collect

- **الموقع:** `convex/lib/generalLedgerOperations.ts:273` — `financialPostingReadiness`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `anches) { const opening = await ctx.db .query("generalLedgerOpenings") .withIndex("by_branch", (q) => q.eq("branchId", branch._id)) .unique(); if (!opening || opening.openingDate !`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `financialAccounts` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-30: [Medium] Unbounded collect

- **الموقع:** `convex/lib/generalLedgerOperations.ts:293` — `financialPostingReadiness`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `.query("generalLedgerAccountBalances") .withIndex("by_key", (q) => q.eq("key", '${branch._id}:${chart._id}')) .unique(); const actual = signedCents(balance?.netDebitBalance ?? 0); `
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `financialTransactions` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-31: [Medium] Unindexed first

- **الموقع:** `convex/lib/generalLedgerOperations.ts:314` — `activateFinancialPosting`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `فرع ${branch.name}', ); } return { ready: issues.length === 0, cutoverDate, issues, branchCount: branches.length, requiredSystemAccounts: FINANCIAL_POSTING_SYSTEM_KEYS.length, }; }`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `generalLedgerSettings` يطابق مفاتيح البحث والترتيب المستخدمة في `activateFinancialPosting`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### General Ledger-32: [Medium] Unindexed first

- **الموقع:** `convex/lib/generalLedgerOperations.ts:351` — `postFinancialTransactionJournal`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `At: Date.now(), financialPostingActivatedBy: user.userId, }); const activated = await ctx.db.get(settings._id); if (!activated) throw new ConvexError("تعذر حفظ تفعيل الربط المالي")`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `generalLedgerSettings` يطابق مفاتيح البحث والترتيب المستخدمة في `postFinancialTransactionJournal`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### General Ledger-33: [Medium] Unbounded collect

- **الموقع:** `convex/lib/generalLedgerOperations.ts:371` — `postFinancialTransactionJournal`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `| transaction.date < cutoverDate) throw new ConvexError( "تاريخ المعاملة يسبق تاريخ ربط الخزائن بالأستاذ العام", ); const existing = await ctx.db .query("journalEntries") .withInde`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `financialMovements` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-34: [Medium] Unbounded collect

- **الموقع:** `convex/lib/generalLedgerOperations.ts:388` — `postFinancialTransactionJournal`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ستقلة قبل تفعيل ترحيلها", ); } if (transaction.type === "reversal") { if (!transaction.originalTransactionId) throw new ConvexError("معاملة العكس غير مرتبطة بأصل"); const original `
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `journalEntries` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-35: [Medium] Unindexed first

- **الموقع:** `convex/lib/generalLedgerPurchases.ts:92` — `operationalSettings`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `ending: Promise<PostingLine | null>, ) { const resolved = await pending; if (resolved) lines.push(resolved); } function cents(value: number, label: string) { try { return toCents(v`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `generalLedgerSettings` يطابق مفاتيح البحث والترتيب المستخدمة في `operationalSettings`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### General Ledger-36: [Medium] Unbounded collect

- **الموقع:** `convex/lib/generalLedgerPurchases.ts:278` — `reversePurchaseReturnJournal`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ConvexError( "لا يمكن عكس مرتجع غير مرتبط بقيده التشغيلي الأصلي", ); } return null; } const original = await ctx.db.get(input.originalEntryId); if ( !original || original.reference`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `journalLines` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### General Ledger-37: [Medium] Client-side aggregation

- **الموقع:** `src/components/GeneralLedgerPage.tsx:183` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `eversal: "عكس تشغيلي مالي", }; function lineNumbers(lines: LineDraft[]) { return lines.map((line) => ({ ...line, debit: Number(line.debit || 0), credit: Number(line.credit || 0), }`
- **الأثر:** التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.
- **الإصلاح المقترح:** استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.
- **Index / Query design:** Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.

#### General Ledger-38: [Medium] Client-side aggregation

- **الموقع:** `src/components/GeneralLedgerPage.tsx:184` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `urn lines.map((line) => ({ ...line, debit: Number(line.debit || 0), credit: Number(line.credit || 0), })); } function lineValidation(lines: LineDraft[]) { const parsed = lineNumber`
- **الأثر:** التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.
- **الإصلاح المقترح:** استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.
- **Index / Query design:** Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.

#### General Ledger-39: [Medium] Client-side aggregation

- **الموقع:** `src/components/GeneralLedgerPage.tsx:532` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `const reopenPeriod = useMutation(api.generalLedger.reopenPeriod); const openingTotals = useMemo( () => lineValidation(openingLines), [openingLines], ); const journalTotals = useMem`
- **الأثر:** التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.
- **الإصلاح المقترح:** استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.
- **Index / Query design:** Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.

#### General Ledger-40: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/GeneralLedgerPage.tsx:559` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `openingCredit: 0, periodDebit: 0, periodCredit: 0, closingDebit: 0, closingCredit: 0, }, ), [trialRows], ); const chartChildren = useMemo(() => { const groups = new Map<string, Cha`
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

#### General Ledger-41: [Medium] Client-side aggregation

- **الموقع:** `src/components/GeneralLedgerPage.tsx:659` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `lance = async () => { if (busy || !canPrint || !effectiveBranch || !trialPeriod) return; setBusy(true); try { const rows = (await convex.query(api.generalLedger.trialBalanceForPrin`
- **الأثر:** التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.
- **الإصلاح المقترح:** استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.
- **Index / Query design:** Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.

### Reports

عدد البنود: **21**

#### Reports-1: [High] Unbounded collect

- **الموقع:** `convex/reporting.ts:68` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `&& error.message === "reporting range is too large") { throw new ConvexError("الفترة الواحدة للتقرير لا يمكن أن تتجاوز 366 يومًا"); } throw new ConvexError("أدخل فترة تقرير صحيحة ب`
- **الأثر:** الاستعلام غير محدود ويعتمد على حجم الجدول كاملًا؛ الخطر يتصاعد خطيًا مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `branches`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Reports-2: [High] Unbounded collect

- **الموقع:** `convex/reporting.ts:97` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `uthUser, requestedBranchId?: Id<"branches">, ) { const central = user.role === "admin" || user.role === "accountant"; if (requestedBranchId) { const branch = await ctx.db.get(reque`
- **الأثر:** الاستعلام غير محدود ويعتمد على حجم الجدول كاملًا؛ الخطر يتصاعد خطيًا مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `branches`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Reports-3: [Medium] Unbounded collect

- **الموقع:** `convex/reporting.ts:135` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `aseReturnsByReversal, supplierPaymentsByDate, supplierPaymentsByReversal, confirmationsByDate, confirmationsByReversal, codSettlementsByDate, codSettlementsByReversal, financialTra`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `salesReturns` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Reports-4: [Medium] Unbounded collect

- **الموقع:** `convex/reporting.ts:141` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ns, customerBalances, supplierBalances, financialAccounts, products, ] = await Promise.all([ ctx.db .query("invoices") .withIndex("by_branch_date", (q) => q.eq("branchId", branchId`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `expenses` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Reports-5: [Medium] Unbounded collect

- **الموقع:** `convex/reporting.ts:147` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `q.eq("branchId", branchId).gte("date", range.from).lte("date", range.to), ) .collect(), ctx.db .query("salesReturns") .withIndex("by_branch_reversal_date", (q) => q.eq("branchId", `
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `purchaseReceipts` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Reports-6: [Medium] Unbounded collect

- **الموقع:** `convex/reporting.ts:153` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `te", (q) => q.eq("branchId", branchId).gte("reversalDate", range.from).lte("reversalDate", range.to), ) .collect(), ctx.db .query("salesReturns") .withIndex("by_branch_date", (q) =`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `purchaseReceipts` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Reports-7: [Medium] Unbounded collect

- **الموقع:** `convex/reporting.ts:159` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `", (q) => q.eq("branchId", branchId).gte("date", range.from).lte("date", range.to), ) .collect(), ctx.db .query("expenses") .withIndex("by_branch_date", (q) => q.eq("branchId", bra`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `purchaseReturns` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Reports-8: [Medium] Unbounded collect

- **الموقع:** `convex/reporting.ts:165` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `=> q.eq("branchId", branchId).gte("date", range.from).lte("date", range.to), ) .collect(), ctx.db .query("purchaseReceipts") .withIndex("by_branch_date", (q) => q.eq("branchId", br`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `purchaseReturns` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Reports-9: [Medium] Unbounded collect

- **الموقع:** `convex/reporting.ts:171` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `d", branchId).gte("receiptDate", range.from).lte("receiptDate", range.to), ) .collect(), ctx.db .query("purchaseReturns") .withIndex("by_branch_date", (q) => q.eq("branchId", branc`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `supplierPayments` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Reports-10: [Medium] Unbounded collect

- **الموقع:** `convex/reporting.ts:177` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `q.eq("branchId", branchId).gte("date", range.from).lte("date", range.to), ) .collect(), ctx.db .query("purchaseReturns") .withIndex("by_branch_reversal_date", (q) => q.eq("branchId`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `supplierPayments` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Reports-11: [Medium] Unbounded collect

- **الموقع:** `convex/reporting.ts:183` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `branchId).gte("reversalDate", range.from).lte("reversalDate", range.to), ) .collect(), ctx.db .query("supplierPayments") .withIndex("by_branch_date", (q) => q.eq("branchId", branch`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `deliveryConfirmations` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Reports-12: [Medium] Unbounded collect

- **الموقع:** `convex/reporting.ts:189` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `branchId", branchId).gte("date", range.from).lte("date", range.to), ) .collect(), ctx.db .query("supplierPayments") .withIndex("by_branch_reversal_date", (q) => q.eq("branchId", br`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `deliveryConfirmations` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Reports-13: [Medium] Unbounded collect

- **الموقع:** `convex/reporting.ts:195` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `gte("reversalDate", range.from).lte("reversalDate", range.to), ) .collect(), ctx.db .query("deliveryConfirmations") .withIndex("by_branch_date", (q) => q.eq("branchId", branchId).g`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `codSettlements` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Reports-14: [Medium] Unbounded collect

- **الموقع:** `convex/reporting.ts:201` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `("branchId", branchId).gte("date", range.from).lte("date", range.to), ) .collect(), ctx.db .query("deliveryConfirmations") .withIndex("by_branch_reversal_date", (q) => q.eq("branch`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `codSettlements` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Reports-15: [Medium] Unbounded collect

- **الموقع:** `convex/reporting.ts:207` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `d", branchId).gte("reversalDate", range.from).lte("reversalDate", range.to), ) .collect(), ctx.db .query("codSettlements") .withIndex("by_branch_date", (q) => q.eq("branchId", bran`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `customerBalances` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Reports-16: [Medium] Unbounded collect

- **الموقع:** `convex/reporting.ts:213` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `("branchId", branchId).gte("date", range.from).lte("date", range.to), ) .collect(), ctx.db .query("codSettlements") .withIndex("by_branch_reversal_date", (q) => q.eq("branchId", br`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `supplierBalances` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Reports-17: [Medium] Unbounded collect

- **الموقع:** `convex/reporting.ts:217` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `tlements") .withIndex("by_branch_reversal_date", (q) => q.eq("branchId", branchId).gte("reversalDate", range.from).lte("reversalDate", range.to), ) .collect(), ctx.db .query("finan`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `financialAccounts` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Reports-18: [Medium] Unbounded collect

- **الموقع:** `convex/reporting.ts:221` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `).lte("reversalDate", range.to), ) .collect(), ctx.db .query("financialTransactions") .withIndex("by_branch_date", (q) => q.eq("branchId", branchId).gte("date", range.from).lte("da`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `products` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Reports-19: [Medium] Unbounded collect

- **الموقع:** `convex/reporting.ts:225` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `_branch_date", (q) => q.eq("branchId", branchId).gte("date", range.from).lte("date", range.to), ) .collect(), ctx.db .query("customerBalances") .withIndex("by_branch", (q) => q.eq(`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `products` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Reports-20: [Medium] Unbounded collect

- **الموقع:** `convex/reporting.ts:229` — `availableBranches`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `collect(), ctx.db .query("customerBalances") .withIndex("by_branch", (q) => q.eq("branchId", branchId)) .collect(), ctx.db .query("supplierBalances") .withIndex("by_branch", (q) =>`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `products` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Reports-21: [Medium] Potential N+1

- **الموقع:** `convex/reporting.ts:468` — `availableBranches`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const transaction of transactions) { if (COLLECTION_TYPES.has(transaction.type)) { collections += transaction.amount; continue; } if (REFUND_TYPES.has(transaction.type)) { refunds += transaction.amount; continue; } `
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

### Employees

عدد البنود: **7**

#### Employees-1: [High] Unbounded collect

- **الموقع:** `convex/employees.ts:153` — `list`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `role: existing.role, isActive: existing.isActive, name: existing.name, }; }, }); // ────────────────────────────────────────────── // Standard employee CRUD (protected) // ────────`
- **الأثر:** الاستعلام غير محدود ويعتمد على حجم الجدول كاملًا؛ الخطر يتصاعد خطيًا مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `userProfiles`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Employees-2: [Medium] Unbounded collect

- **الموقع:** `convex/employees.ts:188` — `stats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `t requireModulePermission(ctx, "view_employees", "employees"); const employee = await ctx.db.query("userProfiles") .withIndex("by_user", q => q.eq("userId", args.userId)) .first();`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `userProfiles` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Employees-3: [Medium] Unbounded collect

- **الموقع:** `convex/employees.ts:351` — `update`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `); if (duplicate && duplicate._id !== id) { throw new ConvexError("يوجد موظف مسجل بهذا البريد الإلكتروني"); } } // Last admin protection: prevent deactivating or demoting the last `
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `userProfiles` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Employees-4: [Medium] Unbounded collect

- **الموقع:** `convex/employees.ts:397` — `toggleActive`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `.get(args.id); if (!emp) throw new ConvexError("الموظف غير موجود"); assertBranchAccess(user, emp); if (user.role !== "admin" && emp.role === "admin") { throw new ConvexError("لا يم`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `userProfiles` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Employees-5: [Medium] Unbounded collect

- **الموقع:** `convex/employees.ts:434` — `remove`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `.get(args.id); if (!emp) throw new ConvexError("الموظف غير موجود"); assertBranchAccess(user, emp); if (user.role !== "admin" && emp.role === "admin") { throw new ConvexError("لا يم`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `userProfiles` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Employees-6: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/EmployeesPage.tsx:109` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `const employees = useQuery(api.employees.list, {}); const branches = useQuery(api.branches.list); const stats = useQuery(api.employees.stats); const createEmployee = useMutation(ap`
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

#### Employees-7: [Medium] Client-side aggregation

- **الموقع:** `src/components/EmployeesPage.tsx:237` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `}; const handleToggle = async (id: Id<"userProfiles">) => { try { await toggleActive({ id }); toast.success("تم تغيير حالة الموظف"); } catch (err) { toast.error(err instanceof Erro`
- **الأثر:** التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.
- **الإصلاح المقترح:** استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.
- **Index / Query design:** Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.

### Settings

عدد البنود: **4**

#### Settings-1: [Medium] Unindexed first

- **الموقع:** `convex/settings.ts:9` — `getPublic`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `import { query, mutation } from "./_generated/server"; import { v } from "convex/values"; import { requireAuth, requireAdmin, logAction } from "./lib/auth"; // Public query — no au`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `settings` يطابق مفاتيح البحث والترتيب المستخدمة في `getPublic`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### Settings-2: [Medium] Unindexed first

- **الموقع:** `convex/settings.ts:33` — `get`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `settings.phone, address: settings.address, currency: settings.currency, taxRate: settings.taxRate, whatsappNumber: settings.whatsappNumber, modules: settings.modules, }; }, }); // `
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `settings` يطابق مفاتيح البحث والترتيب المستخدمة في `get`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### Settings-3: [Medium] Unindexed first

- **الموقع:** `convex/settings.ts:53` — `upsert`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `, primaryColor: v.string(), secondaryColor: v.string(), phone: v.optional(v.string()), address: v.optional(v.string()), currency: v.string(), taxRate: v.number(), whatsappNumber: v`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `settings` يطابق مفاتيح البحث والترتيب المستخدمة في `upsert`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### Settings-4: [Medium] Unindexed first

- **الموقع:** `convex/settings.ts:92` — `updateModules`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `deliveries: v.boolean(), repairs: v.boolean(), expenses: v.boolean(), suppliers: v.boolean(), shipments: v.boolean(), crm: v.boolean(), branches: v.boolean(), employees: v.boolean(`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `settings` يطابق مفاتيح البحث والترتيب المستخدمة في `updateModules`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

### Shipments

عدد البنود: **10**

#### Shipments-1: [Critical] Unbounded collect

- **الموقع:** `convex/shipments.ts:47` — `stats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `get = query({ args: { id: v.id("shipments") }, handler: async (ctx, args) => { const user = await requireModulePermission(ctx, "view_shipments", "shipments"); const shipment = awai`
- **الأثر:** قراءة جدول كبير بالكامل في طلب واحد قد تتجاوز حدود Convex وتزيد زمن الاستجابة والتكلفة مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `shipments`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Shipments-2: [High] Unbounded collect

- **الموقع:** `convex/shipments.ts:65` — `creationOptions`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `tus !== "arrived" && x.status !== "cancelled") .reduce((sum, sh) => sum + sh.grandTotal, 0); return { ordered, inTransit, arrived, totalCost, pendingCost, total: s.length }; }, });`
- **الأثر:** الاستعلام غير محدود ويعتمد على حجم الجدول كاملًا؛ الخطر يتصاعد خطيًا مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `suppliers`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Shipments-3: [High] Unbounded collect

- **الموقع:** `convex/shipments.ts:66` — `creationOptions`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ordered, inTransit, arrived, totalCost, pendingCost, total: s.length }; }, }); /** Least-privilege selector data needed by the shipment creation form. */ export const creationOptio`
- **الأثر:** الاستعلام غير محدود ويعتمد على حجم الجدول كاملًا؛ الخطر يتصاعد خطيًا مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `suppliers`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Shipments-4: [Medium] Unbounded collect

- **الموقع:** `convex/shipments.ts:25` — `list`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `"../shared/businessRules.ts"; import { postPurchaseReceiptJournal } from "./lib/generalLedgerPurchases.ts"; export const list = query({ args: { status: v.optional(v.string()) }, ha`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `shipments` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Shipments-5: [Medium] Unbounded collect

- **الموقع:** `convex/shipments.ts:27` — `list`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `edgerPurchases.ts"; export const list = query({ args: { status: v.optional(v.string()) }, handler: async (ctx, args) => { const user = await requireModulePermission(ctx, "view_ship`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `shipments` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Shipments-6: [Medium] Potential N+1

- **الموقع:** `convex/shipments.ts:101` — `create`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const item of args.items) { if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new ConvexError("كمية الشحنة يجب أن تكون عدداً صحيحاً أكبر من صفر"); if (!Number.isFinite(item.unitCost) || item.unitCost`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Shipments-7: [Medium] Potential N+1

- **الموقع:** `convex/shipments.ts:210` — `receive`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const [index, item] of shipment.items.entries()) { if (!item.productId) throw new ConvexError("كل أصناف الشحنة يجب أن ترتبط بمنتج موجود"); if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Convex`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Shipments-8: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/ShipmentsPage.tsx:49` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `Status, setFilterStatus] = useState<string>("all"); const [search, setSearch] = useState(""); const [showForm, setShowForm] = useState(false); const shipments = useQuery(api.shipme`
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

#### Shipments-9: [Medium] Client-side aggregation

- **الموقع:** `src/components/ShipmentsPage.tsx:288` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `ons); const suppliers = options?.suppliers; const products = options?.products; const [form, setForm] = useState({ supplierName: "", supplierId: "", shippingCost: "", expectedDate:`
- **الأثر:** التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.
- **الإصلاح المقترح:** استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.
- **Index / Query design:** Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.

#### Shipments-10: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/ShipmentsPage.tsx:293` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `nst [form, setForm] = useState({ supplierName: "", supplierId: "", shippingCost: "", expectedDate: "", notes: "", }); const [items, setItems] = useState<ShipItem[]>([emptyItem()]);`
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

### Expenses

عدد البنود: **7**

#### Expenses-1: [Critical] Unbounded collect

- **الموقع:** `convex/expenses.ts:12` — `list`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `{ requireActiveBranch } from "./lib/references"; import { assertBranchAccess, requireModulePermission, filterByBranch, resolveWriteBranch, logAction } from "./lib/auth"; import { p`
- **الأثر:** قراءة جدول كبير بالكامل في طلب واحد قد تتجاوز حدود Convex وتزيد زمن الاستجابة والتكلفة مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `expenses`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Expenses-2: [Critical] Unbounded collect

- **الموقع:** `convex/expenses.ts:88` — `getStats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `بطال المصروف ${expense.title}: ${reason}' }); return expense.financialTransactionId ?? null; }, }); export { voidExpense as void }; export const remove = mutation({ args: { id: v.i`
- **الأثر:** قراءة جدول كبير بالكامل في طلب واحد قد تتجاوز حدود Convex وتزيد زمن الاستجابة والتكلفة مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `expenses`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Expenses-3: [Medium] Unbounded collect

- **الموقع:** `convex/expenses.ts:68` — `voidExpense`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `بطال مطلوب"); if (expense.status === "voided") throw new ConvexError("المصروف مبطل بالفعل"); if (!isValidIsoDate(args.date)) throw new ConvexError("تاريخ الإبطال غير صالح"); if (ex`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `financialMovements` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Expenses-4: [Medium] Unindexed first

- **الموقع:** `convex/expenses.ts:73` — `voidExpense`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `riginal._id, movements: movements.map(m => ({ accountId: m.accountId, signedAmount: -m.signedAmount })) }); if (posted.duplicate) return posted.transactionId; await ctx.db.patch(or`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `financeSettings` يطابق مفاتيح البحث والترتيب المستخدمة في `voidExpense`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### Expenses-5: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/ExpensesPage.tsx:38` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `ate(""); const [filterCategory, setFilterCategory] = useState(""); const [showForm, setShowForm] = useState(false); const [voidTarget, setVoidTarget] = useState<Doc<"expenses"> | n`
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

#### Expenses-6: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/ExpensesPage.tsx:40` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `nst [showForm, setShowForm] = useState(false); const [voidTarget, setVoidTarget] = useState<Doc<"expenses"> | null>(null); const [voidReason, setVoidReason] = useState(""); const [`
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

#### Expenses-7: [Medium] Client-side aggregation

- **الموقع:** `src/components/ExpensesPage.tsx:82` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `eason(""); } catch (error) { toast.error(getErrorMessage(error, "تعذر إبطال المصروف")); } finally { setIsVoiding(false); } }; // Group by category const byCategory = expenseCategor`
- **الأثر:** التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.
- **الإصلاح المقترح:** استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.
- **Index / Query design:** Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.

### Sales Returns

عدد البنود: **9**

#### Sales Returns-1: [Critical] Unbounded collect

- **الموقع:** `convex/salesReturns.ts:32` — `eligibleInvoices`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `("salesReturns") }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "print_credit_notes"); const note = await ctx.db.get(args.id); if (!note) return null;`
- **الأثر:** قراءة جدول كبير بالكامل في طلب واحد قد تتجاوز حدود Convex وتزيد زمن الاستجابة والتكلفة مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `invoices`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Sales Returns-2: [High] Potential N+1

- **الموقع:** `convex/salesReturns.ts:34` — `eligibleInvoices`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const invoice of invoices) { if (invoice.status === "cancelled" || invoice.status === "returned" || !invoice.costingVersion || invoice.items.some(item => item.lineNetTotal === undefined)) continue; const notes = awa`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Sales Returns-3: [High] Potential N+1

- **الموقع:** `convex/salesReturns.ts:38` — `eligibleInvoices`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const note of notes) if (note.status === "posted") for (const item of note.items) returned.set(String(item.productId), (returned.get(String(item.productId)) ?? 0) + item.quantityReturned); const items = invoice.item`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Sales Returns-4: [High] Potential N+1

- **الموقع:** `convex/salesReturns.ts:76` — `create`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const item of normalized) await changeProductStock(ctx, user, { productId: item.productId, quantityDelta: item.quantityReturned, unitCost: item.historicalUnitCost, type: INVENTORY_MOVEMENT_TYPES.salesReturn, reason:`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Sales Returns-5: [Medium] Unbounded collect

- **الموقع:** `convex/salesReturns.ts:20` — `list`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `return note; const { totalCogsReversed: _total, ...rest } = note; return { ...rest, items: note.items.map(({ historicalUnitCost: _unit, returnedCostTotal: _cost, ...item }) => item`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `salesReturns` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Sales Returns-6: [Medium] Unbounded collect

- **الموقع:** `convex/salesReturns.ts:36` — `eligibleInvoices`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `=> { const user = await requirePermission(ctx, "create_sales_returns"); const invoices = filterByBranch(await ctx.db.query("invoices").collect(), user); const result = []; for (con`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `salesReturns` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Sales Returns-7: [Medium] Unbounded collect

- **الموقع:** `convex/salesReturns.ts:60` — `create`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `نشاء مرتجع لفاتورة ملغاة"); if (!args.reason.trim()) throw new ConvexError("سبب المرتجع مطلوب"); await requireFinanceInitialized(ctx, args.date); if (!invoice.costingVersion || inv`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `salesReturns` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Sales Returns-8: [Medium] Client-side aggregation

- **الموقع:** `src/components/SalesReturnsPanel.tsx:22` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `e] = useState(new Date().toISOString().slice(0, 10)); const requestId = useRef(crypto.randomUUID()), reversalRequestId = useRef(crypto.randomUUID()); const printable = useQuery(api`
- **الأثر:** التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.
- **الإصلاح المقترح:** استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.
- **Index / Query design:** Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.

#### Sales Returns-9: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/SalesReturnsPanel.tsx:25` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `und = Math.max(0, preview - debtReduction); const start = (value: EligibleInvoice) => { setInvoice(value); setQuantities({}); setReason(""); setAccountId(""); requestId.current = c`
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

### Purchase Returns

عدد البنود: **9**

#### Purchase Returns-1: [High] Potential N+1

- **الموقع:** `convex/purchaseReturns.ts:33` — `create`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for(const requested of items){const historical=receipt.items[requested.receiptItemIndex];if(!historical) throw new ConvexError("رقم بند مستند الشراء غير موجود");const before=posted.flatMap(row=>row.items).filter(row=>row`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Purchase Returns-2: [High] Potential N+1

- **الموقع:** `convex/purchaseReturns.ts:37` — `create`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `const stored=[];let inventoryValueRemoved=0;for(const row of prepared){const valuation=await changeProductStock(ctx,user,{productId:row.historical.productId,quantityDelta:-row.requested.quantity,type:INVENTORY_MOVEMENT_T`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Purchase Returns-3: [High] Potential N+1

- **الموقع:** `convex/purchaseReturns.ts:44` — `create`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `export const reverse=mutation({args:{purchaseReturnId:v.id("purchaseReturns"),date:v.string(),reason:v.string(),requestId:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"reverse_purchase_ret`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Purchase Returns-4: [High] Unbounded collect

- **الموقع:** `convex/purchaseReturns.ts:46` — `supplierOptions`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `rEntryId,reversalJournalEntryId:reversalJournal?._id});await logAction(ctx,user,{action:"reverse",module:"purchase_returns",recordId:row._id,recordLabel:row.returnNumber,details:JS`
- **الأثر:** الاستعلام غير محدود ويعتمد على حجم الجدول كاملًا؛ الخطر يتصاعد خطيًا مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `suppliers`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Purchase Returns-5: [Medium] Unbounded collect

- **الموقع:** `convex/purchaseReturns.ts:31` — `create`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `rnalCreditNote(args.externalCreditNoteNumber);}catch(error){throw errorOf(error);}const key=external.comparisonKey;if(key&&await ctx.db.query("purchaseReturns").withIndex("by_suppl`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `purchaseReturns` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Purchase Returns-6: [Medium] Unbounded collect

- **الموقع:** `convex/purchaseReturns.ts:47` — `eligibleReceipts`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ive!==false).map(x=>({_id:x._id,name:x.name}));}}); export const eligibleReceipts=query({args:{supplierId:v.id("suppliers"),branchId:v.optional(v.id("branches"))},handler:async(ctx`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `purchaseReturns` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Purchase Returns-7: [Medium] Unbounded collect

- **الموقع:** `convex/purchaseReturns.ts:51` — `supplierRefundAccountPicker`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ير معروف",refundAccountName:row.refundAccountName,reversalReason:row.reversalReason,reversalDate:row.reversalDate};}}); export const supplierRefundAccountPicker=query({args:{branch`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `financialAccounts` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Purchase Returns-8: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/PurchaseReturnsPage.tsx:19` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `ounts">|"">(""),[busy,setBusy]=useState(false),[error,setError]=useState(""); const createRequestId=useRef(newRequestId()),reversalRequestId=useRef(newRequestId()); const receipts=`
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

#### Purchase Returns-9: [Medium] Client-side aggregation

- **الموقع:** `src/components/PurchaseReturnsPage.tsx:20` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `[],receipt=receipts.find(row=>row._id===receiptId); const rawItems=receipt?.items.map(item=>({receiptItemIndex:item.receiptItemIndex,quantity:quantities[item.receiptItemIndex]??0})`
- **الأثر:** التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.
- **الإصلاح المقترح:** استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.
- **Index / Query design:** Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.

### CRM/Leads

عدد البنود: **7**

#### CRM/Leads-1: [Medium] Unbounded collect

- **الموقع:** `convex/leads.ts:18` — `list`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `reModulePermission, filterByBranch, resolveWriteBranch, logAction } from "./lib/auth"; export const list = query({ args: { status: v.optional(v.string()), source: v.optional(v.stri`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `leads` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### CRM/Leads-2: [Medium] Unbounded collect

- **الموقع:** `convex/leads.ts:20` — `list`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `auth"; export const list = query({ args: { status: v.optional(v.string()), source: v.optional(v.string()), }, handler: async (ctx, args) => { const user = await requireModulePermis`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `leads` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### CRM/Leads-3: [Medium] Unbounded collect

- **الموقع:** `convex/leads.ts:50` — `getWithActivities`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ssertBranchAccess(user, lead); return lead; }, }); export const getWithActivities = query({ args: { id: v.id("leads") }, handler: async (ctx, args) => { const user = await requireM`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `leads` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### CRM/Leads-4: [Medium] Unbounded collect

- **الموقع:** `convex/leads.ts:59` — `stats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `nst lead = await ctx.db.get(args.id); if (!lead) return null; assertBranchAccess(user, lead); const activities = await ctx.db .query("leadActivities") .withIndex("by_lead", (q) => `
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `leads` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### CRM/Leads-5: [Medium] Unbounded collect

- **الموقع:** `convex/leads.ts:225` — `remove`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `علي', }); return customerId; }, }); export const remove = mutation({ args: { id: v.id("leads") }, handler: async (ctx, args) => { const user = await requireModulePermission(ctx, "d`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `leadActivities` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### CRM/Leads-6: [Medium] Potential N+1

- **الموقع:** `convex/leads.ts:226` — `remove`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const a of activities) await ctx.db.delete(a._id); await ctx.db.delete(args.id); await logAction(ctx, user, { action: "delete", module: "leads", recordId: args.id, recordLabel: lead.name, details: 'حذف العميل المحتم`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### CRM/Leads-7: [Medium] Unbounded collect

- **الموقع:** `convex/leads.ts:249` — `listActivities`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `e}', }); }, }); export const listActivities = query({ args: { leadId: v.id("leads") }, handler: async (ctx, args) => { const user = await requireModulePermission(ctx, "view_leads",`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `leadActivities` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

### Branches

عدد البنود: **38**

#### Branches-1: [High] Unbounded collect

- **الموقع:** `convex/branches.ts:10` — `list`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `import { query, mutation } from "./_generated/server"; import { v, ConvexError } from "convex/values"; import { hasPermission, requireModulePermission, logAction } from "./lib/auth`
- **الأثر:** الاستعلام غير محدود ويعتمد على حجم الجدول كاملًا؛ الخطر يتصاعد خطيًا مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `branches`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Branches-2: [High] Raw document DTO

- **الموقع:** `convex/branches.ts:10` — `list`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `handler: async (ctx) => { await requireModulePermission(ctx, "view_branches", "branches"); return await ctx.db.query("branches").collect(); }, }); export const get = query({ args: `
- **الأثر:** إرجاع مستندات الجدول كاملة يرفع حجم payload وقد يكشف حقولًا داخلية أو مالية لا تحتاجها الواجهة.
- **الإصلاح المقترح:** حوّل النتائج إلى DTO allowlist داخل الـBackend، وأعد فقط الحقول اللازمة للعرض والإجراءات المصرح بها.
- **Index / Query design:** لا يعتمد على Index مباشرة؛ طبّق DTO بعد الاستعلام المحدود للجدول `branches`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، بشرط حصر جميع الحقول التي تستخدمها الواجهة والاختبارات قبل إزالة الباقي.

#### Branches-3: [High] Unbounded collect

- **الموقع:** `convex/branches.ts:88` — `setActive`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `e, isActive: data.isActive }, }); }, }); export const setActive = mutation({ args: { id: v.id("branches"), isActive: v.boolean() }, handler: async (ctx, args) => { const user = awa`
- **الأثر:** الاستعلام غير محدود ويعتمد على حجم الجدول كاملًا؛ الخطر يتصاعد خطيًا مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `userProfiles`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Branches-4: [High] Unbounded collect

- **الموقع:** `convex/branches.ts:112` — `stats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ranch.name}', branchId: args.id, before: { isActive: branch.isActive }, after: { isActive: args.isActive }, }); }, }); export const remove = mutation({ args: { id: v.id("branches")`
- **الأثر:** الاستعلام غير محدود ويعتمد على حجم الجدول كاملًا؛ الخطر يتصاعد خطيًا مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `userProfiles`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Branches-5: [High] Unbounded collect

- **الموقع:** `convex/branches.ts:114` — `stats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ve }, }); }, }); export const remove = mutation({ args: { id: v.id("branches") }, handler: async () => { throw new ConvexError("استخدم تعطيل الفرع بدلاً من الحذف"); } }); export co`
- **الأثر:** الاستعلام غير محدود ويعتمد على حجم الجدول كاملًا؛ الخطر يتصاعد خطيًا مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `userProfiles`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Branches-6: [High] Potential N+1

- **الموقع:** `convex/branches.ts:165` — `assignLegacyData`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const item of await ctx.db.query("products").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; } for (const item of await ctx.db.query("customers").collect()) if`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Branches-7: [High] Potential N+1

- **الموقع:** `convex/branches.ts:166` — `assignLegacyData`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const item of await ctx.db.query("customers").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; } for (const item of await ctx.db.query("invoices").collect()) if`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Branches-8: [High] Potential N+1

- **الموقع:** `convex/branches.ts:167` — `assignLegacyData`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const item of await ctx.db.query("invoices").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; } for (const item of await ctx.db.query("orders").collect()) if (!`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Branches-9: [High] Potential N+1

- **الموقع:** `convex/branches.ts:168` — `assignLegacyData`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const item of await ctx.db.query("orders").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); await applyOrderStatsChange(ctx, item, { ...item, branchId: args.branchId }); as`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Branches-10: [High] Potential N+1

- **الموقع:** `convex/branches.ts:169` — `assignLegacyData`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const item of await ctx.db.query("repairs").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; } for (const item of await ctx.db.query("shipments").collect()) if `
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Branches-11: [High] Potential N+1

- **الموقع:** `convex/branches.ts:170` — `assignLegacyData`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const item of await ctx.db.query("shipments").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; } for (const item of await ctx.db.query("expenses").collect()) if`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Branches-12: [High] Potential N+1

- **الموقع:** `convex/branches.ts:171` — `assignLegacyData`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const item of await ctx.db.query("expenses").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; } for (const item of await ctx.db.query("payments").collect()) if `
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Branches-13: [High] Potential N+1

- **الموقع:** `convex/branches.ts:172` — `assignLegacyData`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const item of await ctx.db.query("payments").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; } for (const item of await ctx.db.query("leads").collect()) if (!i`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Branches-14: [High] Potential N+1

- **الموقع:** `convex/branches.ts:173` — `assignLegacyData`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const item of await ctx.db.query("leads").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; } for (const item of await ctx.db.query("deliveries").collect()) if (`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Branches-15: [Medium] Filter without index

- **الموقع:** `convex/branches.ts:32` — `create`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `quireModulePermission(ctx, "view_branches", "branches"); return await ctx.db.get(args.id); }, }); export const create = mutation({ args: { name: v.string(), address: v.string(), ph`
- **الأثر:** Convex يقرأ مساحة أوسع ثم يطبق الفلتر، وقد يتحول الاستعلام إلى مسح كبير أو يفشل عند نمو البيانات.
- **الإصلاح المقترح:** أضف/استخدم `withIndex` بدل `.filter` للمفاتيح الانتقائية، واترك `.filter` فقط للشروط الثانوية على مجموعة محدودة.
- **Index / Query design:** Index مقترح على `branches` يبدأ بـ`name`؛ أضف `branchId` أولًا عندما تكون الملكية حسب الفرع، ثم status/date حسب نمط الاستعلام.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، إذا طابق ترتيب حقول الـIndex شروط المساواة والنطاق الحالية وتمت مقارنة النتائج قبل/بعد.

#### Branches-16: [Medium] Unindexed first

- **الموقع:** `convex/branches.ts:32` — `create`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `x.db.get(args.id); }, }); export const create = mutation({ args: { name: v.string(), address: v.string(), phone: v.optional(v.string()), isActive: v.optional(v.boolean()), }, handl`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `branches` يطابق مفاتيح البحث والترتيب المستخدمة في `create`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### Branches-17: [Medium] Unbounded collect

- **الموقع:** `convex/branches.ts:130` — `legacyDataStats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `turn { total: branches.length, active: branches.filter(b => b.isActive).length, inactive: branches.filter(b => !b.isActive).length, totalEmployees, }; }, }); export const legacyDat`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `expenses`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Branches-18: [Medium] Unbounded collect

- **الموقع:** `convex/branches.ts:131` — `legacyDataStats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `active: branches.filter(b => b.isActive).length, inactive: branches.filter(b => !b.isActive).length, totalEmployees, }; }, }); export const legacyDataStats = query({ args: {}, hand`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `payments`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Branches-19: [Medium] Unbounded collect

- **الموقع:** `convex/branches.ts:132` — `legacyDataStats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ength, inactive: branches.filter(b => !b.isActive).length, totalEmployees, }; }, }); export const legacyDataStats = query({ args: {}, handler: async (ctx) => { await requireModuleP`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `leads`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Branches-20: [Medium] Unbounded collect

- **الموقع:** `convex/branches.ts:133` — `legacyDataStats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `=> !b.isActive).length, totalEmployees, }; }, }); export const legacyDataStats = query({ args: {}, handler: async (ctx) => { await requireModulePermission(ctx, "manage_branches", "`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `deliveries`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Branches-21: [Medium] Unbounded collect

- **الموقع:** `convex/branches.ts:134` — `legacyDataStats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `yees, }; }, }); export const legacyDataStats = query({ args: {}, handler: async (ctx) => { await requireModulePermission(ctx, "manage_branches", "branches"); const [products, custo`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `deliveries`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Branches-22: [Medium] Unbounded collect

- **الموقع:** `convex/branches.ts:135` — `legacyDataStats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ataStats = query({ args: {}, handler: async (ctx) => { await requireModulePermission(ctx, "manage_branches", "branches"); const [products, customers, invoices, orders, repairs, shi`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `deliveries`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Branches-23: [Medium] Unbounded collect

- **الموقع:** `convex/branches.ts:136` — `legacyDataStats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `async (ctx) => { await requireModulePermission(ctx, "manage_branches", "branches"); const [products, customers, invoices, orders, repairs, shipments, expenses, payments, leads, del`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `deliveries`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Branches-24: [Medium] Unbounded collect

- **الموقع:** `convex/branches.ts:137` — `legacyDataStats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `rmission(ctx, "manage_branches", "branches"); const [products, customers, invoices, orders, repairs, shipments, expenses, payments, leads, deliveries] = await Promise.all([ ctx.db.`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `deliveries`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Branches-25: [Medium] Unbounded collect

- **الموقع:** `convex/branches.ts:138` — `legacyDataStats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `hes"); const [products, customers, invoices, orders, repairs, shipments, expenses, payments, leads, deliveries] = await Promise.all([ ctx.db.query("products").collect(), ctx.db.que`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `deliveries`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Branches-26: [Medium] Unbounded collect

- **الموقع:** `convex/branches.ts:139` — `legacyDataStats`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ces, orders, repairs, shipments, expenses, payments, leads, deliveries] = await Promise.all([ ctx.db.query("products").collect(), ctx.db.query("customers").collect(), ctx.db.query(`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `deliveries`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Branches-27: [Medium] Unbounded collect

- **الموقع:** `convex/branches.ts:165` — `assignLegacyData`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `h, }; return { counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0) }; }, }); export const assignLegacyData = mutation({ args: { branchId: v.id("branches") }`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `customers`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Branches-28: [Medium] Unbounded collect

- **الموقع:** `convex/branches.ts:166` — `assignLegacyData`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `: { branchId: v.id("branches") }, handler: async (ctx, args) => { const user = await requireModulePermission(ctx, "manage_branches", "branches"); const branch = await ctx.db.get(ar`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `invoices`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Branches-29: [Medium] Unbounded collect

- **الموقع:** `convex/branches.ts:167` — `assignLegacyData`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `t branch = await ctx.db.get(args.branchId); if (!branch) throw new ConvexError("الفرع غير موجود"); let assigned = 0; for (const item of await ctx.db.query("products").collect()) if`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `orders`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Branches-30: [Medium] Unbounded collect

- **الموقع:** `convex/branches.ts:168` — `assignLegacyData`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `.db.query("products").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; } for (const item of await ctx.db.query("customers").c`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `repairs`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Branches-31: [Medium] Unbounded collect

- **الموقع:** `convex/branches.ts:169` — `assignLegacyData`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `em._id, { branchId: args.branchId }); assigned++; } for (const item of await ctx.db.query("invoices").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `shipments`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Branches-32: [Medium] Unbounded collect

- **الموقع:** `convex/branches.ts:170` — `assignLegacyData`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `m._id, { branchId: args.branchId }); assigned++; } for (const item of await ctx.db.query("orders").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.br`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `expenses`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Branches-33: [Medium] Unbounded collect

- **الموقع:** `convex/branches.ts:171` — `assignLegacyData`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `_id, { branchId: args.branchId }); await applyOrderStatsChange(ctx, item, { ...item, branchId: args.branchId }); assigned++; } for (const item of await ctx.db.query("repairs").coll`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `payments`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Branches-34: [Medium] Unbounded collect

- **الموقع:** `convex/branches.ts:172` — `assignLegacyData`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `db.query("repairs").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; } for (const item of await ctx.db.query("shipments").col`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `leads`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Branches-35: [Medium] Unbounded collect

- **الموقع:** `convex/branches.ts:173` — `assignLegacyData`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `x.db.query("shipments").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; } for (const item of await ctx.db.query("expenses").`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `deliveries`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Branches-36: [Medium] Unbounded collect

- **الموقع:** `convex/branches.ts:174` — `assignLegacyData`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `.db.query("expenses").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; } for (const item of await ctx.db.query("payments").co`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `deliveries`.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Branches-37: [Medium] Potential N+1

- **الموقع:** `convex/branches.ts:174` — `assignLegacyData`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const item of await ctx.db.query("deliveries").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; } await logAction(ctx, user, { action: "migrate", module: "branc`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Branches-38: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/BranchesPage.tsx:39` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `st); const employees = useQuery(api.employees.list, canViewEmployees ? {} : "skip"); const stats = useQuery(api.branches.stats); const legacyData = useQuery(api.branches.legacyData`
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

### Shared/Infrastructure

عدد البنود: **17**

#### Shared/Infrastructure-1: [Medium] Unbounded collect

- **الموقع:** `convex/lib/auth.ts:42` — `getAuthProfile`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `const authUserId = await getAuthUserId(ctx); if (!authUserId) return null; const stableUserId = String(authUserId); let profile = await ctx.db .query("userProfiles") .withIndex("by`
- **الأثر:** استخدام Index يقلل مساحة البحث، لكن `collect()` ما زال بلا حد وقد يعيد فرعًا أو حالة كبيرة بالكامل.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `userProfiles` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Shared/Infrastructure-2: [Medium] Unindexed first

- **الموقع:** `convex/lib/auth.ts:265` — `requireModuleEnabled`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `n: beforeSnapshot || afterSnapshot ? 1 : undefined, timestamp: Date.now(), }); } // ────────────────────────────────────────────── // requireModuleEnabled — checks if a module is e`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `settings` يطابق مفاتيح البحث والترتيب المستخدمة في `requireModuleEnabled`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### Shared/Infrastructure-3: [Medium] Unbounded collect

- **الموقع:** `convex/lib/auth.ts:288` — `hasAdmin`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `( ctx: QueryCtx | MutationCtx, permission: Permission, moduleName: string, ): Promise<AuthUser> { const user = await requirePermission(ctx, permission); await requireModuleEnabled(`
- **الأثر:** الاستعلام غير محدود ويعتمد على حجم الجدول كاملًا؛ الخطر يتصاعد خطيًا مع نمو البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** استخدم Index يبدأ بمفاتيح المساواة المستخدمة فعليًا ثم حقل التاريخ/الترتيب، وبعده `paginate()`؛ الجدول المرصود: `userProfiles`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، غالبًا عبر endpoint paginated ودمج الصفحات في الواجهة مع الحفاظ على نفس ترتيب وفرع النتائج.

#### Shared/Infrastructure-4: [Medium] Unbounded collect

- **الموقع:** `convex/lib/documentNumbers.ts:38` — `legacyNumbersForYear`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `nst match = expression.exec(number); return match ? Math.max(maximum, Number(match[1])) : maximum; }, 0) + 1; } async function legacyNumbersForYear(ctx: MutationCtx, type: Document`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `orders` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Shared/Infrastructure-5: [Medium] Unbounded collect

- **الموقع:** `convex/lib/documentNumbers.ts:39` — `legacyNumbersForYear`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `cumentType, year: number): Promise<string[]> { const lower = '${config[type].prefix}-${year}-'; const upper = '${config[type].prefix}-${year}.'; switch (type) { case "invoice": ret`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `shipments` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Shared/Infrastructure-6: [Medium] Unbounded collect

- **الموقع:** `convex/lib/documentNumbers.ts:40` — `legacyNumbersForYear`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `(await ctx.db.query("invoices").withIndex("by_invoice_number", q => q.gte("invoiceNumber", lower).lt("invoiceNumber", upper)).collect()).map(x => x.invoiceNumber); case "order": re`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `repairs` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Shared/Infrastructure-7: [Medium] Unbounded collect

- **الموقع:** `convex/lib/documentNumbers.ts:41` — `legacyNumbersForYear`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `n (await ctx.db.query("orders").withIndex("by_order_number", q => q.gte("orderNumber", lower).lt("orderNumber", upper)).collect()).map(x => x.orderNumber); case "shipment": return `
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `deliveries` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Shared/Infrastructure-8: [Medium] Unbounded collect

- **الموقع:** `convex/lib/documentNumbers.ts:42` — `legacyNumbersForYear`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `b.query("shipments").withIndex("by_shipment_number", q => q.gte("shipmentNumber", lower).lt("shipmentNumber", upper)).collect()).map(x => x.shipmentNumber); case "repair": return (`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `codSettlements` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Shared/Infrastructure-9: [Medium] Unbounded collect

- **الموقع:** `convex/lib/documentNumbers.ts:43` — `legacyNumbersForYear`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `("repairs").withIndex("by_repair_number", q => q.gte("repairNumber", lower).lt("repairNumber", upper)).collect()).map(x => x.repairNumber); case "delivery": return (await ctx.db.qu`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `financialTransactions` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Shared/Infrastructure-10: [Medium] Unbounded collect

- **الموقع:** `convex/lib/documentNumbers.ts:44` — `legacyNumbersForYear`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `ivery_number", q => q.gte("deliveryNumber", lower).lt("deliveryNumber", upper)).collect()).map(x => x.deliveryNumber); case "codSettlement": return (await ctx.db.query("codSettleme`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `salesReturns` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Shared/Infrastructure-11: [Medium] Unbounded collect

- **الموقع:** `convex/lib/documentNumbers.ts:45` — `legacyNumbersForYear`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `q => q.gte("settlementNumber", lower).lt("settlementNumber", upper)).collect()).map(x => x.settlementNumber); case "finance": return (await ctx.db.query("financialTransactions").wi`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `purchaseReceipts` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Shared/Infrastructure-12: [Medium] Unbounded collect

- **الموقع:** `convex/lib/documentNumbers.ts:46` — `legacyNumbersForYear`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `umber", q => q.gte("transactionNumber", lower).lt("transactionNumber", upper)).collect()).map(x => x.transactionNumber); case "creditNote": return (await ctx.db.query("salesReturns`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `purchaseReturns` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Shared/Infrastructure-13: [Medium] Unbounded collect

- **الموقع:** `convex/lib/documentNumbers.ts:47` — `legacyNumbersForYear`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `redit_note_number", q => q.gte("creditNoteNumber", lower).lt("creditNoteNumber", upper)).collect()).map(x => x.creditNoteNumber); case "purchaseReceipt": return (await ctx.db.query`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `supplierLedgerEntries` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Shared/Infrastructure-14: [Medium] Unbounded collect

- **الموقع:** `convex/lib/documentNumbers.ts:48` — `legacyNumbersForYear`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `.withIndex("by_receipt_number", q => q.gte("receiptNumber", lower).lt("receiptNumber", upper)).collect()).map(x => x.receiptNumber); case "purchaseReturn": return (await ctx.db.que`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `supplierPayments` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Shared/Infrastructure-15: [Medium] Unbounded collect

- **الموقع:** `convex/lib/documentNumbers.ts:49` — `legacyNumbersForYear`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `.withIndex("by_return_number", q => q.gte("returnNumber", lower).lt("returnNumber", upper)).collect()).map(x => x.returnNumber); case "supplierLedger": return (await ctx.db.query("`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `customerLedgerEntries` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Shared/Infrastructure-16: [Medium] Unbounded collect

- **الموقع:** `convex/lib/documentNumbers.ts:50` — `legacyNumbersForYear`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `").withIndex("by_entry_number", q => q.gte("entryNumber", lower).lt("entryNumber", upper)).collect()).map(x => x.entryNumber); case "supplierPayment": return (await ctx.db.query("s`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `journalEntries` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

#### Shared/Infrastructure-17: [Medium] Unbounded collect

- **الموقع:** `convex/lib/documentNumbers.ts:51` — `legacyNumbersForYear`
- **الثقة:** مؤكد من المصدر
- **الدليل:** `supplierPayments").withIndex("by_payment_number", q => q.gte("paymentNumber", lower).lt("paymentNumber", upper)).collect()).map(x => x.paymentNumber); case "customerLedger": return`
- **الأثر:** المسار تشغيلي/ترحيلي، لكنه قد يتجاوز حدود القراءة أو زمن التنفيذ عندما تكبر البيانات.
- **الإصلاح المقترح:** استبدل القراءة الكاملة بـCursor Pagination أو batch bounded، وانقل الفلترة/الفرز إلى الـIndex قبل القراءة.
- **Index / Query design:** حافظ على الـIndex الحالي للجدول `invoices` واستبدل `collect()` بـ`paginate()` أو `take()` بحد موثق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يلزم تحويل العملية إلى batch/cursor مع checkpoint بدل طلب واحد.

### Other

عدد البنود: **9**

#### Other-1: [Medium] Potential N+1

- **الموقع:** `convex/orderPagination.ts:70` — `list`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `result.page.map(async (order) => { if (!order.linkedInvoiceId) return order; const invoice = await ctx.db.get(order.linkedInvoiceId); return { ...order, linkedInvoiceId: invoice?._id, linkedInvoiceNumber: invoice?.invoic`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Other-2: [Medium] Unindexed first

- **الموقع:** `convex/seed.ts:11` — `seedDemo`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `import { mutation } from "./_generated/server"; import { requireAdmin } from "./lib/auth"; import { changeProductStock } from "./lib/inventory"; import { INVENTORY_MOVEMENT_TYPES }`
- **الأثر:** `first()` يحد النتيجة لكنه قد يفحص جدولًا كبيرًا للوصول لأول تطابق عندما لا يوجد Index.
- **الإصلاح المقترح:** استخدم Index يطابق شرط البحث ثم `unique()` أو `first()` حسب تفرد البيانات.
- **Index / Query design:** Index على `settings` يطابق مفاتيح البحث والترتيب المستخدمة في `seedDemo`.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا؛ راجع فقط هل الحد الحالي جزء من UX أم truncation غير معلن.

#### Other-3: [Medium] Potential N+1

- **الموقع:** `convex/seed.ts:114` — `seedDemo`
- **الثقة:** مرشح قوي — تحقق قبل الإصلاح
- **الدليل:** `for (const [productId, quantity] of [[prod1, 8], [prod2, 5], [prod3, 3], [prod4, 15], [prod5, 1]] as const) { const product = await ctx.db.get(productId); if (!product) continue; await changeProductStock(ctx, user, { pro`
- **الأثر:** تنفيذ قراءات قاعدة بيانات داخل loop يضاعف عدد الاستعلامات حسب عدد السجلات ويزيد زمن التنفيذ.
- **الإصلاح المقترح:** اجمع المعرفات أولًا، استخدم استعلامًا indexed/batched، أو `Promise.all` بحد صغير عندما لا يوجد بديل؛ تجنب fan-out غير المحدود.
- **Index / Query design:** أضف Index يتيح جلب العلاقات في دفعة واحدة حسب foreign key أو parent ID بدل lookup لكل صف.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم غالبًا، لكن يجب الحفاظ على ترتيب النتائج والتعامل مع السجلات المحذوفة أو المفقودة.

#### Other-4: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/CRMPage.tsx:93` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `es, selectedLead ? { id: selectedLead } : "skip" ); const createLead = useMutation(api.leads.create); const updateLead = useMutation(api.leads.update); const updateStatus = useMuta`
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

#### Other-5: [Medium] Client-side aggregation

- **الموقع:** `src/components/CRMPage.tsx:99` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `ity); const filtered = (leads ?? []).filter(l => { const matchSearch = l.name.includes(search) || l.phone.includes(search) || (l.interest ?? "").includes(search); const matchSource`
- **الأثر:** التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.
- **الإصلاح المقترح:** استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.
- **Index / Query design:** Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.

#### Other-6: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/CRMPage.tsx:100` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `rtToCustomer); const addActivity = useMutation(api.leads.addActivity); const deleteActivity = useMutation(api.leads.deleteActivity); const filtered = (leads ?? []).filter(l => { co`
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

#### Other-7: [Medium] Client-side aggregation

- **الموقع:** `src/components/PrintTemplate.tsx:547` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `</tbody> </table> </> )} {/* الإجماليات */} <div className="print-totals"> <div className="print-totals-box"> {data.parts.length > 0 && ( <div className="print-total-row"> <span>تك`
- **الأثر:** التجميع في الواجهة يعتمد على كل البيانات المحملة وقد يصبح مكلفًا أو غير دقيق مع pagination.
- **الإصلاح المقترح:** استخدم endpoint إحصاءات قابل للتوسع أو incremental counters؛ سمِّ المؤشر صراحةً بأنه للصفحات المحملة إن كان ذلك مقصودًا.
- **Index / Query design:** Counters/aggregate table keyed by branch/status/date أو query bounded حسب النطاق.
- **إمكانية الإصلاح دون تغيير السلوك:** جزئيًا؛ يجب تحديد هل المطلوب رقم عالمي أم رقم الصفحات المحملة.

#### Other-8: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/Sidebar.tsx:113` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `const val = (modules as Record<string, boolean | undefined>)[moduleKey]; return val === undefined ? true : val; // default to enabled if not set }; const toggleGroup = (label: stri`
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

#### Other-9: [Medium] Client-side filtering/sorting

- **الموقع:** `src/components/Sidebar.tsx:118` — `React component`
- **الثقة:** يحتاج مراجعة سياق
- **الدليل:** `set }; const toggleGroup = (label: string) => { setCollapsed(prev => ({ ...prev, [label]: !prev[label] })); }; const isGroupActive = (group: NavGroup) => group.items.some(i => i.id`
- **الأثر:** الفلاتر أو الترتيب المحلي قد يعمل فقط على البيانات المحملة ويزيد payload ويعطي نتائج غير كاملة مع pagination.
- **الإصلاح المقترح:** انقل الفلاتر الانتقائية والترتيب إلى endpoint indexed، واترك البحث المحلي فقط عندما يكون موسومًا بأنه داخل الصفحات المحملة.
- **Index / Query design:** Index مركب يبدأ بالفرع ثم الفلاتر المتساوية ثم التاريخ/الترتيب.
- **إمكانية الإصلاح دون تغيير السلوك:** نعم، لكن يلزم توضيح فرق البحث الكلي مقابل البحث داخل الصفحات المحملة.

## ترتيب Pull Requests المقترح

1. **Critical unbounded reads:** تحويل القوائم/الإحصاءات ذات الجداول الكبيرة إلى Cursor Pagination أو counters، مع اختبارات branch/permission.
2. **Branch-scoped master lists:** Products/Customers/Employees/Branches والـpickers التي ما زالت تقرأ كامل الجدول ثم تفلتر.
3. **Finance & ledgers:** Pagination وIndexes مركبة للـfinancial transactions والقيود ودفاتر العملاء والموردين والتقارير.
4. **Operational modules:** Invoices/Deliveries/Repairs/Shipments/Returns؛ نقل status/date/search filters إلى Backend indexed.
5. **Frontend pagination cleanup:** إزالة `slice`/pageSize المحلية، وتوضيح البحث داخل الصفحات المحملة مقابل البحث الكلي.
6. **DTO hardening:** استبدال المستندات الخام بـallowlisted DTOs وتقليل payload، خصوصًا البيانات المالية والتكلفة.
7. **N+1 cleanup:** تجميع العلاقات في استعلامات batched/indexed والحفاظ على ترتيب النتائج.

## اختبارات القبول المطلوبة لكل PR

- نتائج متطابقة قبل/بعد على dataset صغير مرجعي.
- Cursor pagination مستقرة دون تكرار أو فقد عند إضافة سجلات جديدة.
- عزل الفرع وصلاحيات العرض fail-closed في Backend، لا UI فقط.
- الفلاتر والتواريخ تعمل على كامل dataset، لا الصفحات المحملة فقط.
- DTO لا يكشف تكلفة/ربح/هوية/بيانات داخلية دون صلاحية.
- Load More، Loading First Page، Empty، Exhausted، والخطأ الشبكي حالات مستقلة.
- قياس عدد القراءات وحجم payload ووقت الاستجابة قبل/بعد على Staging.

## المخاطر والنقاط التي تحتاج اختبارًا يدويًا

- بعض `collect()` قد تكون مقصودة لجداول إعدادات صغيرة؛ يجب إثبات سقف الحجم قبل إبقائها.
- تغيير ترتيب حقول Index قد يؤثر على إمكانية تطبيق range بعد equality؛ راجع قواعد Convex لكل query.
- تحويل البحث المحلي إلى خادمي قد يغير التطبيع العربي وحساسية الأحرف؛ ثبّت حالات اختبار عربية.
- Pagination مع بيانات تتغير لحظيًا تحتاج اختبار التكرار/الفقد أثناء Load More.
- Counters والإحصاءات المسبقة تحتاج Backfill ومقارنة مع المصدر قبل تفعيلها.
- لا تدمج إصلاحات الأداء مع تغييرات محاسبية أو صلاحيات في PR واحد.

## حدود التقرير

- التقرير لا يعدّل الكود ولا يثبت أن كل مرشح يمثل عطلًا فعليًا.
- لا توجد بيانات Production أو traces ضمن هذا التدقيق.
- أرقام السطور تقريبية بالنسبة للـHead الذي ولّد التقرير وقد تتحرك بعد الدمج.
