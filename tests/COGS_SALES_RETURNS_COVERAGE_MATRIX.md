# COGS and sales-return executable coverage matrix

كل صف أدناه يصف جسم اختبار قبول منفصل ينفذ العملية المذكورة فعليًا عبر `convex-test`؛ لا يُستدل على التغطية من عدد الاختبارات.

| السيناريو | البيانات المعدة | Mutation / Query | الآثار المؤكدة | اسم الاختبار |
|---|---|---|---|---|
| COGS-01 | منتج افتتاحي 4 × 12.5 | `products.create` | الرصيد، القيمة، حركة الافتتاح | `COGS-01 opening balance records stock and inventory value` |
| COGS-02 | رصيد قديم وشحنة بتكلفة وشحن | `shipments.create/updateStatus` | المتوسط والقيمة ورفض الوصول المكرر | `COGS-02 shipment receipt applies landed moving average and cannot arrive twice` |
| COGS-03 | منتج وفاتورة بيع | `invoices.create` | COGS المجمد، نقص المخزون والقيمة | `COGS-03 sale freezes COGS and lowers value without changing average` |
| COGS-04 | فاتورة legacy بلا costingVersion | `salesReturns.create` | الرفض وعدم التخمين | `COGS-04 legacy invoice cannot create an automatic stock return` |
| COGS-05 | بيع 3 ومرتجع وحدة | `salesReturns.create مرتين بنفس requestId` | القيمة التاريخية وإشعار واحد | `COGS-05 partial return restores historical value and is idempotent` |
| COGS-06 | 10 وحدات @10 ثم 10 @20 | `shipments.create/updateStatus` | stock=20، value=300، cost=15 وحركة 200 | `COGS-06 weighted average is persisted by receipt` |
| COGS-07 | شحنة @20 وشحن 40 | `shipments.updateStatus(arrived)` | إضافة الشحن للقيمة والحركة | `COGS-07 landed cost includes shipping` |
| COGS-08 | 3 بنود متساوية وشحن 1 | `shipments.updateStatus(arrived)` | توزيع .33/.33/.34 ومجموع دقيق | `COGS-08 shipping allocation survives rounding` |
| COGS-09 | شحنة مستلمة | `shipments.updateStatus(arrived) ثانية` | رفض وثبات الرصيد والقيمة والحركات | `COGS-09 duplicate receipt is rejected without effects` |
| COGS-10 | بيع وحدتين @ تكلفة 10 | `invoices.create` | stock/value/valueDelta وثبات المتوسط | `COGS-10 sale reduces quantity and value without changing average` |
| COGS-11 | فاتورة ثم تغيير تكلفة المنتج | `invoices.create + قراءة DB` | unitCost/costTotal/cogsTotal تاريخية | `COGS-11 server freezes historical cost snapshot` |
| COGS-12 | اسم وأسعار وإجماليات عميل عدائية | `invoices.create` | اسم وسعر وتكلفة وإجمالي الخادم | `COGS-12 hostile client prices names and totals are ignored` |
| COGS-13 | viewer يملك view_invoices فقط | `invoices.get` | حذف unitCost/costTotal/cogsTotal | `COGS-13 invoice query redacts costs without profit permission` |
| COGS-14 | admin يملك view_profits | `invoices.get` | ظهور حقول التكلفة | `COGS-14 profit permission exposes historical cost` |
| COGS-15 | فاتورة غير مدفوعة وعميل | `invoices.cancel` | عودة المخزون والقيمة وحركة reversal والعميل | `COGS-15 cancellation restores stock value and customer` |
| COGS-16 | فاتورة ملغاة مرة | `invoices.cancel ثانية` | رفض وثبات المخزون والحركات والعميل | `COGS-16 cancellation retry cannot duplicate reversal` |
| COGS-17 | فاتورة قديمة ثم تكلفة حالية جديدة | `invoices.update` | عكس القديم تاريخيًا وتثبيت الجديد والحركات | `COGS-17 invoice edit reverses historical old lines and freezes new cost` |
| COGS-18 | فاتورة legacy بلا snapshot | `salesReturns.create` | رفض ذري بلا تخمين | `COGS-18 legacy costing is rejected without guessed inventory` |
| COGS-19 | فاتورة 3 وحدات | `salesReturns.create لوحدة` | stock/value/credit/net/status | `COGS-19 partial return restores stock value credit net and status` |
| COGS-20 | فاتورة 3 ومرتجعان | `salesReturns.create ×2 + eligibleInvoices` | returned/available ومجموع الائتمان | `COGS-20 multiple returns accumulate returned and available quantities` |
| COGS-21 | فاتورة وحدتين وطلب 3 | `salesReturns.create` | رفض وتطابق snapshot لكل الجداول | `COGS-21 over-return rejects atomically` |
| COGS-22 | 3 وحدات و3 مرتجعات | `salesReturns.create ×3` | مجموع credits=total وnet=0 وreturned | `COGS-22 full rounded return reconciles exact invoice net` |
| COGS-23 | فاتورة آجلة | `salesReturns.create` | debtReduction دون حركة مالية وخفض العميل | `COGS-23 unpaid return reduces debt without financial movement` |
| COGS-24 | فاتورة مدفوعة وحساب | `salesReturns.create` | cashRefund والمعاملة والحساب وpaid/net | `COGS-24 paid return posts cash refund and updates account` |
| COGS-25 | دفعة جزئية ومرتجع وحدتين | `recordPayment + salesReturns.create` | تقسيم 60 إلى debt 30 وcash 30 | `COGS-25 mixed return splits debt and cash exactly` |
| COGS-26 | مرتجع جزئي وحساب | `create return/payment/refund/reverse` | paid/remaining/net وحفظ دلالة المرتجع بكل انتقال | `COGS-26 return status survives collection refund and reversal` |
| COGS-27 | عميل وفاتورة ومرتجع | `create/payment/reverse` | balance: 90→60→40→70 | `COGS-27 customer balance follows sale return collection and reversal` |
| COGS-28 | عميل وفاتورة ومرتجع | `create/reverse` | totalPurchases: 90→60→90 | `COGS-28 total purchases follows sale return and reversal` |
| COGS-29 | حساب معطل ومرتجع نقدي | `salesReturns.create` | رفض وتطابق كل الجداول | `COGS-29 disabled refund account rejects all effects` |
| COGS-30 | فرعان وحساب بالآخر | `salesReturns.create` | رفض وتطابق كل الجداول | `COGS-30 cross-branch refund account rejects and isolates` |
| COGS-31 | حساب رصيده 5 وrefund 30 | `salesReturns.create` | رفض ذري وتطابق كل الجداول | `COGS-31 insufficient account balance rolls back entire return` |
| COGS-32 | تاريخ قبل cutover | `salesReturns.create` | رفض وتطابق كل الجداول | `COGS-32 return before cutover is rejected without effects` |
| COGS-33 | مرتجع نقدي requestId مكرر | `salesReturns.create ×2` | ID/رقم/إشعار/مخزون/مالية مرة واحدة | `COGS-33 creation request idempotency duplicates no effect` |
| COGS-34 | رقم legacy 00009 مع count غير دال | `salesReturns.create ×2` | CRN فريد 00010/00011 ومتسلسل | `COGS-34 credit note numbering is unique sequential and ignores count` |
| COGS-35 | فاتورة ملغاة | `salesReturns.create` | رفض وثبات الحالة | `COGS-35 cancelled invoice rejects sales return` |
| COGS-36 | بلا صلاحية ومستخدم فرع آخر ومشاهد بلا profits | `salesReturns.create/list` | منع mutation وعزل query وحجب COGS | `COGS-36 permissions branch isolation and return cost redaction` |

