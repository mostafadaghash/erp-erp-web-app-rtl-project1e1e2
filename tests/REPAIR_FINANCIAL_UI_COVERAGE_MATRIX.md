# Repair Financial UI Coverage Matrix

| ID | إعداد الواجهة | المسار التنفيذي | النتيجة المثبتة | الحالة |
|---|---|---|---|---|
| RFU-01 | صفحة الصيانة | فتح التحصيل والاسترداد | مودالات RTL حقيقية دون `prompt` | EXECUTABLE |
| RFU-02 | صلاحيتا التحصيل والاسترداد مستقلتان | `usePermission` | كل إجراء محمي بصلاحيته | EXECUTABLE |
| RFU-03 | نموذج إنشاء أو Modal تحصيل | `collectionAccountPicker` | Query تعمل فقط عند الحاجة والصلاحية | EXECUTABLE |
| RFU-04 | Modal استرداد | `refundAccountPicker` | Query مستقلة مع `skip` حقيقي | EXECUTABLE |
| RFU-05 | Admin يختار فرع أمر الصيانة | قائمة حساب العربون | الحسابات المعروضة من الفرع المختار فقط | EXECUTABLE |
| RFU-06 | Repair من فرع محدد | حساب التحصيل والاسترداد | تصفية الحسابات بفرع المستند | EXECUTABLE |
| RFU-07 | فتح عملية مالية جديدة | تهيئة النموذج | Request ID جديد وحقول نظيفة | EXECUTABLE |
| RFU-08 | تحصيل مبلغ وحساب وتاريخ | `repairs.recordPayment` | إرسال العقد الكامل مع الملاحظات | EXECUTABLE |
| RFU-09 | استرداد مبلغ وحساب وتاريخ وسبب | `repairs.refundPayment` | إرسال العقد الكامل والسبب الإلزامي | EXECUTABLE |
| RFU-10 | Mutation تفشل ثم Retry | نفس Modal | ثبات Request ID حتى النجاح | EXECUTABLE |
| RFU-11 | ضغط مزدوج | Handler وأزرار الحفظ | Busy Guard واحد يمنع التكرار | EXECUTABLE |
| RFU-12 | مبلغ صفر أو أعلى من الحد | تحقق النموذج | رفض قبل Mutation ودقة متوافقة مع Backend | EXECUTABLE |
| RFU-13 | Repair نهائية أو ذات مبلغ محصل | شروط الأزرار | حجب التحصيل النهائي وإظهار الاسترداد حسب الصلاحية | EXECUTABLE |
| RFU-14 | خطأ Convex | Catch في المودالين | عرض الخطأ الحقيقي بلا TypeScript escapes | EXECUTABLE |
