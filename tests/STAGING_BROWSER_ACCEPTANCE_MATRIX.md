# Staging Browser Acceptance Matrix

| ID     | التنفيذ                    | دليل القبول                                                                    | الحالة     |
| ------ | -------------------------- | ------------------------------------------------------------------------------ | ---------- |
| STG-01 | CI                         | Dependency audit وTypeScript والاختبارات والأمان والبناء والطباعة عبر Chromium | EXECUTABLE |
| STG-02 | GitHub Staging Environment | Workflow يدوي لا يعمل على PR ولا يستعمل أسرار Production                       | EXECUTABLE |
| STG-03 | Role accounts              | ثمانية حسابات فريدة ومطلوبة عند القبول الكامل                                  | EXECUTABLE |
| STG-04 | Role navigation            | قوائم سماح ومنع مستقلة لكل دور مع فتح صفحات حقيقية                             | EXECUTABLE |
| STG-05 | Authentication             | تسجيل دخول وخروج فعلي لكل حساب دون حفظ بيانات الاعتماد                         | EXECUTABLE |
| STG-06 | Published security         | CSP وHSTS وnosniff وDENY وReferrer وPermissions ورفض wildcard CORS             | EXECUTABLE |
| STG-07 | Target safety              | HTTPS وأصل دقيق ورفض أسماء Production والمسارات وبيانات الدخول                 | EXECUTABLE |
| STG-08 | Mobile RTL                 | عرض 390×844 وفتح وإغلاق القائمة العربية                                        | EXECUTABLE |
| STG-09 | Evidence                   | JSON منقح وScreenshots وArtifacts بمدة احتفاظ محدودة                           | EXECUTABLE |
| STG-10 | Load gate                  | اختبار حمل اختياري ومحدود لا يبدأ إلا بعد نجاح Browser E2E                     | EXECUTABLE |
| STG-11 | Exact target               | تأكيد حرفي يربط Host الواجهة بمعرف Convex ويرفض أي اسم Production               | EXECUTABLE |
| STG-12 | Frontend binding           | فحص Bundle المنشورة وإثبات أنها تحتوي Convex Staging فقط                         | EXECUTABLE |
| STG-13 | Auth issuer                | مطابقة OpenID issuer وJWKS مع `STAGING_CONVEX_SITE_URL`                          | EXECUTABLE |
| STG-14 | Runtime failures           | التقاط `pageerror` و`console.error` وفشل document/XHR/fetch بصورة منقحة         | EXECUTABLE |
| STG-15 | Keyboard and focus         | فتح وإغلاق قائمة الهاتف بلوحة المفاتيح و`aria-current=page`                     | EXECUTABLE |
| STG-16 | Required gates             | Job ختامي ثابت لـCI وآخر لـStaging يرفضان أي Job مطلوب غير ناجح                 | EXECUTABLE |
