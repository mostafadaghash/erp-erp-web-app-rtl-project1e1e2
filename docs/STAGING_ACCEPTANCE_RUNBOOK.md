# دليل إعداد وقبول Staging

## 1. الفصل عن Production

- أنشئ Convex Deployment مستقلًا وقاعدة بيانات مستقلة.
- استخدم نطاقًا واضحًا يحتوي `staging` ولا تعِد استخدام نطاق الإنتاج.
- لا تنسخ JWT أو مفاتيح Auth أو كلمات مرور المستخدمين من Production.
- انسخ `.env.staging.example` إلى `.env.staging.local` على اللابتوب، ثم أدخل
  القيم الحقيقية محليًا فقط. الملف المحلي محمي بقاعدة `*.local`.
- عيّن `SITE_URL` و`CONVEX_SITE_URL` داخل إعدادات Convex Staging، وعيّن
  `VITE_CONVEX_URL` و`VITE_ALLOWED_HOSTS` عند بناء واجهة Staging.
- استخدم مشروع Cloudflare Pages/Hosting منفصلًا عن Production، واربطه بفرع Staging أو
  نطاق Staging ثابت. لا تعِد استخدام Environment Variables الخاصة بالإنتاج.
- يجب أن يشير `STAGING_CONVEX_URL` و`STAGING_CONVEX_SITE_URL` إلى نفس معرف
  Convex، وأن يساوي `VITE_CONVEX_URL` رابط Cloud نفسه عند البناء.

قبل أي Browser E2E اضبط القيم العامة التالية في GitHub Environment `staging`
كـEnvironment Variables، وليس كـworkflow inputs:

```text
STAGING_BASE_URL=https://staging.example.com
STAGING_CONVEX_URL=https://example-staging.convex.cloud
STAGING_CONVEX_SITE_URL=https://example-staging.convex.site
STAGING_TARGET_CONFIRMATION=staging.example.com|example-staging
```

قيمة التأكيد مقصودة: `<frontend-host>|<convex-deployment-id>`. وعند وجود بيئة
Production أضف `PRODUCTION_BASE_URL` و`PRODUCTION_CONVEX_URL` و
`PRODUCTION_CONVEX_SITE_URL` كـVariables أيضًا لكي يثبت الـPreflight اختلافها.

## 2. بيانات القبول

أنشئ فرعين تجريبيين نشطين، وحسابًا نشطًا لكل دور من الأدوار التالية:

1. `admin`
2. `manager`
3. `sales`
4. `customer_service`
5. `technician`
6. `accountant`
7. `shipping`
8. `viewer`

فعّل الوحدات كلها، واربط كل دور غير مركزي بفرعه التجريبي. استخدم بيانات وهمية
فقط، ولا تستخدم أسماء أو هواتف أو أرصدة عملاء حقيقيين.

احفظ الحسابات في GitHub Environment Secret باسم `E2E_ROLE_ACCOUNTS_JSON`:

```json
[
  {
    "role": "admin",
    "email": "admin@example.invalid",
    "password": "REPLACE_ME"
  },
  {
    "role": "manager",
    "email": "manager@example.invalid",
    "password": "REPLACE_ME"
  },
  {
    "role": "sales",
    "email": "sales@example.invalid",
    "password": "REPLACE_ME"
  },
  {
    "role": "customer_service",
    "email": "service@example.invalid",
    "password": "REPLACE_ME"
  },
  {
    "role": "technician",
    "email": "technician@example.invalid",
    "password": "REPLACE_ME"
  },
  {
    "role": "accountant",
    "email": "accountant@example.invalid",
    "password": "REPLACE_ME"
  },
  {
    "role": "shipping",
    "email": "shipping@example.invalid",
    "password": "REPLACE_ME"
  },
  {
    "role": "viewer",
    "email": "viewer@example.invalid",
    "password": "REPLACE_ME"
  }
]
```

لا تضع الملف أو السر في Git، ولا تطبعه داخل سجل الأوامر أو Artifacts.

### بيانات دورات الأعمال المتغيرة

دورات البيع والشراء والصيانة وCOD تنشئ مستندات حقيقية؛ لذلك لا تشغّلها إلا
على فرع Staging وهمي قابل للمسح. جهّز في فرع مدير الاختبار:

- عميلًا نشطًا، ومنتجًا نشطًا بمخزون لا يقل عن 5 وحدات.
- موردًا نشطًا.
- خزينة نشطة برصيد يكفي دفعة المورد.
- حساب `cod_clearing` نشطًا بمهلة تسوية صفر، وحساب Cash/Bank وجهة للتسوية.
- تاريخ عملية لا يسبق تواريخ القطع المالية.

احفظ الأسماء فقط في Secret باسم `E2E_BUSINESS_FIXTURES_JSON`:

```json
{
  "dataset": "disposable-staging",
  "branchName": "E2E Branch",
  "customerName": "E2E Customer",
  "productName": "E2E Product",
  "supplierName": "E2E Supplier",
  "cashAccountName": "E2E Cash",
  "codAccountName": "E2E COD",
  "settlementAccountName": "E2E Bank",
  "city": "Cairo",
  "address": "E2E Address",
  "shippingCompany": "E2E Carrier",
  "operationDate": "2026-08-07",
  "expenseAmount": 1
}
```

