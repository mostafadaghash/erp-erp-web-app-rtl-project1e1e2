# General Ledger UI Acceptance Matrix

كل صف يربط سلوك واجهة مستقلًا بمصدر الصلاحية وواجهة Convex ودليل الانحدار. هذه اختبارات واجهة مصدرية مستقلة وليست بديلًا عن E2E بمتصفح مصادق عليه.

| ID      | الوظيفة              | الصلاحية / العزل            | Public API أو الأثر                | دليل القبول                              | الحالة     |
| ------- | -------------------- | --------------------------- | ---------------------------------- | ---------------------------------------- | ---------- |
| GLUI-01 | صفحة عربية RTL       | `view_general_ledger`       | واجهة الصفحة                       | `dir="rtl"` والعنوان العربي              | EXECUTABLE |
| GLUI-02 | تحذير Foundation     | عرض عام داخل الصفحة المحمية | `status.operationalPostingEnabled` | يصرح أن الربط التشغيلي غير مفعّل         | EXECUTABLE |
| GLUI-03 | Hooks الصلاحيات      | ثماني صلاحيات مستقلة        | `usePermission`                    | كل Hook ثابت أعلى المكوّن                | EXECUTABLE |
| GLUI-04 | منع غير المصرح       | `view_general_ledger`       | لا Queries تشغيلية                 | رسالة منع واضحة                          | EXECUTABLE |
| GLUI-05 | فروع الأستاذ         | `view_general_ledger`       | `availableBranches`                | Query محمية و`skip`                      | EXECUTABLE |
| GLUI-06 | اختيار الفرع المركزي | Admin / Accountant          | `availableBranches`                | Select للفرع النشط                       | EXECUTABLE |
| GLUI-07 | تثبيت الفرع          | Manager وغير المركزي        | `availableBranches`                | لا اختيار فرع مخالف                      | EXECUTABLE |
| GLUI-08 | تغيير الفرع          | عزل الطلبات                 | State reset                        | تدوير IDs ومسح الاختيارات                | EXECUTABLE |
| GLUI-09 | تاريخ القطع          | `view_general_ledger`       | `status`                           | تاريخ Backend يملأ الافتتاح              | EXECUTABLE |
| GLUI-10 | التهيئة              | `initialize_general_ledger` | `initialize`                       | Busy وRequest ID ثابت                    | EXECUTABLE |
| GLUI-11 | تنقل الوظائف         | `view_general_ledger`       | ثمانية تبويبات                     | جميع وحدات الأستاذ ظاهرة                 | EXECUTABLE |
| GLUI-12 | شجرة الحسابات        | `view_general_ledger`       | `chart`                            | تجميع أب/ابن recursive                   | EXECUTABLE |
| GLUI-13 | إنشاء حساب           | `manage_chart_of_accounts`  | `createAccount`                    | أب تجميعي نشط فقط                        | EXECUTABLE |
| GLUI-14 | طبيعة الحساب         | `manage_chart_of_accounts`  | `createAccount`                    | اشتقاق Debit/Credit وContra              | EXECUTABLE |
| GLUI-15 | تعطيل حساب           | `manage_chart_of_accounts`  | `deactivateAccount`                | Modal تأكيد دون `window.confirm`         | EXECUTABLE |
| GLUI-16 | حالة افتتاح الفرع    | `view_general_ledger` + فرع | `openingStatus`                    | Query مشروطة                             | EXECUTABLE |
| GLUI-17 | افتتاح صفري          | `initialize_general_ledger` | `confirmOpening`                   | مصفوفة سطور فارغة صريحة                  | EXECUTABLE |
| GLUI-18 | افتتاح بأرصدة        | `initialize_general_ledger` | `confirmOpening`                   | سطور ديناميكية متوازنة                   | EXECUTABLE |
| GLUI-19 | Retry الافتتاح       | `initialize_general_ledger` | `confirmOpening`                   | ثبات Request ID عند الفشل                | EXECUTABLE |
| GLUI-20 | محرر القيد           | `post_manual_journals`      | `postManualJournal`                | إضافة وحذف سطور                          | EXECUTABLE |
| GLUI-21 | تحقق القيد           | `post_manual_journals`      | منع الطلب محليًا                   | طرف واحد، حساب فريد، توازن               | EXECUTABLE |
| GLUI-22 | معاينة القيد         | عرض محلي                    | لا كتابة                           | مدين ودائن وفرق بـEGP                    | EXECUTABLE |
| GLUI-23 | شرط الافتتاح         | `post_manual_journals`      | `openingStatus`                    | منع القيد قبل الافتتاح                   | EXECUTABLE |
| GLUI-24 | Retry القيد          | `post_manual_journals`      | `postManualJournal`                | Request ID ثابت ثم يتغير بالنجاح         | EXECUTABLE |
| GLUI-25 | قائمة القيود         | `view_general_ledger` + فرع | `entriesPaginated`                 | `usePaginatedQuery` وLoad more           | EXECUTABLE |
| GLUI-26 | تفاصيل القيد         | `view_general_ledger`       | `entryDetails`                     | `skip` دون هدف                           | EXECUTABLE |
| GLUI-27 | اختيار العكس         | `reverse_journal_entries`   | `reverseJournal`                   | مرحّل وغير Reversal فقط                  | EXECUTABLE |
| GLUI-28 | بيانات العكس         | `reverse_journal_entries`   | `reverseJournal`                   | سبب وتاريخ وRequest ID                   | EXECUTABLE |
| GLUI-29 | فتح فترة             | `close_accounting_periods`  | `createOrOpenPeriod`               | شهر صالح `YYYY-MM`                       | EXECUTABLE |
| GLUI-30 | إغلاق فترة           | `close_accounting_periods`  | `closePeriod`                      | Modal وسبب إلزامي                        | EXECUTABLE |
| GLUI-31 | إعادة فتح            | `reopen_accounting_periods` | `reopenPeriod`                     | مسار صلاحية مستقل                        | EXECUTABLE |
| GLUI-32 | دفتر الحساب          | `view_general_ledger` + فرع | `accountLedgerPaginated`           | Pagination حقيقية                        | EXECUTABLE |
| GLUI-33 | رصيد دفتر الحساب     | `view_general_ledger`       | `accountLedgerPaginated`           | افتتاح ورصيد جارٍ مستمر                  | EXECUTABLE |
| GLUI-34 | ميزان الفترة         | `view_general_ledger` + فرع | `trialBalance`                     | Query مشروطة بالفرع والفترة              | EXECUTABLE |
| GLUI-35 | أعمدة الميزان        | `view_general_ledger`       | `trialBalance`                     | افتتاح وحركة وختام Debit/Credit          | EXECUTABLE |
| GLUI-36 | طباعة القيد          | `print_general_ledger`      | `entryForPrint`                    | انتظار DTO ثم سند RTL                    | EXECUTABLE |
| GLUI-37 | طباعة الميزان        | `print_general_ledger`      | `trialBalanceForPrint`             | DTO وتوقيعات                             | EXECUTABLE |
| GLUI-38 | أمان الطباعة         | `print_general_ledger`      | HTML محلي                          | Escape لنصوص قاعدة البيانات              | EXECUTABLE |
| GLUI-39 | الخطأ والضغط المزدوج | كل Mutation                 | `getErrorMessage`                  | Busy guard وأخطاء Convex                 | EXECUTABLE |
| GLUI-40 | Guard أمان المصدر    | جميع المسارات               | Source guard                       | لا `as any` أو prompt أو print hook وهمي | EXECUTABLE |
