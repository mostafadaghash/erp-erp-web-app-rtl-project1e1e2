# General Ledger Foundation — Executable Coverage Matrix

كل صف أدناه مرتبط بتعريف `test(...)` حرفي ينفذ Public API عبر Convex Test Harness. لا تُنشئ الـfixtures نتائج القيود أو السطور أو الأرصدة، باستثناء حالات التاريخ/التصادم GLF-18 والتلف المقصود GLF-40 و`postedBy` القديم GLF-38.

| ID | اسم الاختبار الحرفي | Fixtures والقيم | الدور/الفرع | Public APIs | الجداول والحقول المفحوصة | النتيجة وRollback | State |
|---|---|---|---|---|---|---|---|
| GLF-01 | `initialize settings and chart` | Harness مستقل؛ بيانات 1, 2026 | admin؛ الفرع الرئيسي | `initialize` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-02 | `identical initialization retry` | Harness مستقل؛ بيانات 1, 2026 | admin؛ الفرع الرئيسي | `initialize` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-03 | `initialization fingerprint conflict` | Harness مستقل؛ بيانات 1, 2026 | admin؛ الفرع الرئيسي | `initialize` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-04 | `template hierarchy system keys normal sides` | Harness مستقل؛ بيانات بيانات الهوية | admin؛ الفرع الرئيسي | `chart` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-05 | `normalized duplicate account code` | Harness مستقل؛ بيانات 00, 6000, 63 | admin؛ الفرع الرئيسي | `createAccount` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-06 | `invalid parent hierarchy and natural side` | Harness مستقل؛ بيانات 1110, 6000, 6301, 6302, 6303, 6304 | admin؛ الفرع الرئيسي | `createAccount` | DTO الاستجابة | رفض ذري مع فحص الحالة؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-07 | `custom account deactivation history` | Harness مستقل؛ بيانات 6000, 6301 | admin؛ الفرع الرئيسي | `createAccount` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-08 | `inactive nonposting rejection rollback` | Harness مستقل؛ بيانات 0, 1, 1110, 2026, 6000 | admin؛ الفرع الرئيسي | `postManualJournal` | journalEntries | رفض ذري مع فحص الحالة؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-09 | `balanced nonzero opening` | Harness مستقل؛ بيانات 1, 2026 | admin؛ الفرع الرئيسي | `createOrOpenPeriod` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-10 | `zero opening without journal` | Harness مستقل؛ بيانات 1, 2026 | admin؛ الفرع الرئيسي | `confirmOpening` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-11 | `duplicate opening idempotency` | Harness مستقل؛ بيانات 1, 2026 | admin؛ الفرع الرئيسي | `confirmOpening` | DTO الاستجابة | رفض ذري مع فحص الحالة؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-12 | `cutover and ISO opening date` | Harness مستقل؛ بيانات 0, 1, 2026, 9 | admin؛ الفرع الرئيسي | `confirmOpening` | DTO الاستجابة | رفض ذري مع فحص الحالة؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-13 | `balanced manual posting balances` | Harness مستقل؛ بيانات 1, 2, 2026, 250, 50 | admin؛ الفرع الرئيسي | `` | generalLedgerAccountBalances, generalLedgerPeriodBalances, journalEntries, journalLines | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-14 | `unbalanced atomic rollback` | Harness مستقل؛ بيانات 0, 1, 100, 1110, 2026, 4100, 99.99 | admin؛ الفرع الرئيسي | `postManualJournal` | auditLogs, documentCounters, generalLedgerAccountBalances, journalEntries, journalLines | رفض ذري مع فحص الحالة؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-15 | `invalid monetary values` | Harness مستقل؛ بيانات 0, 1, 1.001, 1110, 2026, 4100 | admin؛ الفرع الرئيسي | `postManualJournal` | journalEntries | رفض ذري مع فحص الحالة؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-16 | `server totals and snapshots` | Harness مستقل؛ بيانات 0, 1, 100, 1110, 150, 2026, 4100, 50 | admin؛ الفرع الرئيسي | `postManualJournal` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-17 | `first yearly JRN number` | Harness مستقل؛ بيانات 0001, 2, 2026, JRN-2026 | admin؛ الفرع الرئيسي | `` | documentCounters, journalEntries | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-18 | `historical collision concurrency year` | Harness مستقل؛ بيانات 0, 0007, 0008, 0009, 1, 2, 2026, JRN-2026 | admin؛ الفرع الرئيسي | `` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-19 | `manual idempotency` | Harness مستقل؛ بيانات 2 | admin؛ الفرع الرئيسي | `` | journalLines | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-20 | `manual fingerprint conflict` | Harness مستقل؛ بيانات 1, 100, 101 | admin؛ الفرع الرئيسي | `` | journalEntries | رفض ذري مع فحص الحالة؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-21 | `closed period posting rejection` | Harness مستقل؛ بيانات 1, 2026 | admin؛ الفرع الرئيسي | `closePeriod` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-22 | `balanced period close audit` | Harness مستقل؛ بيانات 1, 2026 | admin؛ الفرع الرئيسي | `closePeriod` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-23 | `authorized reopen with reason` | Harness مستقل؛ بيانات 1, 2026 | admin؛ الفرع الرئيسي | `closePeriod` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-24 | `actual reversal balance update` | Harness مستقل؛ بيانات 0, 1, 1110, 2026, 6200, 70 | admin؛ الفرع الرئيسي | `postManualJournal` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-25 | `reversal Retry fingerprint` | Harness مستقل؛ بيانات 1, 2, 2026, 3 | admin؛ الفرع الرئيسي | `reverseJournal` | DTO الاستجابة | رفض ذري مع فحص الحالة؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-26 | `closed original reversed later` | Harness مستقل؛ بيانات 1, 2026 | admin؛ الفرع الرئيسي | `closePeriod` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-27 | `closed reversal period rejection` | Harness مستقل؛ بيانات 1, 2026 | admin؛ الفرع الرئيسي | `closePeriod` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-28 | `posted entry immutable API` | Harness مستقل؛ بيانات بيانات الهوية | admin؛ الفرع الرئيسي | `entryDetails, entryForPrint` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-29 | `manager branch query isolation` | Harness مستقل؛ بيانات 1, 2, 2026 | admin؛ الفرع الرئيسي | `entriesPaginated` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-30 | `admin accountant two branches` | Harness مستقل؛ بيانات 1, 2, 2026 | admin؛ الفرع الرئيسي | `entriesPaginated` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-31 | `unauthorized roles no effects` | Harness مستقل؛ بيانات بيانات الهوية | admin؛ الفرع الرئيسي | `` | journalEntries | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-32 | `entry pagination no leaks` | Harness مستقل؛ بيانات 1, 2026, 4 | admin؛ الفرع الرئيسي | `entriesPaginated` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-33 | `account ledger pagination running balance` | Harness مستقل؛ بيانات 1, 10, 100, 1110, 2026, 25, 40, 5 | admin؛ الفرع الرئيسي | `accountLedgerPaginated` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-34 | `actual balanced trial balance` | Harness مستقل؛ بيانات 1, 2026 | admin؛ الفرع الرئيسي | `createOrOpenPeriod` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-35 | `natural balance directions` | Harness مستقل؛ بيانات 1, 100, 2026, 4100 | admin؛ الفرع الرئيسي | `accountLedgerPaginated` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-36 | `entry details print runtime allowlist` | Harness مستقل؛ بيانات بيانات الهوية | admin؛ الفرع الرئيسي | `entryDetails, entryForPrint` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-37 | `ledger trial DTO redaction` | Harness مستقل؛ بيانات 1, 1110, 2026 | admin؛ الفرع الرئيسي | `accountLedgerPaginated, trialBalance, trialBalanceForPrint` | journalEntries | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-38 | `creator name by user token unknown` | Harness مستقل؛ بيانات بيانات الهوية | admin؛ الفرع الرئيسي | `entryForPrint` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-39 | `operational ledgers untouched snapshot` | Harness مستقل؛ بيانات 1, 2, 2026 | admin؛ الفرع الرئيسي | `reverseJournal` | DTO الاستجابة | نجاح وفحوص قيمة فعلية؛ rollback موثق داخل الجسم | EXECUTABLE |
| GLF-40 | `complete atomic rollback after balance write failure` | Harness مستقل؛ بيانات 0, 1, 100, 1110, 2026, 4100 | admin؛ الفرع الرئيسي | `postManualJournal` | auditLogs, documentCounters, generalLedgerAccountBalances, generalLedgerPeriodBalances, journalEntries, journalLines | رفض ذري مع فحص الحالة؛ rollback موثق داخل الجسم | EXECUTABLE |
