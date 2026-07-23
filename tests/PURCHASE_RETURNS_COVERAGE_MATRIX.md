# مصفوفة تغطية قبول مرتجعات المشتريات

> جميع الصفوف أدناه تصف أجسام الاختبارات التنفيذية الفعلية في `purchaseReturnsIntegration.test.ts`؛ المستخدم Admin والفرع الرئيسي ما لم يذكر خلاف ذلك.

| الاختبار (الاسم الحرفي)                       | البيانات والأرقام/المستخدم                   | Mutation أو Query                                 | الجداول والحقول/الرفض                                   |
| --------------------------------------------- | -------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| PRT-01 مرتجع جزئي يخفض مديونية غير مدفوعة فقط | غير مدفوع 110؛ بند 3/100 ومخزون 10/120       | `create كمية 1`                                   | return/receipt/balance/product/inventory؛ لا finance    |
| PRT-02 مرتجع مدفوع بالكامل ورد نقدي           | مدفوع 100؛ حساب cash رصيده 100               | `create كمية 1 مع refundAccountId`                | cashRefund 33.33؛ receipt 66.67/0؛ transaction/movement |
| PRT-03 مرتجع مختلط                            | مدفوع 60/متبقٍ40؛ بند 70                     | `create كمية 1 مع cash`                           | debt 40؛ cash 30؛ receipt 30/30/0 والدفتر               |
| PRT-04 مرتجع شحن فقط دون مخزون                | شحن مورد 10؛ بلا بنود                        | `create freight=4 items=[]`                       | goods/inventory=0؛ returnedFreight=4؛ ledger=-4         |
| PRT-05 رفض طلب فارغ                           | مستند 110 قبل العملية                        | `create items=[] freight=0`                       | رفض يجب اختيار بند؛ snapshot كل الجداول                 |
| PRT-06 إعادة إنشاء بنفس requestId             | بند فعلي وrequestId ثابت                     | `create مرتين بذات الحمولة`                       | نفس id؛ return/inventory/ledger مرة واحدة               |
| PRT-07 رفض بصمة مختلفة                        | مرتجع منشور ثم تاريخ مختلف                   | `create ثم retry`                                 | رفض بيانات مختلفة؛ snapshot ثابت                        |
| PRT-08 رفض رقم إشعار مكرر                     | شحن 10؛ Note 1                               | `create ثم note 1`                                | رفض مسجل سابقاً؛ لا أثر جزئي                            |
| PRT-09 تطبيع رقم الإشعار ونطاق المورد والفرع  | AbC 12؛ مورد ثانٍ؛ 101 حرف وفراغ             | `create مرات نطاق مستقلة`                         | display/key والتطبيع وحدود الإدخال                      |
| PRT-10 ترقيم PRN متسلسل                       | شحن 10؛ عمليتان في 2026                      | `create مرتين`                                    | PRN-2026-00001/00002                                    |
| PRT-11 فصل PRN بين السنوات                    | عملية 2025 وأخرى 2026                        | `create بتاريخين`                                 | بدء 00001 لكل سنة                                       |
| PRT-12 الائتمان التراكمي                      | quantity=3 lineTotal=100                     | `create كمية1 مرتين`                              | credits 33.33/33.34؛ returnedGoods=66.67                |
| PRT-13 فرق التقريب التاريخي                   | quantity=3 lineTotal=100                     | `create كمية1 ثلاث مرات`                          | المجموع 100 بالضبط وآخر 33.33                           |
| PRT-14 رفض تجاوز الكمية                       | إرجاع 2 ثم محاولة 2 من أصل3                  | `create ثم create مرفوض`                          | رفض تجاوز المتاح؛ snapshot ثابت                         |
| PRT-15 رفض كمية غير صحيحة                     | 0 و-1 و1.5 وNaN                              | `create لكل قيمة`                                 | رفض validation وsnapshot مستقل                          |
| PRT-16 ترتيب receiptItemIndex                 | بندان 20 و40؛ ترتيب 1 ثم0                    | `create items معكوسة`                             | stored items/movements بالترتيب 0 ثم1                   |
| PRT-17 رفض تكرار البند                        | البند index=0 مكرر                           | `create`                                          | رفض التكرار؛ صفر آثار                                   |
| PRT-18 رفض تجاوز الشحن                        | شحن متاح 5                                   | `create freight=5.01`                             | رفض تجاوز الرصيد؛ snapshot                              |
| PRT-19 استبعاد الشحن الخارجي                  | شحن مورد4 وخارجي20                           | `create 4 ثم محاولة1`                             | credit=4 فقط؛ الخارجي مستبعد                            |
| PRT-20 المتوسط المتحرك                        | stock10/value120؛ return2                    | `create`                                          | removed24؛ stock8/value96؛ movement before/after        |
| PRT-21 تصفير قيمة المخزون                     | stock3/value35.99؛ return3                   | `create`                                          | stock/value صفر؛ removed35.99                           |
| PRT-22 رفض نقص المخزون                        | تاريخي3 لكن stock1؛ مدفوع وحساب              | `create quantity2`                                | رفض نقص؛ receipt/balance/account ثابتة                  |
| PRT-23 Rollback متعدد البنود                  | بند كافٍ وبند stock0                         | `create بندين`                                    | rollback كامل للمنتج الأول والجداول                     |
| PRT-24 تحديث الكميات المرتجعة                 | أصل3؛ مرتجعان متتابعان                       | `create/query/create/query eligibleReceipts`      | original/returned/available =3/1/2 ثم3/2/1              |
| PRT-25 netPayable دون payable                 | payable تاريخي110؛ goods33.33+freight2       | `create`                                          | payable ثابت؛ net74.67؛ totals دقيقة                    |
| PRT-26 اشتقاق حالة المستند                    | ثلاث fixtures paid=0/50/100                  | `create freight10`                                | statuses unpaid/partial/paid ومعادلة المبالغ            |
| PRT-27 خفض رصيد المورد                        | partial paid60؛ credit33.33                  | `create`                                          | balance 200→166.67؛ ledger=-33.33                       |
| PRT-28 زيادة حساب الرد                        | paid100؛ cash account25                      | `create`                                          | movement 25→58.33 signed33.33 وروابطه                   |
| PRT-29 رفض حساب معطل                          | paid100؛ حساب cash معطل                      | `create`                                          | رفض معطل؛ snapshot ثابت                                 |
| PRT-30 رفض حساب فرع آخر                       | فرعان؛ حساب الفرع الثاني                     | `create لreceipt الأول`                           | رفض لا ينتمي؛ snapshot ثابت                             |
| PRT-31 رفض clearing                           | paid100؛ paymob_clearing                     | `create`                                          | رفض حساب وسيط؛ snapshot ثابت                            |
| PRT-32 رفض التاريخ واحترام تاريخ القطع        | invalid؛ قبل cutover؛ عند cutover            | `create ثلاث حالات`                               | رفض التاريخين؛ نجاح 2026-02-01                          |
| PRT-33 صلاحية الإنشاء للأدوار المعتمدة        | admin/manager/accountant مستقلون             | `create لكل دور`                                  | createdBy مطابق ونجاح المصدر المركزي                    |
| PRT-34 رفض غير المصرح                         | viewer بصلاحية view فقط                      | `create`                                          | رفض create_purchase_returns؛ snapshot                   |
| PRT-35 عزل manager                            | manager وفرعان/مستندان                       | `create own؛ create/list foreign`                 | نجاح الخاص؛ رفض/عدم تسريب الآخر                         |
| PRT-36 سياسة admin تمنع خلط الفروع والموردين  | admin؛ receipt فرع1 وحساب فرع2               | `create mixed ثم own`                             | رفض الخلط ونجاح التطابق                                 |
| PRT-37 pagination معزولة بلا تكرار            | 3 returns؛ page size=1                       | `list حتى isDone`                                 | 3 ids فريدة؛ cursors مكتملة                             |
| PRT-38 DTO redaction وقت التشغيل              | مرتجع فعلي                                   | `list runtime`                                    | غياب مفاتيح idempotency/users/ledger/finance/balances   |
| PRT-39 Print DTO والصلاحية واسم المستخدم      | profiles by_user ثم by_token؛ denied profile | `getForPrint`                                     | اسم معروف/fallback/غير معروف؛ رفض print permission      |
| PRT-40 عكس خفض الدين                          | debt-only فعلي                               | `create ثم reverse`                               | receipt/balance/stock/value restored؛ ledger ±33.33     |
| PRT-41 عكس الرد النقدي                        | cash-only وحساب                              | `create ثم reverse`                               | movements ±33.33 وروابط original/reversal               |
| PRT-42 عكس مختلط                              | mixed 40 debt/30 cash                        | `create ثم reverse`                               | receipt 100/60/40؛ balance/stock/account restored       |
| PRT-43 Retry العكس                            | debt return ثم reversal args ثابتة           | `reverse مرتين`                                   | نفس id؛ snapshots بلا تكرار                             |
| PRT-44 رفض عكس مختلف                          | مرتجع معكوس ثم تاريخ/سبب/request مختلف       | `reverse`                                         | رفض طلب مختلف؛ snapshot                                 |
| PRT-45 Rollback نقص الخزينة                   | cash refund ثم currentBalance=0              | `reverse`                                         | رفض الرصيد؛ posted وكل الجداول ثابتة                    |
| PRT-46 استعادة جميع الأرصدة التشغيلية         | snapshot mixed قبل الإنشاء                   | `create ثم reverse`                               | تشغيلية product/receipt/supplier/account مساوية للأصل   |
| PRT-47 توافق عكس دفعة المورد                  | supplier payment60 ثم return66.67            | `supplierPayments.create/reverse؛ return reverse` | رسالة عربية؛ نجاح بعد عكس الإشعار واتساق 0/100          |
| PRT-48 لا payments قديم ولا حذف ولا تكرار     | cash create/retry/reverse/retry              | `create/reverse`                                  | payments=0؛ return reversed؛ uniqueness لكل الحركات     |
