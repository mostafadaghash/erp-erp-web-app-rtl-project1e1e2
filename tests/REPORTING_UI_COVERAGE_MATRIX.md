# Reporting UI acceptance matrix

| ID | Surface | Evidence | Expected result | Status |
| --- | --- | --- | --- | --- |
| RUI-01 | Reports permission | `view_reports` + `skip` | لا ينفذ التقرير دون الصلاحية | EXECUTABLE |
| RUI-02 | Branch query | `reporting.availableBranches` | لا يعتمد التقرير على `view_branches` | EXECUTABLE |
| RUI-03 | Central scope | Admin / Accountant + branch selector | فرع محدد أو تقرير مجمع | EXECUTABLE |
| RUI-04 | Pinned scope | Non-central user | يعرض فرع المستخدم دون selector | EXECUTABLE |
| RUI-05 | Date presets | Today / 7 days / month / year / custom | نطاقات عملية صريحة | EXECUTABLE |
| RUI-06 | Date validation | ISO, order, 366 days | `skip` قبل الطلب غير الصحيح | EXECUTABLE |
| RUI-07 | Date basis | Reports source | لا استخدام لـ`_creationTime` | EXECUTABLE |
| RUI-08 | Data source | Accounting totals | Query واحدة `reporting.overview` | EXECUTABLE |
| RUI-09 | Sales | Gross / returns / net | عرض صافي المبيعات من DTO | EXECUTABLE |
| RUI-10 | Collections | Collections / refunds / reversals | عرض صافي التحصيل الصحيح | EXECUTABLE |
| RUI-11 | Expenses | Operating + carrier fees | مصروفات الفترة الكلية | EXECUTABLE |
| RUI-12 | Subledgers | Customer / advance / supplier | أرصدة منفصلة غير مكررة | EXECUTABLE |
| RUI-13 | Profit permission | `view_profits` | لا اشتقاق محلي للربح | EXECUTABLE |
| RUI-14 | Incomplete COGS | Missing historical cost | تحذير وعدم عرض ربح تقديري | EXECUTABLE |
| RUI-15 | Inventory value | Optional DTO field | لا يظهر دون صلاحية الربح | EXECUTABLE |
| RUI-16 | Monthly trend | Backend monthly rows | صافي المبيعات والمصروفات والربح | EXECUTABLE |
| RUI-17 | Top products | Net sales + optional profit | ترتيب Backend دون إعادة حساب | EXECUTABLE |
| RUI-18 | Purchases | Landed / liability / credits / payments | مؤشرات مورد منفصلة | EXECUTABLE |
| RUI-19 | COD | Collected / settled / movement / outstanding | مؤشرات COD منفصلة | EXECUTABLE |
| RUI-20 | UI states | Unauthorized / invalid / loading | حالة واضحة لكل مسار | EXECUTABLE |
| RUI-21 | Dashboard source | Current month overview | مؤشرات الشهر من التقرير المركزي | EXECUTABLE |
| RUI-22 | Legacy stats removal | No invoice/expense stats | لا حساب محاسبي قديم | EXECUTABLE |
| RUI-23 | Dashboard cards | Sales / collections / AR / expenses / COD | بطاقات غير مكررة | EXECUTABLE |
| RUI-24 | Dashboard profit | Permission + completeness | إخفاء أو تحذير صحيح | EXECUTABLE |
| RUI-25 | Operational widgets | Recent docs / repairs / stock | تبقى تشغيلية فقط | EXECUTABLE |
| RUI-26 | Dashboard loading | Undefined report | Skeleton دون أرقام صفرية مضللة | EXECUTABLE |
| RUI-27 | Branch policy backend | Permission + roles + active branch | نفس سياسة التقرير | EXECUTABLE |
| RUI-28 | Branch DTO | `_id`, `name` | لا أرصدة أو تفاصيل داخلية | EXECUTABLE |
| RUI-29 | Read only | Reports + Dashboard | لا Mutation أو كتابة مالية | EXECUTABLE |
| RUI-30 | Type safety | Modified UI files | لا `as any` أو `@ts-ignore` | EXECUTABLE |
