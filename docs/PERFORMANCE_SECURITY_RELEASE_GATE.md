# بوابة الأداء والأمان قبل الإنتاج

## ما يغلقه الكود

- إحصاءات الفواتير والمنتجات والتوصيلات وCOD أصبحت مجمعة حسب الفرع عبر أجيال مادية قابلة لإعادة البناء بدفعات Cursor.
- التقارير المالية والتاريخية تعتمد على حقائق يومية وشهرية ومنتجات وأرصدة حالية، لا على تنزيل مستندات التشغيل وحسابها في كل Query.
- إعادة البناء لا تستبدل الجيل النشط إلا بعد اكتمال جميع المراحل، وتمنع الكتابة أثناء بناء الجيل لتفادي أرقام جزئية.
- مراجعات الإدارة وLegacy أصبحت مفهرسة ومحدودة، وإسناد البيانات القديمة يعمل بدفعات قابلة للتكرار.
- جلسة المصادقة محددة بحد كلي 12 ساعة، وخمول 30 دقيقة، وJWT مدته 15 دقيقة، مع 5 محاولات دخول فاشلة في الساعة.
- حزمة الإنتاج خالية من ثغرات npm المعروفة وقت التنفيذ بعد ترقية `@convex-dev/auth` وتحديث شجرة الاعتماديات.
- رؤوس CSP وHSTS وnosniff وframe denial وPermissions Policy معرفة لملف Cloudflare Pages `_headers`.

## إعداد Staging/Production

1. اضبط `SITE_URL` على أصل واحد دقيق مثل `https://staging.example.com`، دون wildcard، واضبط `CONVEX_SITE_URL` على عنوان Convex Site الخاص بالبيئة.
   وعند تشغيل Vite خلف اسم مضيف داخلي اضبط `VITE_ALLOWED_HOSTS` بقائمة أسماء صريحة مفصولة بفواصل؛ لا تستخدم السماح المفتوح للمضيفين.
2. استخدم Deployment وأسرارًا مستقلة تمامًا لـStaging وProduction، ولا تنسخ مفاتيح JWT أو بيانات المستخدمين بينهما.
3. نفّذ إعادة البناء من صفحة التقارير بحساب يملك `manage_settings` بعد النشر أو ترحيل البيانات، وانتظر حالة `ready` للتقارير وإحصاءات الفواتير والمنتجات والتوصيلات. نفّذها داخل نافذة صيانة قصيرة؛ الكتابات التشغيلية تُرفض بصورة آمنة أثناء بناء الجيل، ويمكن إعادة التشغيل من البداية إذا انقطع المتصفح قبل اكتمال كل المراحل.
4. تحقق من أن Cloudflare Pages يطبق `public/_headers`. لا تعتمد على رؤوس Vite development كدليل إنتاج.
5. حافظ على CORS/redirect origins محصورة في `SITE_URL`. تطبيق SPA لا يحتاج `Access-Control-Allow-Origin: *`، وConvex Auth يرفض redirect إلى أصل آخر.

## اختبار الحمل المؤجل إلى Staging

لا يدخل الاختبار الحي في `npm run verify` حتى لا يرسل حملًا خارجيًا بالخطأ. بعد نشر Staging:

```bash
E2E_ENVIRONMENT=staging \
STAGING_BASE_URL=https://staging.example.com \
STAGING_CONVEX_URL=https://example-staging.convex.cloud \
STAGING_CONVEX_SITE_URL=https://example-staging.convex.site \
STAGING_TARGET_CONFIRMATION=staging.example.com\|example-staging \
E2E_LOAD_CONFIRMED=isolated-staging-only \
LOAD_CONCURRENCY=256 LOAD_REQUESTS=25000 LOAD_P95_LIMIT_MS=2000 \
npm run test:load-staging
```

شرط القبول الافتراضي: أخطاء لا تتجاوز 1% وP95 لا يتجاوز ثانيتين. يلزم تشغيل تدفقات Browser E2E المصادق عليها قبل الحمل وقياس Queries الحرجة من لوحة Convex على بيانات مماثلة للإنتاج. سكربت الحمل يرفض Production ولا توجد له آلية تجاوز؛ لا تشغّله على Production.

## قبول المتصفح والأدوار

بعد إنشاء الحسابات القياسية للأدوار الثمانية وتخزينها في سر GitHub Environment باسم
`E2E_ROLE_ACCOUNTS_JSON`، شغّل Workflow المسمى `Staging acceptance`. الاختبار:

- يرفض أي عنوان يبدو كبيئة Production ولا يقبل رابطًا يحوي مسارًا أو بيانات دخول.
- يفحص CSP وHSTS وCORS وبقية رؤوس الأمان من الاستجابة المنشورة نفسها.
- يسجل الدخول بحساب مستقل لكل دور، ويفحص عناصر القائمة المسموحة والمحظورة، ويفتح صفحات تشغيلية فعلية ثم يسجل الخروج.
- ينفذ قبولًا للهاتف بعرض 390 بكسل ويحفظ Screenshots وملف نتيجة منقحًا بلا بريد أو كلمات مرور.

التعليمات الكاملة في `docs/STAGING_ACCEPTANCE_RUNBOOK.md`. هذا الاختبار حي ومقصود،
ولذلك لا يدخل في `npm run verify` المحلي ولا يعمل تلقائيًا على Pull Requests.