## اختبارات العكس الإضافية

| البيانات المعدة | Mutation | الآثار المؤكدة | اسم الاختبار |
|---|---|---|---|
| مرتجع بلا نقد | `salesReturns.reverse` مرتين ثم request مختلف | idempotency، عدم تكرار المخزون، ورفض الطلب المختلف | `COGS-35A reversal without cash is atomic and idempotent` |
| مرتجع نقدي مرتبط بدفعة | `salesReturns.reverse` | رد النقد مرة، original يصبح reversed، والربط ثنائي الاتجاه | `COGS-35B cash-refund reversal links both financial transactions` |
| مرتجع نقدي وحالة حساب غير كافية مصطنعة | `salesReturns.reverse` | رفض وتراجع كامل لكل الجداول | `COGS-35C cash reversal insufficient account state rolls back atomically` |
| مرتجع وتاريخ قبل/بعد القطع | `salesReturns.reverse` | رفض القديم بلا أثر وحفظ `reversalDate` المقبول | `COGS-35D reversal date is persisted and cutover enforced` |

## التصنيف

- **Convex integration:** 41 اختبارًا؛ كل واحد ينفذ Mutation أو Query حقيقية.
- **Pure:** 3 اختبارات (`PURE-01`–`PURE-03`).
- **Source regression:** 11 اختبارًا (`UI-01`–`UI-11`).
- لا توجد اختبارات placeholder أو صفوف تنشئ أسماء سيناريوهات بلا عمليات.
