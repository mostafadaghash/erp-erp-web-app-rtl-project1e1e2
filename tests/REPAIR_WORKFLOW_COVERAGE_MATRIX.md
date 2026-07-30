# Repair Workflow Acceptance Matrix

| ID | Fixture / role | Public API | Runtime evidence | Status |
|---|---|---|---|---|
| RWF-01 | Admin، فرع 1، فني نشط، جهاز PS5 | `repairs.create` | Snapshot للسيريال والملحقات وحالة الاستلام والفني + حركة `received` واحدة | EXECUTABLE |
| RWF-02 | Admin، فني نشط ومعطل وفرع آخر | `repairs.technicianPicker` | يعيد فني الفرع النشط فقط بــDTO محدود | EXECUTABLE |
| RWF-03 | فني معطل وفني فرع 2 | `repairs.create` | رفض الحالتين وصفر Repairs بعد Rollback | EXECUTABLE |
| RWF-04 | Repair مستلمة بلا فني | `repairs.updateDetails` | تعيين Profile موثوق وحفظ اسم الفني من الخادم | EXECUTABLE |
| RWF-05 | نصوص محاطة بمسافات | `repairs.updateDetails` | تطبيع التشخيص والحالة والملاحظات | EXECUTABLE |
| RWF-06 | Repair وصلت `ready` | `repairs.updateDetails` | رفض التعديل وثبات Snapshot | EXECUTABLE |
| RWF-07 | Repair مستلمة بلا فني | `repairs.transitionStatus` | رفض `in_progress` وبقاء سجل واحد | EXECUTABLE |
| RWF-08 | Technician داخل فرعه | `repairs.transitionStatus` | `received → in_progress` وحركة تاريخ واحدة باسم الفني | EXECUTABLE |
| RWF-09 | Repair قيد الإصلاح بلا تشخيص | `repairs.transitionStatus` | رفض `ready` وثبات المستند | EXECUTABLE |
| RWF-10 | تشخيص واختبار جودة | `repairs.transitionStatus` | حفظ Snapshot التشخيص والجودة في Repair وHistory | EXECUTABLE |
| RWF-11 | إجمالي ومتَبقٍ 10 | `repairs.transitionStatus` | رفض التسليم وثبات Repair وHistory | EXECUTABLE |
| RWF-12 | صيانة مسددة، 30 يوم ضمان | `repairs.transitionStatus` | تسليم 2026-01-13 وضمان حتى 2026-02-12 وموظف التسليم | EXECUTABLE |
| RWF-13 | ضمان -1 و1.5 و366 | `repairs.transitionStatus` | رفض القيم الثلاث قبل التسليم | EXECUTABLE |
| RWF-14 | Retry مطابق | `repairs.transitionStatus` | نفس Repair ID دون حركة تاريخ مكررة | EXECUTABLE |
| RWF-15 | requestId واحد وتاريخان | `repairs.transitionStatus` | رفض اختلاف Fingerprint | EXECUTABLE |
| RWF-16 | انتقال `received → ready` | `repairs.transitionStatus` | رفض القفز وصفر حركات إضافية | EXECUTABLE |
| RWF-17 | سبب إلغاء فارغ | `repairs.transitionStatus` | رفض السبب بعد التطبيع | EXECUTABLE |
| RWF-18 | إلغاء من `received` | `repairs.transitionStatus` | حالة نهائية وسبب محفوظ في History | EXECUTABLE |
| RWF-19 | ثلاث حركات، صفحة 1 | `repairs.historyPaginated` | Cursor خادمي وصفحتان دون تكرار | EXECUTABLE |
| RWF-20 | Manager فرع 2 / Repair فرع 1 | `historyPaginated`, `repairForPrint` | رفض القراءة والطباعة عبر الفرع | EXECUTABLE |
| RWF-21 | Viewer | `technicianPicker`, `repairForPrint` | رفض الصلاحيتين من Backend | EXECUTABLE |
| RWF-22 | Manager يطبع Repair أنشأها Admin | `repairs.repairForPrint` | اسم المنشئ وغياب المفاتيح الداخلية وCOGS | EXECUTABLE |
| RWF-23 | `createdBy` عبر token ثم مفقود | `repairs.repairForPrint` | `by_token` ثم «مستخدم غير معروف» بلا كشف المعرف | EXECUTABLE |
| RWF-24 | GL تشغيلي معطل، Labor=25 | `repairs.create` | لا Journal ولا `payments` و`operationalPostingEnabled=false` | EXECUTABLE |