يجب أن يكون حسابا `manager` و`accountant` في `E2E_ROLE_ACCOUNTS_JSON` مرتبطين
بالفرع نفسه؛ ينفّذ المدير العمليات التشغيلية وينفّذ المحاسب الاسترداد والمصروف.
لا يطبع التقرير كلمات المرور أو البريد، وتُوسم المستندات الجديدة بعلامة `E2E-*`.
امسح بيانات الفرع التجريبي أو أعد Seed موثوقًا قبل إعادة الجولة، ولا تستخدم
نسخة من بيانات العملاء الحقيقية.

## 3. GitHub

1. ادفع الفرع وافتح Pull Request.
2. اجعل Check باسم `CI required gate` إلزاميًا قبل دمج `main`.
3. أنشئ GitHub Environment باسم `staging`، وأضف السر السابق إليه.
4. أضف Variables النطاقات والتأكيد المذكورة أعلاه، وSecret دورات الأعمال عند
   الحاجة، ثم فعّل Required Reviewer للبيئة.
5. شغّل `Staging acceptance` يدويًا؛ لا يقبل الـWorkflow رابطًا عابرًا من
   المشغّل، بل يستخدم القيم المثبتة داخل Environment المحمية.
6. فعّل Load Test فقط بعد نجاح Browser E2E ومراقبة لوحة Convex.
7. يجب أن ينتهي التشغيل بـ`Staging required gate = success`. هذا Gate دليل
   إصدار يدوي، وليس Required Check دائمًا على كل Pull Request لأنه Workflow يدوي.

## 4. التشغيل من اللابتوب

```bash
export STAGING_BASE_URL="https://staging.example.com"
export STAGING_CONVEX_URL="https://example-staging.convex.cloud"
export STAGING_CONVEX_SITE_URL="https://example-staging.convex.site"
export STAGING_TARGET_CONFIRMATION="staging.example.com|example-staging"
export E2E_ENVIRONMENT="staging"
export E2E_REQUIRE_ALL_ROLES="true"
export E2E_ROLE_ACCOUNTS_JSON='[...]'
npm run test:e2e-staging
```

ابدأ دائمًا بالـPreflight؛ الوضع الأول لا يتصل بالشبكة، والثاني يفحص النشر:

```bash
npm run test:staging-preflight -- --validate-config
npm run test:staging-preflight
```

يتحقق الـPreflight من Security Headers، ومن أن Bundle الواجهة المنشورة تحتوي
رابط Convex Staging المحدد فقط، ومن تطابق OpenID issuer وJWKS مع Convex Site.

بعد نجاح مصفوفة الأدوار، شغّل الدورات المتغيرة يدويًا فقط:

```bash
export E2E_MUTATIONS_CONFIRMED="isolated-staging-only"
export E2E_BUSINESS_FIXTURES_JSON='{"dataset":"disposable-staging",...}'
npm run test:e2e-business-staging -- --validate-config
npm run test:e2e-business-staging
```

يرفض السكربت أي Host يبدو Production وأي Dataset لا يحمل القيمة
`disposable-staging`. لا تنفذ هذا الأمر على Production حتى لو كان لديك Backup.

ثم، بعد نجاح المتصفح:

```bash
E2E_LOAD_CONFIRMED="isolated-staging-only" \
LOAD_CONCURRENCY=256 LOAD_REQUESTS=25000 LOAD_P95_LIMIT_MS=2000 \
npm run test:load-staging
```

### Windows CMD بعد نقل المستودع إلى اللابتوب

انسخ `.env.staging.example` إلى `.env.staging.local` مرة واحدة، ثم ضع القيم
الحقيقية داخله محليًا. لا يعمل الأمر الكامل إلا إذا كانت التأكيدات الثلاثة
التالية موجودة بالقيم الحرفية نفسها داخل الملف:

```text
STAGING_FULL_RUN_CONFIRMED=isolated-staging-only
E2E_MUTATIONS_CONFIRMED=isolated-staging-only
E2E_LOAD_CONFIRMED=isolated-staging-only
```

بعد تجهيز البيانات يصبح أمر التشغيل الكامل الوحيد:

```bat
npm.cmd run test:staging:all
```

هذا الأمر يشغّل `verify`، والـPreflight الحي، ومصفوفة المتصفح لكل الأدوار بلا
Skip، ودورات البيع والمخزون والمرتجعات والتحصيل والاسترداد والخزينة والمصروفات
والشراء والموردين والصيانة والتوصيل وCOD، ثم ضغطًا محدودًا بأقصى إعداد افتراضي
`256` اتصالًا و`25000` طلب. يتوقف فور فشل أي Gate ويحفظ تقريرًا رئيسيًا في
`test-results/staging-all/acceptance.json`.

لفحص ملف الإعداد دون اتصال أو إنشاء بيانات:

```bat
npm.cmd run test:staging:all -- --validate-config
```

داخل `.env.staging.local` تُكتب علامة `|` عاديًا بلا Escape. لا تطبع محتوى
الملف في CMD، ونفّذ الدورات المتغيرة والحمل بعد نجاح التحقق فقط.

## 5. أدلة القبول

- `test-results/staging-e2e/acceptance.json`
- `test-results/staging-preflight/acceptance.json`
- `test-results/staging-business-e2e/acceptance.json` وصورة لكل نقطة دورة.
- Screenshot لكل دور دون بيانات اعتماد.
- Screenshot لقائمة الهاتف.
- Artifact نتيجة Load Test.
- `test-results/staging-load/acceptance.json`.
- مراجعة Convex Logs وFunction Metrics أثناء الاختبار.

القبول لا يثبت Production تلقائيًا. بعد النشر النهائي أعد فحص الرؤوس والجلسات
بـSmoke Test منخفض الحمل فقط، ولا تستخدم Load Test على Production.
