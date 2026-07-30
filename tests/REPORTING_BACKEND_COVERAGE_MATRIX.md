# Reporting backend acceptance matrix

كل صف أدناه ينفذ `api.reporting.overview` على Convex Test Harness، ويستخدم تاريخ العملية والفهرس الخاص بالفرع. لا تمثل حالة `EXECUTABLE` فحصًا نصيًا فقط.

| ID | البيانات المعدة | الهوية والنطاق | العملية والنتيجة المثبتة | الحالة |
|---|---|---|---|---|
| RPT-01 | فترة `2026-02-30..2026-03-01` | Manager، الفرع 1 | رفض تاريخ ISO مستحيل برسالة عربية | EXECUTABLE |
| RPT-02 | فترة تتجاوز 366 يومًا | Manager، الفرع 1 | رفض النطاق الكبير قبل قراءة بيانات التقرير | EXECUTABLE |
| RPT-03 | Viewer بلا `view_reports` | الفرع 1 | رفض Query المحمية | EXECUTABLE |
| RPT-04 | فاتورة 100 بالفرع 1 وفاتورة 50 بالفرع 2 | Manager الفرع 1 | إجمالي 100 ورفض اختيار الفرع 2 | EXECUTABLE |
| RPT-05 | مبيعات 100 و70 في فرعين | Admin | اختيار كل فرع يعيد 100 ثم 70 دون خلط | EXECUTABLE |
| RPT-06 | مبيعات 100 و70 في فرعين | Accountant مركزي | تقرير موحد بفرعين وإجمالي 170 | EXECUTABLE |
| RPT-07 | فاتورة 100 وفاتورة ملغاة 900 | Manager | عدد الفواتير 1 وإجمالي المبيعات 100 | EXECUTABLE |
| RPT-08 | فاتورة بتاريخ 31 يناير | Manager | تظهر في يناير ولا تظهر في فبراير رغم وقت الإنشاء | EXECUTABLE |
| RPT-09 | فاتورة 100/COGS 60 ومرتجع 25/15 | Manager | صافي المبيعات 75 وCOGS 45 ومجمل الربح 30 | EXECUTABLE |
| RPT-10 | مرتجع 25 في يناير وعكسه في فبراير | Manager | يناير `+25` مرتجعات وفبراير `-25` | EXECUTABLE |
| RPT-11 | فاتورة 120 وCOGS تاريخي 72 | Manager | مجمل وصافي الربح 48 والهامش 40% | EXECUTABLE |
| RPT-12 | فاتورة 100 بلا Snapshot تكلفة | Manager | `complete=false` وCOGS والربح `null` دون تخمين | EXECUTABLE |
| RPT-13 | مصروف 20 ومصروف مبطل 900 | Manager | المصروف التشغيلي 20 فقط | EXECUTABLE |
| RPT-14 | مصروف 20 وتسوية COD برسوم 5 | Manager | فصل المصروف 20 عن رسوم الناقل 5 والإجمالي 25 | EXECUTABLE |
| RPT-15 | تسوية رسومها 5 ثم عكس لاحق | Manager | `+5` في تاريخ التسوية و`-5` في تاريخ العكس | EXECUTABLE |
| RPT-16 | مبيعات 100/COGS 60 ومصروف 10 ورسوم 5 | Manager | صافي الربح `100-60-10-5=25` | EXECUTABLE |
| RPT-17 | تحصيل 70 ورد 20 | Manager | الإيراد لا يتغير؛ التحصيل والرد منفصلان وصافي النقد 50 | EXECUTABLE |
| RPT-18 | تحصيل 70 وحركة عكس 70 | Manager | صافي التحصيل صفر وفق نوع الحركة الأصلية | EXECUTABLE |
| RPT-19 | رصيد عميل: مستحق 120 ومقدم 30 | Manager | إرجاع الحقلين منفصلين دون دمجهما | EXECUTABLE |
| RPT-20 | رصيد مورد 200 | Manager | `supplierPayables=200` من دفتر المورد الجديد | EXECUTABLE |
| RPT-21 | استلام: landed 100 وpayable 80 | Manager | فصل تكلفة الشراء 100 عن الالتزام 80 | EXECUTABLE |
| RPT-22 | مرتجع شراء 20 وعكسه لاحقًا | Manager | خصم المورد `+20` ثم `-20` بتاريخ العكس | EXECUTABLE |
| RPT-23 | دفعة مورد 30 وعكس لاحق | Manager | الدفعة `+30` ثم `-30` حسب تاريخ الحدث | EXECUTABLE |
| RPT-24 | تحصيل COD 80 وتسوية 80 ورصيد حساب 80 | Manager | collected 80 وsettled 80 والحالي 80 | EXECUTABLE |
| RPT-25 | Confirmation بقيمة 80 ثم عكس | Manager | حركة COD `+80` ثم `-80` بتاريخ العكس | EXECUTABLE |
| RPT-26 | Cash 100 وPaymob 25 وCOD 80 | Manager | سيولة 100 وClearing آخر 25 وCOD 80 منفصلة | EXECUTABLE |
| RPT-27 | فاتورة 100/60 | مستخدم `view_reports` فقط | حجب profitability وinventoryValue وCOGS المنتجات | EXECUTABLE |
| RPT-28 | منتج Legacy: مخزون 5 وتكلفة 60 بلا inventoryValue | Manager | قيمة حالية 300 مع `legacyInventoryValueProducts=1` | EXECUTABLE |
| RPT-29 | بيع 100/60 ومرتجع 25/15 | Manager | المنتج الأعلى: صافي 75 وCOGS 45 وربح 30 | EXECUTABLE |
| RPT-30 | فاتورة فعلية | Manager | Runtime DTO لا يحتوي Idempotency أو User أو روابط القيود | EXECUTABLE |
| RPT-31 | فاتورة ومصروف | Manager | Snapshot قبل/بعد Query متطابق لكل جداول المصدر | EXECUTABLE |
| RPT-32 | مبيعات 100 و900 ورصيد عميل 999 في الفرع 2 | Manager وAdmin | Manager يرى 100/0 وAdmin الموحد يرى 1000/999 | EXECUTABLE |
| RPT-33 | مبيعات يناير 100 ومارس 50 | Manager، يناير..مارس | Trend مرتبة: 100، صفر، 50 وتحتفظ بالشهر الخالي | EXECUTABLE |
| RPT-34 | مرتجع يناير 25/15 وعكس فبراير | Manager | Trend يناير COGS 45 وفبراير مرتجعات `-25` وCOGS 15 | EXECUTABLE |
| RPT-35 | فاتورة أبريل بلا COGS | Admin ومستخدم تقارير فقط | Admin يرى أرباحًا `null`؛ غير المخول لا يستلم مفاتيح التكلفة | EXECUTABLE |
| RPT-36 | مصروف 20، شراء 120، COD 80 وتسوية برسوم 5 | Manager، يناير..مارس | Trend تفصل المصروف والشراء والتحصيل والتسوية والرسوم حسب الشهر | EXECUTABLE |
