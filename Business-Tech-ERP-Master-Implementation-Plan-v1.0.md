# Business Tech ERP — Master Implementation Plan v1.0

**الحالة:** ACTIVE — PHASE 04 IN PROGRESS  
**تاريخ الإصدار:** 2026-09-11  
**المشروع:** Business Tech ERP — Local Server Edition / PostgreSQL Core  
**المرجع المعماري الرسمي:** `Business-Tech-ERP-Architecture-Baseline-v1.7-Final.docx`  
**المستودع:** `mostafadaghash/erp-erp-web-app-rtl-project1e1e2`  
**نقطة البداية المراجعة:** `agent/local-server-edition`  
**Frozen Source SHA:** `b6db4010953a3ecf96c8e8244c1fc5b5b8562516`  
**الفرع التكاملي المقترح:** `agent/postgres-v1.7-core`

---

## 0. الغرض من هذا الملف

هذا الملف هو **الخطة التنفيذية الرئيسية Master Implementation Plan** لتحويل النسخة الحالية من Business Tech ERP إلى نسخة V1 صالحة للتشغيل الفعلي وفق Architecture Baseline v1.7، بدايةً من تثبيت حالة الكود وإنشاء فرع تطوير جديد، مرورًا بـPostgreSQL Physical Schema وCentral Backend وترحيل الوحدات والاختبارات والتشغيل المحلي/LAN والنسخ الاحتياطي، وحتى Pilot وInstaller/Release.

هذا الملف ليس بديلًا عن Architecture Baseline v1.7. ترتيب المرجعية عند أي تعارض هو:

1. `Business-Tech-ERP-Architecture-Baseline-v1.7-Final.docx` — Source of Truth للـBusiness/Domain/Database/Transactions/Indexes.
2. هذا الملف — Source of Truth لترتيب التنفيذ، الـMilestones، الـGates، والـDefinition of Done.
3. الكود الحالي — Implementation قابل للتعديل؛ لا يغيّر الـBaseline تلقائيًا.
4. الوثائق والإصدارات الأقدم — Historical Reference فقط.

إذا ظهر أثناء التنفيذ عيب حقيقي في v1.7، يتوقف الجزء المتأثر، يتم توثيق المشكلة والـImpact، وتصدر Architecture Decision Versioned بعد مناقشتها واعتمادها. لا يتم تعديل التصميم بصمت.

---

# 1. قرارات التنفيذ الحاكمة

## 1.1 الاستراتيجية النهائية

الاستراتيجية التنفيذية المعتمدة المقترحة هي:

> **Greenfield Core + Existing Product Shell**

أي:

- لا ننشئ ERP منفصلًا من الصفر.
- لا ننشئ Repository جديدًا.
- نستخدم نفس المشروع والتاريخ الحالي.
- نحتفظ بالـFrontend الحالي، UX، Navigation، Printing، Workspace، i18n، وأي Tests/Business Knowledge صحيحة.
- نبني **Central Backend جديدًا + PostgreSQL Business Schema جديدًا** وفق v1.7.
- يتم ترحيل الوحدات تدريجيًا من Convex إلى الـBackend الجديد.
- يمنع وجود Dual Write بين Convex وPostgreSQL الجديد لنفس الـBusiness Aggregate.
- عند Cutover أي Module يصبح للـModule **Write Owner واحد فقط**.
- لا يتم لمس Convex Cloud Production أو بياناته أثناء بناء Local Server Edition.
- لا يتم Merge إلى `main` إلا بعد موافقة صريحة من المستخدم وبعد اجتياز Release Gates النهائية.

## 1.2 معمارية V1 المستهدفة

```text
Browser / Client Device
        |
        | HTTPS / LAN HTTP during controlled local development
        v
Central Backend API — Modular Monolith
        |
        | PostgreSQL protocol — server-side only
        v
Central PostgreSQL Database
```

قواعد إلزامية:

- أجهزة المستخدم لا تتصل مباشرة بـPostgreSQL.
- قاعدة بيانات مركزية واحدة لكل عميل في V1.
- لا Per-Branch Database.
- لا Branch Synchronization.
- لا Full Offline Remote Branch Mode.
- لا Microservices في V1.
- الفروع البعيدة تتصل بالـCentral Backend عبر قناة آمنة.
- Docker يمكن استخدامه على Server العميل، وليس شرطًا على أجهزة الموظفين.

## 1.3 مصادر الحقيقة

Historical Sources of Truth:

- `inventory_movements`
- `financial_movements`
- `customer_ledger_entries`
- `supplier_ledger_entries`
- `journal_entries`
- `journal_lines`

Synchronous Rebuildable Operational Projections + Lock Rows:

- `inventory_stock_positions`
- `batch_stock_positions`
- `variant_warehouse_cost_projection`
- `treasury_balance_positions`
- projections المحددة للتقارير

ممنوع جعل قيمة Mutable Balance مثل `product.stock` أو `treasury.balance` هي Source of Truth.

## 1.4 سياسة المعاملات والتزامن

القاعدة الافتراضية:

- `READ COMMITTED`
- Explicit `SELECT ... FOR UPDATE`
- Idempotency
- Unique Constraints
- Fixed Lock Ordering
- Optimistic Versioning للـeditable aggregate state حيث يلزم
- Retry محدود فقط لأخطاء Deadlock/Serialization
- `FOR UPDATE SKIP LOCKED` للـOutbox workers

Global Lock Order:

```text
Business Document
→ Dependent Rows / Reservations / Allocations
→ Inventory Stock Positions
→ Batch Positions
→ Serials
→ Financial / Treasury Rows
→ Sequence Row
```

داخل كل مجموعة يتم ترتيب المفاتيح ترتيبًا ثابتًا قبل القفل.

## 1.5 سياسة التاريخ والتصحيح

- `posted_at` يحدد ترتيب الأثر الحقيقي للمخزون/التكلفة/القيود.
- `document_date` تاريخ تجاري ولا يعيد كتابة التاريخ المحاسبي أو Costing.
- Historical Ledgers لا يتم `UPDATE` أو `DELETE` منها لتصحيح Posting.
- التصحيح بعد Posting يتم عبر `Reversal / Correction / Repost`.
- تعديل المستند بعد Posting يحتفظ بنفس `document_number` ويرفع `document_version`.
- الحذف التشغيلي بعد Posting يسبقه Full Reversal ثم Tombstone/Audit.
- أرقام المستندات لا يعاد استخدامها.

## 1.6 سياسة الـIndexes

Index Catalog في v1.7 مغلق وملزم.

- لا Index إضافي على Primary Key.
- لا نفترض أن Foreign Keys مفهرسة تلقائيًا.
- لا نضيف Index لكل FK بشكل تلقائي؛ فقط حيث يبرره Catalog/Query Pattern.
- ممنوع Redundant Prefix Indexes.
- Partial Indexes للـHot Rows المعتمدة.
- `pg_trgm + GIN` للبحث الجزئي بالاسم المحدد في الـBaseline.
- `normalized_phone` للبحث بالهاتف.
- لا Partitioning في V1.
- أي Index خارج §28 يتطلب `EXPLAIN (ANALYZE, BUFFERS)` وقياسًا موثقًا.

---

# 2. الحالة الحالية المثبتة قبل التنفيذ

## 2.1 نقطة Git الحالية

- Repository: `mostafadaghash/erp-erp-web-app-rtl-project1e1e2`
- Current development baseline branch: `agent/local-server-edition`
- Frozen SHA used by Gap Analysis: `b6db4010953a3ecf96c8e8244c1fc5b5b8562516`
- لا يتم اعتبار أي Commit لاحق جزءًا من نقطة البداية إلا بعد مقارنة واعتماد صريح.

## 2.2 الحالة التقنية الحالية

الكود الحالي يحتوي على:

- React + TypeScript + Vite Frontend.
- Convex backend ومجلد `convex/`.
- Convex Auth dependency.
- Local Server scripts.
- PostgreSQL 17 داخل Docker.
- Convex Self-Hosted Backend فوق PostgreSQL.
- Local bootstrap/configuration/status/acceptance/full-suite scripts.
- Existing release/security/build/testing scripts.
- Existing migration/backup/restore tooling يحتاج مراجعة وإعادة توجيه للـPostgreSQL final schema.

الحالة الحالية **ليست** المعمارية النهائية لأن PostgreSQL يعمل حاليًا Persistence لـConvex، وليس Business Schema v1.7 المملوك للتطبيق.

## 2.3 الفجوات الحرجة المثبتة

1. Convex Self-Hosted هو الـbackend الفعلي الحالي؛ يجب استبداله في Local Edition.
2. المخزون الحالي يعدل mutable product stock/cost/value؛ يجب استبداله بالـInventory Ledger + Projections.
3. Sales Order الحالي يخلط confirmation مع invoice/stock posting؛ يجب فصله إلى Reservation ثم Delivery Posting.
4. Roles/Permissions/Branch Scope الحالية لا تطابق model v1.7 كاملًا.
5. Document numbering الحالي prefix/year based ويجب استبداله بأرقام رقمية مستقلة لكل Branch+DocumentType.
6. PostgreSQL Physical Schema/FKs/constraints/triggers final غير موجودة بعد.
7. Transactional Outbox final غير موجود.
8. Posting Batch unified traceability غير مطبق بالصورة النهائية.
9. Customer/Supplier identity موحدة Counterparty غير مطبقة.
10. Product Variant/Unit/Barcode/Price List architecture النهائية غير مطبقة.
11. Inventory Reservations/Batch Lock Rows/Stocktake/Adjustment final غير مطبقة.
12. Accounting final journal invariants/reversal model غير مكتمل حسب v1.7.

---

# 3. Branching / Git / Change-Control Strategy

## 3.1 إنشاء الفرع التكاملي

يتم إنشاء:

```text
agent/postgres-v1.7-core
```

من الـFrozen SHA:

```text
b6db4010953a3ecf96c8e8244c1fc5b5b8562516
```

الهدف: فرع تكاملي طويل العمر للـLocal/PostgreSQL V1 فقط.

## 3.2 Phase Branches

كل Milestone كبيرة تعمل على Branch قصيرة العمر مشتقة من الفرع التكاملي، مثل:

```text
agent/v17-p01-foundation
agent/v17-p02-backend-scaffold
agent/v17-p03-postgres-schema
agent/v17-p04-security
agent/v17-p05-master-data
agent/v17-p06-inventory
agent/v17-p07-finance-accounting
agent/v17-p08-purchasing
agent/v17-p09-sales
agent/v17-p10-repairs-followup
agent/v17-p11-reporting-printing
agent/v17-p12-frontend-cutover
agent/v17-p13-data-migration
agent/v17-p14-deployment-operations
agent/v17-p15-system-validation
agent/v17-p16-pilot-release
```

## 3.3 Merge Policy

- Phase branch → PR → `agent/postgres-v1.7-core`.
- لا merge إذا لم ينجح Gate المرحلة على نفس SHA.
- `agent/postgres-v1.7-core` → `main` فقط بعد Pilot/Release Gate وموافقة صريحة من المستخدم.
- لا Force Push إلا لضرورة واضحة وبعد موافقة.
- كل تغيير مدمّر في schema/data يحتاج شرح rollback path قبل التنفيذ.

## 3.4 Commit Policy

كل Commit يجب أن يكون قابلًا للفهم والرجوع:

```text
chore(v17): establish backend project scaffold
feat(db): add organization and security schema
feat(inventory): add stock reservation transaction
fix(accounting): prevent unbalanced deferred journal commit
test(concurrency): cover parallel reservation overbooking
```

لا نجمع تغييرات ضخمة غير مرتبطة في Commit واحدة.

---

# 4. Target Project Tree

يتم الوصول تدريجيًا إلى البنية التالية بدون نقل عشوائي للملفات القديمة في البداية:

```text
MY-ERP/
|
├── src/                              # React/Vite frontend الحالي
|   ├── api/                          # New backend API client/adapters
|   ├── components/
|   ├── features/
|   ├── i18n/
|   ├── workspace/
|   └── ...
|
├── server/                           # Central Backend الجديد
|   ├── api/
|   |   ├── routes/
|   |   ├── schemas/
|   |   └── middleware/
|   ├── application/
|   |   ├── commands/
|   |   ├── queries/
|   |   └── contracts/
|   ├── modules/
|   |   ├── organization/
|   |   ├── security/
|   |   ├── counterparties/
|   |   ├── catalog/
|   |   ├── inventory/
|   |   ├── finance/
|   |   ├── accounting/
|   |   ├── purchasing/
|   |   ├── sales/
|   |   ├── repairs/
|   |   ├── followup/
|   |   ├── notifications/
|   |   └── reporting/
|   ├── infrastructure/
|   |   ├── database/
|   |   ├── auth/
|   |   ├── outbox/
|   |   ├── logging/
|   |   └── config/
|   └── main.ts
|
├── database/
|   ├── migrations/
|   ├── schema/
|   ├── functions/
|   ├── triggers/
|   ├── views/
|   ├── seeds/
|   ├── fixtures/
|   └── verification/
|
├── tests/
|   ├── unit/
|   ├── integration/
|   ├── database/
|   ├── security/
|   ├── concurrency/
|   ├── accounting/
|   ├── inventory/
|   ├── migration/
|   ├── backup-restore/
|   ├── lan/
|   └── e2e/
|
├── docs/
|   ├── architecture/
|   ├── decisions/
|   ├── implementation/
|   |   └── MASTER-IMPLEMENTATION-PLAN.md
|   ├── operations/
|   └── release/
|
├── infra/
|   ├── local/
|   ├── postgres/
|   ├── reverse-proxy/
|   ├── backup/
|   └── release/
|
├── scripts/
|   ├── local/
|   ├── database/
|   ├── migration/
|   ├── backup/
|   ├── release/
|   └── verification/
|
├── convex/                           # Legacy أثناء فترة الانتقال فقط
├── package.json
└── ...
```

قواعد الانتقال:

- لا ننقل `convex/` إلى مجلد Legacy جديد لمجرد التنظيم؛ يبقى كما هو حتى انتهاء Cutover حتى لا نكسر النسخة المرجعية.
- لا يحذف Convex dependency إلا بعد تأكيد عدم وجود frontend/backend caller يعتمد عليه.
- لا Dual Write لنفس الـModule.
- Git history هو الأرشيف؛ لا ننسخ الكود القديم داخل repo مرتين.

---

# 5. Status Model للخطة

كل Phase وكل Subphase تحمل حالة واحدة:

- `NOT_STARTED`
- `IN_PROGRESS`
- `VERIFYING`
- `BLOCKED`
- `CLOSED`

أي Phase لا تصبح `CLOSED` إلا إذا نجح Gate بالكامل على نفس Commit SHA.

عند إغلاق كل مرحلة يتم تحديث هذا الملف بـ:

- Status
- Start SHA
- Final SHA
- PR number
- Tests executed
- Test result
- Known limitations المقبولة إن وجدت
- Migration/rollback notes
- Next execution pointer

---

# 6. PHASE 00 — Governance, Freeze & Execution Baseline

**Status:** `CLOSED`  
**الهدف:** منع الانحراف قبل أي كود جديد.

## 00.01 تثبيت المراجع

- تثبيت v1.7 كـSource of Truth.
- حفظ الملف التنفيذي الرسمي داخل المستودع باسم واحد ثابت: `Business-Tech-ERP-Master-Implementation-Plan-v1.0.md`، ويتم تحديث **نفس الملف** بعد كل مرحلة؛ Git history هو أرشيف النسخ السابقة ولا تُنشأ snapshots مرحلية داخل السورس.
- توثيق Frozen SHA للكود الحالي.
- توثيق أن Production Convex ممنوع لمسه أثناء Local Edition.

## 00.02 تثبيت Scope V1

داخل V1:

- Central Backend.
- Central PostgreSQL.
- Branches عبر LAN/secure remote connection.
- Organization/Security.
- Counterparties.
- Products/Variants/Units/Pricing.
- Inventory/Reservations/Transfer/Stocktake/Adjustment/Serial/Batch/Expiry.
- Sales Quotes/Orders/Deliveries/Invoices/Returns/Advances.
- Purchase Invoices/Returns.
- Treasuries/Receipts/Disbursements/Transfers/Cheques/Installments.
- Accounting posting engine.
- Repairs/Follow-Up/Notifications.
- Reports/Printing/Export.
- Workspace local state.
- Backup/Restore/Restart/LAN/Pilot/Release.

خارج V1:

- Purchase Orders.
- Multi-Company runtime behavior رغم إبقاء Company Entity قابلة للتوسع.
- Per-Branch databases.
- Branch sync/conflict resolution.
- Full Offline Remote Branch Mode.
- Microservices.
- Advanced bank reconciliation.

## 00.03 اعتماد استراتيجية Greenfield Core

يتم توثيق أن:

- Frontend shell = reuse.
- Convex Business Core = replace تدريجيًا.
- PostgreSQL Business Schema = new clean implementation.
- Backend = new modular monolith.

### Gate 00

- [x] v1.7 موجود بالمشروع.
- [x] Master Plan موجود بالمشروع.
- [x] Frozen SHA موثق.
- [x] Scope V1 موثق.
- [x] المستخدم اعتمد استراتيجية التنفيذ.

**Exit:** `CLOSED` قبل إنشاء كود Core جديد.

---

# 7. PHASE 01 — New Branch & Current-State Capture

**Status:** `CLOSED`

## 01.01 إنشاء الفرع

إنشاء `agent/postgres-v1.7-core` من Frozen SHA وليس من `main` إذا كان `main` متقدمًا/مختلفًا.

## 01.02 التأكد من نظافة نقطة البداية

- `git status`
- branch head verification
- current commit verification
- عدم وجود local untracked critical files ضمن الخطة
- التأكد من `.gitignore` للـsecrets/runtime data

## 01.03 تشغيل Baseline Tests الحالية

يتم تسجيل الواقع وليس افتراض النجاح:

- TypeScript الحالي.
- Unit tests الحالية.
- Security check.
- Production build.
- Local acceptance إن كانت البيئة متاحة.

الهدف هنا ليس اعتماد Legacy behavior، بل معرفة baseline regression state قبل التغيير.

## 01.04 Inventory للكود القابل لإعادة الاستخدام

تصنيف directories/modules إلى:

- REUSE
- REFACTOR
- REWRITE CLEANLY
- RETIRE

مع خريطة واضحة للـFrontend callers الخاصة بـConvex.

## 01.05 Freeze Report

إنشاء تقرير:

`docs/implementation/CURRENT-STATE-FREEZE.md`

يحتوي:

- branch/SHA
- test status
- dependency snapshot
- directory map
- Convex touchpoints
- local infrastructure snapshot
- known gaps

### Gate 01

- [x] branch created correctly.
- [x] working tree clean.
- [x] current test baseline recorded.
- [x] current-state report committed.
- [x] no Production changes.

### Phase 01 Closure Record

- **Status:** `CLOSED`
- **Start SHA:** `b6db4010953a3ecf96c8e8244c1fc5b5b8562516`
- **Final SHA:** `b0d35101bf622264b655bcc574787989fadbcd83`
- **Validation PR:** `#183` — Draft validation PR against `agent/local-server-edition`; not merged.
- **Final CI Run:** `34607717788`
- **Tests/Gates:** Dependency audit, TypeScript typecheck, Orders pagination guard, Full tests, Security check, Production build, Release candidate preflight, Browser contract / Playwright discovery, Release gate.
- **Result:** all mandatory Phase 01 CI gates passed on the same final SHA.
- **Security correction during verification:** `js-yaml` advisory `GHSA-2883-xcg3-v3hh` fixed by resolving the existing transitive dependency from `4.3.1` to patched `4.3.2` in `package-lock.json`; no broad dependency upgrade, audit suppression, or `--force`.
- **Known limitations:** current runtime remains Convex-backed; PostgreSQL is still Convex persistence and no v1.7 Business Schema exists yet. This is expected at Phase 01 closure.
- **Migration/Rollback:** no business migration, DDL, production mutation, or module cutover was performed. Rollback is the frozen source SHA/branch state.
- **Production safety:** `main` and Convex Cloud Production were not modified.
- **Next execution pointer:** `PHASE 02 — Toolchain & Backend Scaffold`.

---

# 8. PHASE 02 — Toolchain & Backend Scaffold

**Status:** `CLOSED`

**الهدف:** إنشاء هيكل Backend الجديد بدون Business Migration بعد.

## 02.01 Runtime Decision

**Status:** `CLOSED`

الاختيار المقترح للـLocal Backend:

- Node.js LTS مثبت ومقفل للمشروع عند بدء التنفيذ.
- TypeScript strict.
- Fastify HTTP server.
- PostgreSQL official `pg` driver مع SQL واضح للمعاملات الحساسة.
- Runtime request validation بطبقة schema validation موحدة.
- Structured logging.

هذا اختيار تنفيذ وليس تغيير Domain Architecture. إذا تم اعتماد Stack مختلف يجب توثيقه ADR قبل كتابة Business Modules.

### 02.01 Execution Record — 2026-09-11

- **Decision ADR:** `docs/decisions/ADR-0001-central-backend-runtime.md`
- **Runtime:** Node.js `24.21.0` LTS (Krypton), npm `11.19.0`, ESM.
- **Runtime pins:** `.nvmrc` and `.node-version` both `24.21.0`; CI consumes `.nvmrc` and asserts Node/npm versions.
- **TypeScript:** keep the repository-resolved `5.7.3` for Phase 02; backend `strict: true` is mandatory.
- **HTTP:** Fastify `5.12.3`.
- **PostgreSQL driver:** `pg 8.23.0`; explicit SQL for sensitive transactions; no ORM/query builder adopted for the transactional core.
- **Validation:** Fastify JSON Schema/Ajv for HTTP contracts; `@fastify/env 7.0.0` for startup environment validation.
- **Logging:** Pino `10.3.1` structured JSON with secret redaction.
- **Development runner:** `tsx 4.23.13`; production backend will use compiled TypeScript output.
- **Transaction baseline preserved:** `READ COMMITTED + SELECT ... FOR UPDATE`, deterministic lock order, same `pg` client per transaction, bounded retry only for PostgreSQL `40P01`/`40001`, maximum 3 attempts, no retry for business validation.
- **Commit:** `06a44fc987fe78f833387c5335e8970667618a42`
- **Draft PR:** `#184` — Phase 02 validation PR; not merged.
- **CI Run:** `34609535406`
- **CI Result:** SUCCESS — runtime version guard, dependency audit, TypeScript, Orders pagination guard, Full tests, Security check, Production build, Release candidate preflight, Browser contract, and Release gate all passed on the same commit.
- **Scope safety:** no `server/` skeleton yet, no Business PostgreSQL DDL, no module cutover, no `main` merge, and no Convex Production change.

**Next subphase:** `02.02 Backend Skeleton`.

## 02.02 Backend Skeleton

**Status:** `CLOSED`

إنشاء:

- server startup/shutdown.
- configuration loader.
- environment validation.
- health endpoint.
- readiness endpoint.
- PostgreSQL connection pool.
- graceful shutdown.
- request correlation ID.
- structured error contract.

### 02.02 Execution Record — 2026-09-11

- **Implementation:** Central Backend Fastify bootstrap, startup config/environment validation, PostgreSQL pool, `/health`, `/ready`, server-generated request IDs, structured Pino logging with secret redaction, minimal structured error envelope, graceful `SIGTERM`/`SIGINT` shutdown, dedicated strict backend TypeScript configuration, and backend typecheck/test/build scripts.
- **Validation workflow:** `.github/workflows/phase02-backend-skeleton-validation.yml` using PostgreSQL 17.
- **Final verification SHA:** `8c0e35e85ba85bf70beebf048a7344ccd6006a73`.
- **Backend Validation Run:** `34612963777` — SUCCESS. Dependency audit, backend typecheck, backend unit tests, backend build, real PostgreSQL 17 `/health` + `/ready`, and graceful shutdown smoke all passed.
- **Legacy CI Run:** `34612967612` — SUCCESS. Dependency audit, TypeScript, Orders pagination guard, Full tests, printing evidence, Security check, Production build, Release candidate preflight, Browser contract, and Release gate all passed on the same SHA.
- **Scope safety:** no Business PostgreSQL DDL/tables, no business module implementation, no frontend cutover, no dual write, no `main` merge, and no Convex Production change.
- **Draft PR:** `#184` remains open/draft and unmerged.

**Next subphase:** `02.03 API Error Contract`.

## 02.03 API Error Contract

**Status:** `CLOSED`

كل Error business قابل للترجمة يرجع:

```text
errorCode
errorParams
requestId
```

ولا تعتمد الواجهة على Arabic exception strings كـAPI contract.

### 02.03 Execution Record — 2026-09-11

- **Implementation:** added a typed `ApiError` primitive and shared `ErrorEnvelope` contract. Stable codes are enforced as `UPPER_SNAKE_CASE`; exposed `errorParams` are restricted to explicitly safe primitive values; `requestId` remains server-generated.
- **Unified handling:** expected 4xx API errors, Fastify request-validation failures, unknown routes, and unhandled internal failures all return the same `errorCode` + `errorParams` + `requestId` shape.
- **Leak prevention:** validator text, internal exception messages, stack traces, route text, table/internal details, and client-supplied request IDs are not exposed as the API contract. Unknown 5xx failures are logged internally and returned as `INTERNAL_ERROR` with empty params.
- **Commit:** `d3a437384cc6d48d9efedfd8c33d4e6c483bcfbe`.
- **Backend Validation Run:** `34614053669` — SUCCESS. Dependency audit, backend typecheck, backend unit tests, backend build, real PostgreSQL 17 health/readiness, and graceful shutdown smoke passed.
- **Legacy CI Run:** `34614057267` — SUCCESS. Dependency audit, TypeScript, Orders pagination guard, Full tests, printing evidence, Security check, Production build, Release candidate preflight, Browser contract, and Release gate passed on the same SHA.
- **Scope safety:** no Business PostgreSQL DDL/tables, no transaction-helper implementation, no business module cutover, no dual write, no `main` merge, and no Convex Production change.
- **Draft PR:** `#184` remains open/draft and unmerged.

**Next subphase:** `02.04 Database Transaction Helper`.

## 02.04 Database Transaction Helper

**Status:** `CLOSED`

إنشاء abstraction واضح يدعم:

- BEGIN/COMMIT/ROLLBACK.
- isolation default READ COMMITTED.
- transaction-local user/request context عند الحاجة.
- bounded retry wrapper لأكواد PostgreSQL الخاصة بـdeadlock/serialization فقط.
- no retry للـbusiness validation.

**Implementation / Verification Record:**

- Central `withTransaction()` uses one leased PostgreSQL client for the complete unit of work.
- Explicit `BEGIN ISOLATION LEVEL READ COMMITTED` + `COMMIT` / `ROLLBACK`.
- Transaction-local `app.request_id` / `app.user_id` use `set_config(..., true)` and do not persist as session context.
- Automatic retry is restricted to SQLSTATE `40P01` and `40001`.
- Retry is bounded to a maximum of 3 attempts.
- Business/validation/constraint failures are not automatically retried.
- Rollback failure destroys the leased client and disables retry.
- Unit coverage verifies commit, rollback, bounded retry, non-retryable errors, and client release behavior.
- PostgreSQL 17 integration coverage verifies `READ COMMITTED`, transaction-local context, and real rollback behavior.
- **Final verified SHA:** `58602ed304a42e32a641908ef0197f85a8d2bde8`
- **Backend Validation:** run `34617893603` — SUCCESS.
- **Legacy CI:** run `34617898529` — SUCCESS on the same SHA after one Verify rerun. The first attempt stopped in the existing printing acceptance pretest with Node exit 13 (`unsettled top-level await`); the immediate same-SHA rerun passed without a code change.

## 02.05 CI تحديث أولي

**Status:** `CLOSED`

إضافة gates للـnew backend:

- backend typecheck.
- backend unit tests.
- build.
- secret scanning/security check.

الـlegacy tests تبقى منفصلة حتى Migration.

**Implementation / Verification Record:**

- `backend-verify` أصبح Job رسميًا داخل `.github/workflows/ci.yml` مع PostgreSQL 17 service.
- الـBackend Gate الرسمي يشمل dependency audit، secret/security scan، backend typecheck، backend unit tests، transaction helper tests، PostgreSQL integration، backend build، health/readiness، وgraceful shutdown.
- `release-gate` أصبح يتطلب نجاح `verify` + `backend-verify` + `browser-contract`.
- تم إلغاء Workflow التحقق المؤقت الخاص بـPhase 02 بعد نقل الـGates إلى الـPrimary CI.
- Legacy verification ما زال Job مستقلًا حتى مرحلة Migration كما تنص الخطة.
- لم يتم إنشاء Business PostgreSQL DDL أو Business Tables خلال Phase 02.
- **Final verified SHA:** `922e880ab30b1a51bde14692063b321599d15948`
- **Primary CI run:** `34620154166` — SUCCESS على نفس الـSHA:
  - `verify` — SUCCESS.
  - `backend-verify` — SUCCESS.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR:** `#184` — CLOSED WITHOUT MERGE.
- `main` وConvex Production لم يتم تعديلهما.

### Gate 02

- [x] server boots.
- [x] health/readiness pass.
- [x] DB connectivity test pass.
- [x] rollback test pass.
- [x] graceful shutdown pass.
- [x] CI includes new backend.
- [x] no business tables yet except migration metadata if selected.

### Phase 02 Closure Record

- **Status:** `CLOSED`
- **Final SHA:** `922e880ab30b1a51bde14692063b321599d15948`
- **CI:** run `34620154166` — all required jobs SUCCESS on the same final SHA.
- **PR:** `#184` — closed without merge.
- **Safety:** no Business DDL, no module cutover, no dual write, no Convex Production change, and no `main` merge.
- **Next execution pointer:** `PHASE 03 — PostgreSQL Physical Schema & DDL/Migrations / 03.01 Physical Naming Convention`.

---

# 9. PHASE 03 — PostgreSQL Physical Schema & DDL/Migrations

**Status:** `CLOSED`

**الهدف:** تحويل §25-§28 من v1.7 إلى Physical PostgreSQL Schema نهائية قابلة للتنفيذ.

## 03.01 Physical Naming Convention

**Status:** `CLOSED`

- snake_case physical names.
- UUID internal PKs.
- technical constraint names deterministic.
- physical table names تتبع canonical catalog names في §28 حيث توجد تسمية نهائية.
- عدم إنشاء duplicate aliases لنفس Domain Entity.

**Implementation / Verification Record:**

- تم اعتماد `ADR-0002 — PostgreSQL Physical Naming Convention`.
- كل project-owned PostgreSQL identifiers تستخدم lowercase unquoted `snake_case`.
- canonical physical relation names تتبع Architecture Baseline v1.7، مع أولوية الأسماء النهائية في §28 عند وجودها، ومنع duplicate aliases لنفس Domain Entity.
- internal entity identity يستخدم UUID عندما يعرّف الـcanonical model surrogate entity key، مع الحفاظ على architecture-defined profile/projection/lock-row key grains بدون إضافة surrogate IDs غير معتمدة.
- تم تثبيت deterministic naming patterns للـPK/UQ/FK/CHECK/exclusion/constraint-trigger، وسياسة deterministic للأسماء الطويلة بدون الاعتماد على silent PostgreSQL truncation.
- لم يتم إنشاء Business SQL، Business Tables، PostgreSQL Extensions، Data Types، أو Migration Structure في 03.01.
- المقارنة مع Phase 02 final SHA تُظهر أن صافي تغيير 03.01 هو ملف `docs/decisions/ADR-0002-postgresql-physical-naming.md` فقط؛ أي temporary artifact تم تنظيفه وغير موجود في الـfinal tree.
- **Final verified SHA:** `a58dd96af9ef5d792f0c15501fbf196fc903aeb1`
- **Primary CI run:** `34621383494` — SUCCESS على نفس الـSHA:
  - `verify` — SUCCESS.
  - `backend-verify` — SUCCESS.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR:** `#185` — CLOSED WITHOUT MERGE.
- `main` وConvex Production لم يتم تعديلهما.

## 03.02 PostgreSQL Extensions

**Status:** `CLOSED`

- `pg_trgm` فقط كـSearch extension المعتمد حاليًا.
- لا Elasticsearch/OpenSearch.

**Implementation / Verification Record:**

- تم اعتماد `ADR-0003 — PostgreSQL Extensions Baseline`.
- `pg_trgm` هي الـPostgreSQL extension الوحيدة المعتمدة حاليًا في V1.
- استخدام `pg_trgm` يظل مقيدًا بالـSearch patterns والـGIN indexes المعتمدة أصلًا في Index Catalog v1.7؛ لم يتم إضافة أي Index جديد أو توسيع الـCatalog.
- لا Elasticsearch/OpenSearch أو External Search Service في V1.
- تمت إضافة PostgreSQL 17 integration test يثبت:
  - availability لـ`pg_trgm`.
  - نجاح `CREATE EXTENSION IF NOT EXISTS pg_trgm`.
  - idempotent enablement عند تنفيذ الأمر مرتين.
  - وجود installed extension row واحدة فقط.
  - عمل trigram capability فعليًا.
  - cleanup بعد الاختبار حتى لا يترك Hidden State لباقي الاختبارات.
- تم دمج الاختبار داخل الـPrimary CI تحت `backend-verify`.
- Permanent enablement داخل قواعد العملاء سيُنفذ لاحقًا داخل forward-only migration وفق `03.04 Migration Structure`، وليس كـad-hoc DDL في 03.02.
- لم يتم تنفيذ Data Types أو Migration Structure أو Business Tables/Indexes/Views/Constraints في هذه الخطوة.
- **Final verified SHA:** `3a97e0f980de252eae34986ccd05c6b352f52558`
- **Primary CI run:** `34632905291` — SUCCESS على نفس الـSHA:
  - `verify` — SUCCESS.
  - `backend-verify` — SUCCESS، ويتضمن `PostgreSQL extension integration tests`.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR:** `#186` — CLOSED WITHOUT MERGE.
- `main` وConvex Production لم يتم تعديلهما.

## 03.03 Data Types

**Status:** `CLOSED`

- Money: `numeric(18,4)`.
- Quantity: `numeric(18,6)`.
- Time: `timestamptz` UTC.
- No float for money/inventory.
- JSON فقط للإعدادات/payloads المحددة، وليس Business Entities أو balances.

**Implementation / Verification Record:**

- تم اعتماد `ADR-0004 — PostgreSQL Data Types Baseline`.
- الأموال تستخدم PostgreSQL `numeric(18,4)`.
- الكميات تستخدم PostgreSQL `numeric(18,6)`.
- الـBusiness timestamps التي تمثل لحظة زمنية تستخدم `timestamptz` مع UTC كمرجع زمني canonical، والعرض حسب Timezone الشركة/المستخدم.
- `real` / `double precision` / floating-point ممنوعة للقيم المالية والمخزنية المؤثرة، بما فيها money/price/cost/tax/balance/quantity/reservation values.
- JSON يظل محصورًا في الاستخدامات التي يسمح بها Architecture Baseline مثل configuration/audit/event payloads/notification parameters/template configuration، ولا يستخدم لتخزين Business Entities أو balances/ledger truth.
- الـArchitecture والـMaster Plan لا يحددان صراحة `json` مقابل `jsonb`؛ تم تسجيل `jsonb` في ADR-0004 كـImplementation Decision للحقول المسموح بها فقط، بدون أي Index إضافي تلقائي وبدون توسيع Index Catalog v1.7.
- تمت إضافة PostgreSQL 17 integration test باستخدام TEMP relation فقط ليتحقق من:
  - `numeric(18,4)` precision/scale.
  - `numeric(18,6)` precision/scale.
  - exact decimal round-trip/arithmetic عند الـdeclared scales.
  - `timestamptz` timezone-offset equivalence لنفس اللحظة.
  - `jsonb` كتمثيل PostgreSQL للـJSON use cases المسموح بها.
  - إزالة الـTEMP relation بعد الاختبار وعدم ترك Persistent Business DDL.
- تم دمج الاختبار داخل الـPrimary CI تحت `backend-verify`.
- لم يتم تنفيذ Migration Structure أو Permanent Business Tables/Columns/Indexes/Views/Constraints في هذه الخطوة.
- **Final verified SHA:** `56b5c4aa01d42175149b1c66b7351881e85b0aec`
- **Primary CI run:** `34634609255` — SUCCESS على نفس الـSHA:
  - `verify` — SUCCESS.
  - `backend-verify` — SUCCESS، ويتضمن `PostgreSQL data type integration tests`.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR:** `#187` — CLOSED WITHOUT MERGE.
- `main` وConvex Production لم يتم تعديلهما.

## 03.04 Migration Structure

**Status:** `CLOSED`

المهاجرات تكون forward-only versioned files، وكل migration لها:

- preconditions.
- transactional behavior حيث PostgreSQL يسمح.
- verification query.
- rollback/recovery strategy documented.

**Implementation / Verification Record:**

- تم اعتماد `ADR-0005 — PostgreSQL Migration Structure`.
- تم إنشاء مسار مستقل لـSchema Evolution تحت `database/migrations/`، مع الإبقاء على `scripts/migration/*` كأدوات Legacy/Business Data Migration لمرحلة 15 وعدم خلط المسارين.
- كل migration تتكون من زوج versioned:
  - `<version>_<name>.meta.json`
  - `<version>_<name>.sql`
- الـmetadata تلزم `version`, `name`, `transactional`, `preconditionSql`, `verificationSql`, `recovery`.
- تم إنشاء runner مركزي في `scripts/database/migrations.mjs` يدعم:
  - forward-only apply.
  - verify-only بدون تطبيق pending migrations.
  - PostgreSQL advisory lock لمنع تشغيل migrators بالتوازي.
  - SHA-256 checksum لاكتشاف تعديل Migration مطبقة.
  - رفض applied migration غير الموجودة في repository.
  - رفض name/checksum drift.
  - منع out-of-order pending migration تحت أعلى Version مطبق.
- الـtechnical table الوحيدة التي تم إنشاؤها ضمن 03.04 هي `schema_migrations` لحفظ version/name/checksum/applied_at، وليست Business Table.
- `transactional: true` ينفذ precondition + SQL + verification + migration history داخل Transaction واحدة؛ أي فشل يعمل rollback ولا يسجل نجاحًا وهميًا.
- `transactional: false` مدعوم فقط للعمليات التي لا يسمح PostgreSQL بوضعها داخل transaction، مع Recovery Strategy صريحة وبدون ادعاء rollback غير حقيقي.
- تمت إضافة `0001_postgresql_extensions` كتفعيل دائم ومدار بالـmigration للـ`pg_trgm` المعتمد، تنفيذًا للقرار المؤجل من 03.02.
- تمت إضافة PostgreSQL 17 integration coverage للتحقق من:
  - fresh apply.
  - idempotent rerun.
  - verify-only.
  - checksum drift rejection.
  - transactional DDL rollback الحقيقي.
  - عدم تسجيل migration فاشلة كنجاح.
- تم دمج Migration Framework Integration Tests داخل `backend-verify`.
- صافي الفرق عن SHA 03.03 يحتوي فقط على ملفات 03.04 السبعة المعتمدة؛ الملف المؤقت `nonexistent` الناتج أثناء تنفيذ API تم تنظيفه من الـfinal tree عبر fast-forward commit بدون force push.
- لم يتم إنشاء أي Business Tables/Columns/Indexes/Views/Functions/Triggers/Constraints ولم يبدأ 03.05.
- **Final verified SHA:** `0663ad8bcf749621088db81ca8c5532ca005a538`
- **Primary CI run:** `34641305916` — SUCCESS على نفس الـSHA:
  - `verify` — SUCCESS.
  - `backend-verify` — SUCCESS، ويتضمن `PostgreSQL migration framework integration tests`.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR:** `#188` — CLOSED WITHOUT MERGE.
- `main` وConvex Production لم يتم تعديلهما.

## 03.05 Schema Build Order

**Status:** `CLOSED`

### 03.A Infrastructure / Organization / Security

**Status:** `CLOSED`

إنشاء كامل لـ:

- companies
- company_phones
- company_settings
- branches
- branch_settings
- warehouses
- users
- auth_sessions
- roles
- permissions
- role_permissions
- user_permission_overrides
- user_branch_access
- document_sequences
- idempotency_keys
- posting_batches
- audit_logs
- outbox_events
- document_tombstones

**Implementation / Verification Record:**

- تم اعتماد `ADR-0006 — Phase 03.A Core Infrastructure Schema Shape`.
- تمت إضافة migration دائمة forward-only:
  `0002_core_infrastructure_organization_security`.
- تم إنشاء الـ19 relation المعتمدة في 03.A فقط، بالأسماء الفيزيائية canonical و`snake_case`.
- تم تثبيت الحقول والأنواع وNullability وفق Architecture Baseline v1.7 وقرارات 03.01/03.03:
  UUID للمفاتيح/المراجع الداخلية، `timestamptz` للوقت، `jsonb` فقط للإعدادات/payload/audit snapshots المعتمدة، `inet` لعنوان جلسة المستخدم، و`bigint` لأرقام/عدادات المستندات المناسبة.
- لم تتم إضافة Seed Data للأدوار أو الصلاحيات أو المستخدمين؛ سلوك Auth/Authz يظل ضمن Phase 05.
- لم يتم بدء 03.06؛ لذلك لم تتم إضافة PK/FK/UNIQUE/CHECK/Generated/Deferred constraints في هذه الخطوة.
- لم يتم بدء 03.07؛ لذلك لم تتم إضافة أي Project-owned Index في هذه الخطوة.
- تم إضافة PostgreSQL 17 integration test يتحقق من:
  - وجود الـ19 relation فقط من نطاق 03.A.
  - الترتيب الدقيق للأعمدة والأنواع وNullability.
  - تسجيل migration `0002` في `schema_migrations`.
  - idempotent rerun وverify-only.
  - عدم وجود `counterparties` أو أي relation من 03.B.
  - عدم بدء Constraints 03.06 أو Index Catalog 03.07.
- **Final verified SHA:** `366a4f71df2cd5ee14a5df5fb12881edf0a11be6`
- **Primary CI run:** `34643504083` — SUCCESS على نفس الـSHA بعد retry واحدة لنفس `verify` job:
  - المحاولة الأولى تعطلت قبل Legacy tests داخل Chromium printing acceptance أثناء فك runtime المعبأ برسالة `ERR_STREAM_PREMATURE_CLOSE`؛ لم يكن الفشل في 03.A/PostgreSQL.
  - إعادة نفس `verify` job على نفس الـSHA نجحت بالكامل، بما في ذلك Full Tests وPrinting Evidence.
  - `backend-verify` — SUCCESS، ويتضمن PostgreSQL migration framework وPostgreSQL core infrastructure schema integration tests على PostgreSQL 17.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR:** `#189` — CLOSED WITHOUT MERGE.
- صافي تغيير 03.A عن SHA 03.04 هو Commit واحد و6 ملفات فقط.
- لم يتم تعديل `main` أو Convex Production، ولم يحدث Module Cutover أو Dual Write.

### 03.B Counterparties

**Status:** `CLOSED`

- counterparties
- counterparty_roles
- customer_profiles
- supplier_profiles
- customer_ledger_entries
- supplier_ledger_entries

**Implementation / Verification Record:**

- تم اعتماد `ADR-0007 — Phase 03.B Counterparties Schema Shape`.
- تمت إضافة migration دائمة forward-only:
  `0003_counterparties`.
- تم إنشاء الـ6 relations المعتمدة في 03.B فقط:
  `counterparties`, `counterparty_roles`, `customer_profiles`, `supplier_profiles`,
  `customer_ledger_entries`, `supplier_ledger_entries`.
- تم الحفاظ على هوية Counterparty موحدة، مع بقاء Customer/Supplier Ledgers منفصلين تاريخيًا كمصادر حقيقة مستقلة.
- تم تثبيت الحقول والأنواع وNullability حسب Architecture Baseline v1.7 وقرارات 03.01/03.03:
  UUID للمفاتيح/المراجع الداخلية، `numeric(18,4)` للقيم المالية،
  و`timestamptz` للتوقيتات التاريخية.
- `phone` يحفظ قيمة العرض، و`normalized_phone` هو الحقل canonical للبحث/المطابقة؛ منطق normalization نفسه يظل لمرحلة Counterparties service لاحقًا.
- `customer_profiles.credit_limit` اختياري ويستخدم `numeric(18,4)`.
- لم تتم إضافة أي mutable customer/supplier balance column؛ الحقيقة تبقى من الـledger entries التاريخية.
- لم يتم بدء 03.06؛ لذلك لم تتم إضافة PK/FK/UNIQUE/CHECK constraints في هذه الخطوة.
- لم يتم بدء 03.07؛ لذلك لم تتم إضافة أي Project-owned Index في هذه الخطوة.
- تم تحديث regression coverage لـMigration Framework و03.A بحيث تستمر بعد إضافة migration `0003`.
- تم إضافة PostgreSQL 17 integration test يتحقق من:
  - وجود الـ6 relations فقط من نطاق 03.B.
  - الترتيب الدقيق للأعمدة والأنواع وNullability.
  - `numeric(18,4)` للـledger amounts والـcredit limit.
  - تسجيل migration `0003` في `schema_migrations`.
  - idempotent rerun وverify-only.
  - عدم وجود `product_categories` أو أي relation من 03.C.
  - عدم بدء Constraints 03.06 أو Index Catalog 03.07.
- **Final verified SHA:** `090e8667a7525a99a2ddc1a6336fcedbe5825547`
- **Primary CI run:** `34644994900` — SUCCESS على نفس الـSHA بدون rerun:
  - `verify` — SUCCESS، بما في ذلك Full Tests وPrinting Evidence وSecurity وProduction Build وRelease Preflight.
  - `backend-verify` — SUCCESS، ويتضمن Migration Framework، 03.A regression، وPostgreSQL counterparties schema integration tests على PostgreSQL 17.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR:** `#190` — CLOSED WITHOUT MERGE.
- صافي تغيير 03.B عن SHA 03.A هو Commit واحد و7 ملفات فقط.
- لم يتم تنفيذ Counterparties service أو phone normalization behavior أو ledger posting logic أو seed data.
- لم يتم تعديل `main` أو Convex Production، ولم يحدث Module Cutover أو Dual Write.

### 03.C Product Catalog

**Status:** `CLOSED`

- product_categories
- products
- product_variants
- units
- product_units
- variant_barcodes
- attributes
- attribute_values
- product_attributes
- variant_attribute_values
- price_lists
- price_list_items
- reorder_levels

**Implementation / Verification Record:**

- تم اعتماد `ADR-0008 — Phase 03.C Product Catalog Schema Shape`.
- تمت إضافة migration دائمة forward-only:
  `0004_product_catalog`.
- تم إنشاء الـ13 relations المعتمدة في 03.C فقط:
  `product_categories`, `products`, `product_variants`, `units`, `product_units`,
  `variant_barcodes`, `attributes`, `attribute_values`, `product_attributes`,
  `variant_attribute_values`, `price_lists`, `price_list_items`, `reorder_levels`.
- تم الحفاظ على `products.base_unit_id` كمصدر الحقيقة الوحيد للـBase Unit، ولم يتم إنشاء `product_units.is_base`.
- تم تثبيت الحقول والأنواع وNullability حسب Architecture Baseline v1.7 وقرارات 03.01/03.03:
  UUID للمفاتيح/المراجع الداخلية، `numeric(18,4)` للأسعار والقيم المالية،
  `numeric(18,6)` لتحويلات الوحدات والكميات/حدود إعادة الطلب، و`timestamptz` للتوقيتات.
- `product_variants.sku` يظل nullable وفق الـIndex Catalog المعتمد الذي يحدد uniqueness فقط عند `sku IS NOT NULL`.
- `product_variants.minimum_selling_price` يظل nullable لأن v1.7 يعرّفه كقيمة اختيارية.
- `product_categories.parent_id` nullable لدعم Root Categories.
- تم الحفاظ على `combination_signature` كالحقل canonical لتركيبة الـVariant، دون تنفيذ الـUNIQUE constraint مبكرًا.
- لم يتم بدء 03.06؛ لذلك لم تتم إضافة PK/FK/UNIQUE/CHECK/Generated constraints في هذه الخطوة.- لم يتم بدء 03.07؛ لذلك لم تتم إضافة أي Project-owned Index، بما في ذلك GIN/pg_trgm indexes المعتمدة لاحقًا.
- تم تحديث regression coverage لـMigration Framework و03.A و03.B بحيث تستمر بعد إضافة migration `0004`.
- تم إضافة PostgreSQL 17 integration test يتحقق من:
  - وجود الـ13 relations فقط من نطاق 03.C.
  - الـpublic business table set بالكامل بدون duplicate aliases.
  - الترتيب الدقيق للأعمدة والأنواع وNullability.
  - `numeric(18,4)` للأسعار و`numeric(18,6)` للكميات/التحويلات.
  - وجود `products.base_unit_id` وغياب `product_units.is_base`.
  - تسجيل migration `0004` في `schema_migrations`.
  - idempotent rerun وverify-only.
  - عدم وجود `serial_numbers` أو أي relation من 03.D.
  - عدم بدء Constraints 03.06 أو Index Catalog 03.07.
- **Final verified SHA:** `aa82737ea10294f9f227b01ce7a57a93f68a64a8`
- **Primary CI run:** `34645972595` — SUCCESS على نفس الـSHA بدون rerun:
  - `verify` — SUCCESS، بما في ذلك Full Tests وPrinting Evidence وSecurity وProduction Build وRelease Preflight.
  - `backend-verify` — SUCCESS، ويتضمن Migration Framework، 03.A regression، 03.B regression، وPostgreSQL product catalog schema integration tests على PostgreSQL 17.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR:** `#191` — CLOSED WITHOUT MERGE.
- صافي الفرق النهائي عن SHA 03.B يحتوي فقط على 8 ملفات تخص 03.C؛ أي temporary artifact تم تنظيفه قبل التحقق النهائي.
- لم يتم تنفيذ Product Catalog service أو default-variant behavior أو pricing behavior أو barcode APIs أو seed data.
- لم يتم تعديل `main` أو Convex Production، ولم يحدث Module Cutover أو Dual Write.

### 03.D Inventory

**Status:** `CLOSED`

- serial_numbers
- batches
- inventory_movements
- inventory_movement_lines
- inventory_line_serials
- inventory_line_batches
- inventory_stock_positions
- variant_warehouse_cost_projection
- batch_stock_positions
- stock_reservations
- stock_transfers
- stock_transfer_lines
- stocktake_sessions
- stocktake_lines
- stocktake_line_serials
- stocktake_line_batches
- inventory_adjustments
- inventory_adjustment_lines
- inventory_adjustment_line_serials
- inventory_adjustment_line_batches

**Implementation / Verification Record:**

- تم اعتماد `ADR-0009 — Phase 03.D Inventory Schema Shape`.
- تمت إضافة migration دائمة forward-only:
  `0005_inventory`.
- تم إنشاء الـ20 relations المعتمدة في 03.D فقط، بدون أي alias relations.
- تم تثبيت Inventory Movements وسطورها وربط Serial/Batch كـHistorical Source of Truth للمخزون، مع بقاء:
  `inventory_stock_positions`, `variant_warehouse_cost_projection`, `batch_stock_positions`
  كـSynchronous Rebuildable Operational Projections / Lock Rows وليست Historical Ledgers.
- تم تثبيت الأنواع وفق Architecture Baseline v1.7 وقرارات 03.03:
  UUID للمفاتيح/المراجع، `numeric(18,6)` للكميات، `numeric(18,4)` للتكاليف والقيم،
  `timestamptz` للتوقيتات، `date` لانتهاء صلاحية الـBatch، و`bigint` لأرقام المستندات الظاهرة.
- لم يتم إنشاء أي floating-point quantity/cost/value.
- `serial_numbers.current_warehouse_id`, `batches.expiry_date`,
  `stock_reservations.released_at`, `stocktake_sessions.approved_by/approved_at`,
  و`inventory_adjustments.source_stocktake_id` تم تثبيت Nullability الخاصة بها حسب دورة الحياة المعتمدة.
- `inventory_stock_positions.available` و`batch_stock_positions.available` لم يتم إنشاؤهما كحقول قابلة للكتابة.
  سيتم إضافتهما في 03.06 كـGenerated/derived columns فقط: `on_hand - reserved`.
- تم توثيق وحسم التناقض الداخلي المحدود في v1.7 بخصوص
  `inventory_adjustment_lines`: أضيف internal UUID `id` للسطر لأن الجداول التابعة المعتمدة
  `inventory_adjustment_line_serials` و`inventory_adjustment_line_batches`
  تشير صراحة إلى `adjustment_line_id`.
  هذا لا يغير أي Business/Accounting outcome، بينما تظل
  `UNIQUE(adjustment_id, variant_id)` مؤجلة إلى 03.06.
- لم يتم بدء 03.06؛ لذلك لم تتم إضافة PK/FK/UNIQUE/PARTIAL UNIQUE/CHECK/Generated constraints.
- لم يتم بدء 03.07؛ لذلك لم تتم إضافة أي Project-owned Index من Index Catalog v1.7.
- تم تحديث Migration Framework وRegression coverage لـ03.A و03.B و03.C لتستمر مع migration `0005`.
- تمت إضافة PostgreSQL 17 integration tests للتحقق من:
  - وجود الـ20 Inventory relations بالشكل canonical.
  - exact columns/types/nullability.
  - `numeric(18,6)` للكميات و`numeric(18,4)` للتكاليف والقيم.
  - الفصل بين Historical Inventory Movements والـOperational Projections.
  - غياب `available` حتى Generated Columns pass في 03.06.
  - وجود internal `inventory_adjustment_lines.id` وربط children عبر `adjustment_line_id`.
  - migration history / checksum.
  - idempotent rerun وverify-only.
  - عدم وجود `sales_quotes` أو أي relation من 03.E.
  - عدم بدء Constraints 03.06 أو Index Catalog 03.07.
- صافي التغيير عن SHA 03.C هو Commit واحد و9 ملفات مقصودة فقط.
- **Final verified SHA:** `b08fed2cd78d55a53eb9278ccd9e3725e5e125a2`
- **Primary CI run:** `34647882649` — SUCCESS على نفس الـSHA بدون rerun:
  - `verify` — SUCCESS، بما في ذلك Full Tests وPrinting Evidence وSecurity وProduction Build وRelease Preflight.
  - `backend-verify` — SUCCESS، ويتضمن Migration Framework، 03.A/03.B/03.C regressions، وPostgreSQL Inventory schema integration tests على PostgreSQL 17.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR:** `#192` — CLOSED WITHOUT MERGE.
- لم يتم تنفيذ Inventory services أو Weighted Average/locking behavior في هذه الخطوة.
- لم يتم تعديل `main` أو Convex Production، ولم يحدث Module Cutover أو Dual Write.

### 03.E Sales

**Status:** `CLOSED`

- sales_quotes
- sales_quote_lines
- sales_orders
- sales_order_lines
- sales_order_status_history
- sales_order_shipping_details
- sales_order_deliveries
- sales_order_delivery_lines
- sales_invoices
- sales_invoice_lines
- sales_returns
- sales_return_lines
- sales_returnable_quantities_v

**Implementation / Verification Record:**

- تم اعتماد `ADR-0010 — Phase 03.E Sales Schema Shape`.
- تمت إضافة migration دائمة forward-only:
  `0006_sales`.
- تم إنشاء الـ12 Sales tables المعتمدة بالإضافة إلى
  `sales_returnable_quantities_v` كـNormal SQL read/helper view فقط.
- تم الحفاظ على `SalesQuote`, `SalesOrder`, `SalesInvoice`, `SalesReturn`
  كـAggregates منفصلة، بدون Generic Sales Document أو duplicate aliases.
- تم تثبيت الأنواع وفق Architecture Baseline v1.7 وقرارات 03.03:
  UUID للمفاتيح/المراجع، `bigint` لأرقام المستندات الظاهرة،
  `numeric(18,4)` للأموال/الأسعار/الضرائب/COGS snapshots،
  `numeric(18,6)` للكميات، `date` للتواريخ التجارية
  (`document_date`, `valid_until`)، و`timestamptz` للتوقيتات التشغيلية/Posting.
- `posted_at` يظل ترتيب الأثر الحقيقي؛ `document_date` تاريخ تجاري فقط ولا يعيد كتابة تاريخ
  Inventory/COGS/Ledger.
- تم الحفاظ على Walk-in fully-paid Sales Invoice عبر nullable `counterparty_id`.
  أي Due لاحقًا سيظل يتطلب Counterparty في Business Service وفق الـBaseline.
- تم الحفاظ على Unlinked Sales Return عبر nullable
  `counterparty_id`, `source_invoice_id`, `source_invoice_line_id`.
- تم الحفاظ على Service-line semantics عبر nullable
  `unit_cogs_snapshot`, `cogs_total`, `historical_unit_cost`
  لأن الخدمات لا تولد Inventory/COGS.
- Tax references/snapshots على السطور nullable لأن VAT اختياري؛
  `tax_codes` نفسها تظل ضمن 03.F، والـFK ستأتي في 03.06 بعد اكتمال schema shape.
- `sales_returnable_quantities_v` يعرض:
  `source_invoice_line_id`, `sold_quantity`, `posted_returned_quantity`, `returnable_quantity`.
  الـView ليست Source of Truth أو Concurrency Mechanism؛ الحماية الفعلية لاحقًا تظل
  `FOR UPDATE` على Original Invoice Line + recomputation داخل نفس Transaction.
- الـView تستبعد Operationally Deleted Sales Returns بما يتوافق مع قاعدة
  Reverse First ثم deleted metadata/Tombstone.
- لم يتم بدء 03.06؛ لذلك لم تتم إضافة PK/FK/composite-context/UNIQUE/PARTIAL UNIQUE/CHECK constraints.
- لم يتم بدء 03.07؛ لذلك لم تتم إضافة أي Project-owned Index من Index Catalog v1.7.
- تم تحديث Migration Framework وRegression coverage لـ03.A و03.B و03.C و03.D
  لتستمر بعد migration `0006`.
- تمت إضافة PostgreSQL 17 integration tests للتحقق من:
  - exact 12 Sales tables + helper view.
  - exact column order/types/nullability.
  - helper-view column shape وأنواع `numeric(18,6)`.
  - returnable arithmetic: sold 5, posted return 2 => returnable 3.
  - عدم احتساب return تم Operational Delete لها بعد reversal semantics.
  - migration history/checksum.
  - idempotent rerun وverify-only.
  - عدم وجود `purchase_invoices` أو أي relation من 03.F.
  - عدم بدء Constraints 03.06 أو Index Catalog 03.07.
- صافي التغيير عن SHA 03.D يحتوي فقط على 10 ملفات مقصودة تخص 03.E/regressions/CI.
- **Final verified SHA:** `76fcbdd0ea973ca1e2d3bba6fb6ddaeaef0426d1`
- **Primary CI run:** `34649716604` — SUCCESS على نفس الـSHA بدون rerun:
  - `verify` — SUCCESS، بما في ذلك Full Tests وPrinting Evidence وSecurity وProduction Build وRelease Preflight.
  - `backend-verify` — SUCCESS، ويتضمن Migration Framework، 03.A/03.B/03.C/03.D regressions،
    وPostgreSQL Sales schema integration tests على PostgreSQL 17.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR:** `#193` — CLOSED WITHOUT MERGE.
- لم يتم تنفيذ Sales posting/reservation/COGS/settlement/accounting services أو frontend cutover.
- لم يتم تعديل `main` أو Convex Production، ولم يحدث Dual Write.

### 03.F Purchasing / Tax

**Status:** `CLOSED`

- purchase_invoices
- purchase_invoice_lines
- purchase_returns
- purchase_return_lines
- purchase_returnable_quantities_v
- tax_codes

**Implementation / Verification Record:**

- تم اعتماد `ADR-0011 — Phase 03.F Purchasing / Tax Schema Shape`.
- تمت إضافة migration دائمة forward-only:
  `0007_purchasing_tax`.
- تم إنشاء الـ5 Purchasing/Tax tables المعتمدة بالإضافة إلى
  `purchase_returnable_quantities_v` كـNormal SQL read/helper view فقط.
- تم الحفاظ على V1 بدون Purchase Orders وبدون Generic PurchaseDocument أو duplicate aliases.
- تم تثبيت الأنواع وفق Architecture Baseline v1.7 وقرارات 03.03:
  UUID للمفاتيح/المراجع، `bigint` لأرقام المستندات الظاهرة،
  `numeric(18,4)` للأموال/الضرائب/التكاليف/الـsnapshots والـvariance،
  `numeric(18,6)` للكميات، `date` للتواريخ التجارية، و`timestamptz` لترتيب أثر الـPosting.
- `purchase_invoices.counterparty_id` يظل nullable لدعم الشراء النقدي الكامل بدون Supplier Account؛
  أي Due/Payable لاحقًا سيظل يتطلب Supplier Account في Business Service.
- تم الحفاظ على linked/unlinked Purchase Returns عبر nullable
  `source_purchase_invoice_id` و`source_purchase_invoice_line_id`، مع nullable counterparty في الشكل الفيزيائي
  لحالات التسوية النقدية غير المرتبطة؛ أي Supplier Ledger/Payable settlement لاحقًا يتطلب Counterparty.
- `tax_codes.rate` تم تثبيته كـexact `numeric(18,4)` كقرار precision تنفيذي،
  بدون تغيير Tax semantics المعتمدة.
- `tax_code_id` nullable لأن VAT اختياري، بينما Tax Amounts تبقى exact snapshots.
- `landed_cost_allocation` قيمة exact غير nullable ويمكن أن تكون صفرًا؛
  `landed_unit_cost` nullable للخدمات لأنها لا تتحمل Inventory Landed Cost.
- على Purchase Return lines، الـcommercial snapshots تبقى exact، بينما
  `inventory_unit_cost_snapshot` و`cost_variance` nullable للخدمات/non-inventory lines.
- `purchase_returnable_quantities_v` يعرض purchased/posted-returned/returnable quantities ويستبعد
  Operationally Deleted Returns بعد reversal semantics. الـView ليست Source of Truth أو Concurrency Mechanism؛
  الحماية الفعلية لاحقًا تظل Original Line `FOR UPDATE` + same-transaction recomputation.
- `posted_at` يظل ترتيب الأثر الحقيقي للمخزون/التكلفة/الـLedger؛ `document_date` تاريخ تجاري فقط ولا يعيد كتابة التاريخ.
- لم يتم بدء 03.06؛ لذلك لم تتم إضافة PK/FK/composite-context/UNIQUE/PARTIAL UNIQUE/CHECK constraints.
- لم يتم بدء 03.07؛ لذلك لم تتم إضافة أي Project-owned Index من Index Catalog v1.7.
- تم تحديث Migration Framework وRegression coverage لـ03.A/03.B/03.C/03.D/03.E لتستمر مع migration `0007`.
- تمت إضافة PostgreSQL 17 integration tests للتحقق من:
  - exact 5 Purchasing/Tax tables + helper view.
  - exact column order/types/nullability.
  - `numeric(18,4)` للقيم المالية/الضريبية والتكاليف و`numeric(18,6)` للكميات.
  - helper-view arithmetic: purchased 8, active returned 3 => returnable 5.
  - عدم احتساب Return تم Operational Delete لها بعد reversal semantics.
  - migration history/checksum.
  - idempotent rerun وverify-only.
  - عدم وجود `treasuries` أو أي relation من 03.G.
  - عدم بدء Constraints 03.06 أو Index Catalog 03.07.
- صافي التغيير عن SHA 03.E يحتوي بالضبط على 11 ملفًا مقصودًا تخص 03.F/regressions/CI.
- **Final verified SHA:** `b7e3779787fdfc9b344d1eea2ef869015e8d872c`
- **Primary CI run:** `34651307640` — SUCCESS على نفس الـSHA بدون rerun:
  - `verify` — SUCCESS، بما في ذلك Full Tests وPrinting Evidence وSecurity وProduction Build وRelease Preflight.
  - `backend-verify` — SUCCESS، ويتضمن Migration Framework و03.A/03.B/03.C/03.D/03.E regressions وPostgreSQL Purchasing/Tax schema integration tests على PostgreSQL 17.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR:** `#194` — CLOSED WITHOUT MERGE.
- لم يتم تنفيذ Purchasing posting/Weighted Average/VAT/Supplier Ledger/Treasury/Accounting services أو frontend cutover.
- لم يتم تعديل `main` أو Convex Production، ولم يحدث Dual Write.

### 03.G Finance / Settlement

**Status:** `CLOSED`

- treasuries
- receipts
- disbursements
- finance_categories
- treasury_transfers
- financial_movements
- treasury_balance_positions
- financial_allocations
- customer_advances
- advance_applications
- cheques
- installment_plans
- installments

**Implementation / Verification Record:**

- تم اعتماد `ADR-0012 — Phase 03.G Finance / Settlement Schema Shape`.
- تمت إضافة migration دائمة forward-only:
  `0008_finance_settlement`.
- تم إنشاء الـ13 relation المعتمدة في 03.G فقط:
  `treasuries`, `receipts`, `disbursements`, `finance_categories`,
  `treasury_transfers`, `financial_movements`, `treasury_balance_positions`,
  `financial_allocations`, `customer_advances`, `advance_applications`,
  `cheques`, `installment_plans`, `installments`.
- تم تثبيت `financial_movements` كـHistorical Source of Truth لأثر الخزائن،
  مع بقاء `treasury_balance_positions` كـSynchronous Rebuildable Operational Projection + Lock Row.
- لم يتم إنشاء `balance` داخل `treasuries` ولم يتم إنشاء mandatory `treasury_type`.
- تم تثبيت الحقول والأنواع وفق Architecture Baseline v1.7 وقرارات 03.03:
  UUID للمفاتيح/المراجع الداخلية، `bigint` لأرقام مستندات القبض/الصرف/التحويل،
  `numeric(18,4)` لكل القيم المالية والـprojections،
  `timestamptz` للأحداث والـPosting، و`date` لمواعيد استحقاق الشيكات والأقساط.
- `receipts.counterparty_id` و`disbursements.counterparty_id` nullable حسب سبب العملية.
- `receipts.category_id` و`disbursements.category_id` nullable حتى لا يتم إجبار تسوية Invoice/Installment
  على تصنيف INCOME/EXPENSE غير صحيح؛ Financial Allocations هي طبقة ربط التسوية.
- `finance_categories.gl_account_id` تم تثبيته كمرجع مطلوب في الشكل الفيزيائي،
  بينما جدول `gl_accounts` نفسه يبدأ في 03.H والـFK يظل مؤجلًا إلى 03.06.
- `financial_movements.counterparty_id` nullable لأن التحويلات والحركات غير المرتبطة بحساب ممكنة.
- تم الحفاظ على Customer Advance كالتزام مدعوم بـReceipt:
  `remaining_amount_projection` ليس Source of Truth،
  وتطبيق `advance_applications` لاحقًا لا ينشئ حركة نقدية جديدة لأن النقد دخل أصلًا.
- `cheques.settlement_financial_movement_id` nullable في حالة PENDING؛
  الأثر النقدي يبدأ فقط عند transition إلى `CLEARED` في مرحلة الخدمات اللاحقة.
- `installment_plans` و`installments` جداول استحقاق وليست Ledger موازيًا؛
  `paid_amount_projection/status` قابلة لإعادة البناء من Financial Allocations.
- لم يتم بدء 03.06؛ لذلك لم تتم إضافة PK/FK/composite-context/UNIQUE/CHECK constraints أو
  over-allocation/double-clear protections في DDL هذه الخطوة.
- لم يتم بدء 03.07؛ لذلك لم تتم إضافة أي Project-owned Index من Index Catalog v1.7.
- تم تحديث Migration Framework وRegression coverage لـ03.A/03.B/03.C/03.D/03.E/03.F
  لتستمر بعد migration `0008`.
- تمت إضافة PostgreSQL 17 integration tests للتحقق من:
  - وجود الـ13 Finance/Settlement tables بالشكل canonical.
  - exact column order/types/nullability.
  - exact-decimal round-trip لـ`numeric(18,4)`.
  - غياب balance/type aliases داخل `treasuries`.
  - PENDING cheque بدون settlement movement.
  - migration history/checksum.
  - idempotent rerun وverify-only.
  - عدم وجود `gl_accounts` أو أي relation من 03.H.
  - عدم بدء Constraints 03.06 أو Index Catalog 03.07.
- صافي التغيير عن SHA 03.F يحتوي بالضبط على 12 ملفًا مقصودًا تخص 03.G/regressions/CI.
- **Final verified SHA:** `a2f62f706ad21cababca93ba72e7771541b6e73b`
- **Primary CI run:** `34770538442` — SUCCESS على نفس الـSHA بدون rerun:
  - `verify` — SUCCESS، بما في ذلك Full Tests وPrinting Evidence وSecurity وProduction Build وRelease Preflight.
  - `backend-verify` — SUCCESS، ويتضمن Migration Framework و03.A/03.B/03.C/03.D/03.E/03.F regressions
    وPostgreSQL Finance/Settlement schema integration tests على PostgreSQL 17.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR:** `#195` — CLOSED WITHOUT MERGE.
- لم يتم تنفيذ Finance posting/idempotency/locking/allocation/cheque/installment services أو Ledger/Journal behavior أو frontend cutover.
- لم يتم تعديل `main` أو Convex Production، ولم يحدث Dual Write.

### 03.H Accounting

**Status:** `CLOSED`

- gl_accounts
- journal_entries
- journal_lines
- deferred journal balance constraint trigger

**Implementation / Verification Record:**

- تم اعتماد `ADR-0013 — Phase 03.H Accounting Schema Shape`.
- تمت إضافة migration دائمة forward-only:
  `0009_accounting`.
- تم إنشاء الـ3 Accounting relations المعتمدة فقط:
  `gl_accounts`, `journal_entries`, `journal_lines`.
- تم تثبيت الأنواع والـNullability حسب Architecture Baseline v1.7 وقرارات 03.03:
  UUID للمفاتيح/المراجع، `numeric(18,4)` للـDebit/Credit،
  و`timestamptz` لـ`journal_entries.posted_at`.
- `gl_accounts.parent_id` nullable لدعم Root Chart-of-Accounts nodes.
- `journal_entries.reversal_of_entry_id` nullable للقيود الأصلية ويربط القيد المعاكس تاريخيًا
  بدون تعديل القيد القديم.
- `journal_entries.description` و`journal_lines.counterparty_id` nullable كبيانات اختيارية لا تعتمد
  عليها سلامة القيد المحاسبي.
- `journal_entries.posting_batch_id` مطلوب لكنه ليس Unique حسب الـIndex Catalog v1.7.
- تم تنفيذ الاستثناء المصرح به صراحة داخل 03.H:
  - function: `fn_journal_entries_balanced_at_commit()`.
  - deterministic constraint trigger: `ct_journal_entries__balanced_at_commit`.
  - `DEFERRABLE INITIALLY DEFERRED`.
  - فحص الحالة النهائية لكل Journal Entry عند `COMMIT` بحيث
    `SUM(debit) = SUM(credit)`.
  - دعم INSERT/UPDATE/DELETE، بما في ذلك UPDATE ينقل السطر بين قيدين فيتحقق من القديم والجديد.
  - عند عدم التوازن يرفع SQLSTATE `23514` ويُفشل الـTransaction.
- آلية قاعدة البيانات تكمل Backend validation اللاحقة ولا تستبدلها.
- باستثناء Journal Balance Trigger المصرح به ضمن 03.H، لم يتم بدء 03.06:
  لا PK/FK/UNIQUE/CHECK/composite-context/delete-policy constraints عامة أضيفت.
- لم يتم بدء 03.07؛ لم تتم إضافة أي Project-owned Accounting Index.
- تم تحديث Migration Framework وRegression coverage لـ03.A حتى 03.G لتستمر بعد migration `0009`.
- تمت إضافة PostgreSQL 17 integration tests للتحقق من:
  - exact Accounting table/column/type/nullability shape.
  - exact `numeric(18,4)` round-trip للـDebit/Credit.
  - وجود الـConstraint Trigger بالاسم المعتمد وأنه Deferrable وInitially Deferred.
  - Balanced multi-line Journal Entry ينجح عند COMMIT.
  - Unbalanced Journal Entry يكون موجودًا داخل Transaction ثم يفشل تحديدًا عند COMMIT.
  - UPDATE يسبب عدم توازن يفشل عند COMMIT ويُعمل له Rollback مع الحفاظ على القيمة الصحيحة السابقة.
  - migration history/checksum.
  - idempotent rerun وverify-only.
  - عدم وجود `repair_orders` أو أي relation من 03.I.
  - عدم بدء 03.07 أو بقية 03.06.
- صافي التغيير عن SHA 03.G يحتوي بالضبط على 13 ملفًا مقصودًا تخص 03.H/regressions/CI.
- **Final verified SHA:** `68c6a001ea7253fb2971d9f8289b4227205aad37`
- **Primary CI run:** `34771923882` — SUCCESS على نفس الـSHA بدون rerun:
  - `verify` — SUCCESS، بما في ذلك Full Tests وPrinting Evidence وSecurity وProduction Build وRelease Preflight.
  - `backend-verify` — SUCCESS، ويتضمن Migration Framework و03.A/03.B/03.C/03.D/03.E/03.F/03.G regressions
    وPostgreSQL Accounting schema/deferred-balance integration tests على PostgreSQL 17.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR:** `#196` — CLOSED WITHOUT MERGE.
- لم يتم تنفيذ Accounting posting services أو direct-entry UI أو frontend cutover.
- لم يتم تعديل `main` أو Convex Production، ولم يحدث Dual Write.

### 03.I Repairs / Follow-Up / Notifications

**Status:** `CLOSED`

- تم تنفيذ migration `0010_repairs_followup_notifications` وإنشاء الـ12 relation المعتمدة فقط:
  `repair_orders`, `repair_status_history`, `repair_assignments`, `repair_issue_reports`,
  `repair_customer_decisions`, `repair_tracking_tokens`, `customer_followups`, `followup_actions`,
  `followup_status_history`, `message_templates`, `notifications`, `notification_recipients`.
- تم الحفاظ على حالات الصيانة التسعة المعتمدة دون تنفيذ Business Commands أو Module Cutover في هذه الخطوة.
- `repair_status_history` يظل Source of Truth للتوقيتات والتاريخ، بينما current status/current technician/completed/delivered قيم Convenience فقط؛ لم يتم إنشاء أي مسار لتعديل أو حذف التاريخ.
- `repair_tracking_tokens` يخزن `token_hash` فقط، ولا يوجد plaintext token column.
- `customer_followups` يدعم source واحدًا من `SALES_ORDER / REPAIR_ORDER / MANUAL`، مع السماح بـ`source_id = NULL` للمتابعة اليدوية.
- `followup_actions` و`followup_status_history` يمثلان التاريخ التشغيلي append-only على مستوى الـSchema shape؛ قيود الحماية التفصيلية تظل ضمن 03.06.
- `notifications` يخزن source reference + translation keys + `message_params_json` فقط، وليس Snapshot كامل للمستند المصدر.
- تم توثيق ADR-0014 لقرارَي الـPhysical Schema اللازمين للاتساق مع Index Catalog v1.7:
  - إضافة `repair_orders.created_at/updated_at`.
  - إضافة UUID `id` إلى `followup_status_history`.
- تم تحديث Migration Framework وكل Regression Tests السابقة من 03.A حتى 03.H لتعمل عبر migration `0010`.
- تمت إضافة PostgreSQL 17 Gate الرسمية للـ03.I داخل `backend-verify`.
- PostgreSQL 17 integration coverage يثبت exact relation/column/type/nullability shape، hashed-token-only shape، MANUAL follow-up nullable source، JSON notification params، per-user unseen/read state، migration history/checksum، idempotent rerun، verify-only، وعدم بدء 03.J/03.06/03.07 مبكرًا.
- صافي التغيير عن SHA 03.H يحتوي فقط على 14 ملفًا مقصودًا تخص 03.I/regressions/CI.
- **Final verified SHA:** `fc0acc9b325f98d34cf6a5ebace450425ec02395`
- **Primary CI run:** `34773141914` — SUCCESS على نفس الـSHA بدون rerun:
  - `verify` — SUCCESS، بما في ذلك Full Tests وPrinting Evidence وSecurity وProduction Build وRelease Preflight.
  - `backend-verify` — SUCCESS، بما في ذلك Migration Framework و03.A حتى 03.H regressions وPostgreSQL Repairs/Follow-Up/Notifications schema integration tests على PostgreSQL 17.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR:** `#197` — CLOSED WITHOUT MERGE.
- لم يتم بدء 03.J أو بقية 03.06 أو 03.07، ولم يتم تنفيذ repair/follow-up/notification services أو WhatsApp automatic sending أو public tracking API أو frontend cutover.
- لم يتم تعديل `main` أو Convex Production، ولم يحدث Dual Write.

### 03.J Printing / Export / Reports Read Models

**Status:** `CLOSED`

- print_templates
- branch_print_defaults
- reporting_daily_branch_metrics
- reporting_inventory_balances
- reporting_counterparty_balances
- reporting_treasury_balances
- reporting_followup_metrics

**Closure evidence:**

- Gap Analysis completed against Architecture Baseline v1.7, Master Implementation Plan v1.0, and the committed PostgreSQL implementation.
- ADR-0015 — `Phase 03.J Printing / Export / Reports Read Models Schema Shape` — accepted and committed.
- ADR-0016 — `Print Template Default Single Source of Truth` — accepted and committed to prevent `branch_settings` print-default compatibility fields and `branch_print_defaults` becoming independent write sources.
- Migration `0011_printing_export_reports_read_models` created with exactly the seven approved 03.J relations.
- `print_templates` is the canonical physical relation used by the implementation; no duplicate `templates_print` relation is created.
- All `reporting_*` relations remain rebuildable read models/projections and are not historical Sources of Truth.
- Exact physical types are preserved:
  - money/cost/balance: `numeric(18,4)`
  - inventory quantities: `numeric(18,6)`
  - instant timestamps: `timestamptz`
  - daily grains: PostgreSQL `date`
  - template configuration: `jsonb`
  - follow-up aggregate counters: `bigint`
- PostgreSQL 17 integration coverage proves exact relation/column/type/nullability shape, JSON round-trip, high-precision numeric storage, bigint counters above JavaScript safe-integer range, migration history/checksum, idempotent rerun, verify-only, and absence of unauthorized alias/export tables.
- Existing 03.A through 03.I regression tests were extended through migration `0011` without weakening Sales, Purchasing/Returns, Inventory/COGS, Finance, Accounting deferred-balance, or Repairs/Follow-Up/Notifications assertions.
- A migration-framework compatibility defect was discovered during validation: `0010_repairs_followup_notifications` verification incorrectly treated absence of future `print_templates` as a permanent invariant. Because PostgreSQL V1.7 migrations have not been production-applied, the 0010 metadata verification was corrected before release to verify only the 12 relations owned by 0010; SQL/data shape was not changed.
- Initial validation run `34777225556` exposed the above 0010 verification defect and was not accepted as closure evidence.
- **Final verified SHA:** `0734525dcd084e4687d64d65dbf3140787b5b8f6`
- **Primary final CI run:** `34777335703` — SUCCESS on the same final SHA:
  - `verify` — SUCCESS, including dependency audit, TypeScript, full tests, printing evidence, security, production build, and release preflight.
  - `backend-verify` — SUCCESS, including Migration Framework, PostgreSQL 17 schema regressions 03.A through 03.I, the new 03.J schema integration test, backend build, and PostgreSQL health/readiness/graceful-shutdown smoke.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR:** `#198` — CLOSED WITHOUT MERGE.
- Net change from the verified 03.I SHA `fc0acc9b325f98d34cf6a5ebace450425ec02395` to the final 03.J SHA contains 18 intended files only: ADRs, migration/metadata, schema tests/support, prior schema regressions, and CI.
- 03.06 Constraints and 03.07 Index Catalog were not started.
- No Business Module cutover, dual write, `main` merge, or Convex Production change occurred.

**03.05 Schema Build Order closure:** all schema-build slices `03.A` through `03.J` are now `CLOSED`. The next authorized action is `03.06 Constraints` only.

## 03.06 Constraints

**Status:** `CLOSED`

تطبيق كل:

- PK
- FK
- Composite context protection
- UNIQUE
- Partial UNIQUE
- CHECK
- Generated columns
- Deferred constraint trigger
- RESTRICT/CASCADE/SET NULL policy

حسب §25-§28 بدون اختصار.

### 03.06.A Gap Analysis

**Status:** `COMPLETE`

- Gap Analysis completed against Architecture Baseline v1.7 §§25–28 and the committed physical schema from migrations `0002` through `0011`.
- Gap Analysis document: `docs/gap-analysis/phase-03-06-constraints-gap-analysis.md`.
- Gap Analysis commit: `339b8622af0b5070b5a67fbf0b9fa97fb75c35d1`.
- Current physical inventory: **110 tables + 2 views**, plus the existing accounting journal-balance function/deferred constraint trigger.
- Column type/nullability contracts from 03.05 remain compliant and must not be rewritten.
- `sales_returnable_quantities_v` and `purchase_returnable_quantities_v` remain approved read models.
- `ct_journal_entries__balanced_at_commit` remains the approved `DEFERRABLE INITIALLY DEFERRED` multi-row journal-balance constraint mechanism.
- The remaining PK/FK/Composite Context/UNIQUE/Partial UNIQUE/CHECK/referential-action layer is intentionally missing and must be added through new forward migration(s), not by rewriting migrations `0002`–`0011`.
- No approved relation requires replacement before the constraint pass.
- Operational stock `available` remains derived from `on_hand - reserved`; no independent stored/generated balance is introduced by this Gap Analysis.
- ADR-0016 remains controlling for print defaults: `branch_print_defaults` is the canonical normalized default map; the legacy `branch_settings` print-template fields are compatibility fields only.
- Composite/cross-table integrity requiring special treatment was identified for Branch+Warehouse, Branch+Treasury, Variant+ProductUnit, Delivery+SalesOrderLine, Return+Source Line, User Default Branch access, and Warehouse historical immutability.
- **Installment-status ambiguity resolved by ADR-0017:** the canonical V1 `installments.status` vocabulary is:
  - `UPCOMING`
  - `DUE`
  - `PARTIAL`
  - `PAID`
  - `OVERDUE`
- ADR-0017 treats the single §28.6 `PENDING / PARTIALLY_PAID` predicate as an Index Catalog terminology defect, because the approved domain/schema/transaction sections consistently use `UPCOMING / DUE / PARTIAL / PAID / OVERDUE`.
- `PENDING` and `PARTIALLY_PAID` are not authorized installment-status values in the new PostgreSQL Core.
- The future 03.07 open-installment partial-index predicate must align with the canonical vocabulary; actual index DDL remains deferred to 03.07.
- **ADR-0017 commit:** `d1a4d5727afed470ef14f50ba613c2c5175341e7`.
- **Recorded for future 03.07 only:** §28.6 references `receipts.sales_order_id` and `advance_applications.posting_batch_id`, while those columns do not exist in the approved §25.12 / migration `0008` physical shapes. No column is added during 03.06 merely to satisfy those future index lines.
- Tests: **NOT RUN — documentation-only ADR step**. No executable code, migration, database object, frontend, Convex runtime, Production data, or write owner changed.
- 03.06 remains `IN_PROGRESS`; no constraint migration has been started.
- 03.07 has **not** started.

### 03.06.B ADR-0017 — Installment Status Vocabulary

**Status:** `ACCEPTED`

- Decision document: `docs/decisions/ADR-0017-installment-status-vocabulary.md`.
- Canonical values: `UPCOMING / DUE / PARTIAL / PAID / OVERDUE`.
- §28.6 `PENDING / PARTIALLY_PAID` is not used as the domain vocabulary.
- No state-transition precedence beyond the approved vocabulary was invented.
- No DDL/index/data migration was created by this ADR.

### 03.06.C Core / Organization / Security Constraints

**Status:** `CLOSED`

- Forward migration created:
  - `database/migrations/0012_core_organization_security_constraints.sql`
  - `database/migrations/0012_core_organization_security_constraints.meta.json`
- Scope is limited to Core / Organization / Security integrity. No Counterparty/Product/Inventory/Sales/Purchasing/Finance/Repairs/Reporting constraint slice was pulled forward.
- The migration adds the approved Core primary keys, mapping/composite primary keys, ordinary UNIQUE constraints, direct FKs, CHECK constraints, and §26.5 referential actions.
- Mandatory mapping uniqueness is enforced through keys/UNIQUE constraints including:
  - `role_permissions(role_id, permission_id)`
  - `user_permission_overrides(user_id, permission_id)`
  - `user_branch_access(user_id, branch_id)`
  - `document_sequences(branch_id, document_type)`
  - branch code per company
  - warehouse code per branch
  - tombstone document identity
  - idempotency key identity.
- Closed-domain / numeric checks added for:
  - `users.branch_scope_mode = SELECTED | ALL`
  - permission override `ALLOW | DENY`
  - posting operation `POST | CORRECTION | REVERSAL | DELETE_REVERSAL`
  - non-negative phone sort order, sequence counter, posting document version, outbox retry count, and tombstone document number.
- Referential actions were implemented according to the approved semantics: pure configuration/child mappings use CASCADE where safe; historical/business ownership uses RESTRICT; optional descriptive `company_settings.updated_by` uses SET NULL.
- Four cross-row/cross-table invariants are enforced by `DEFERRABLE INITIALLY DEFERRED` constraint triggers:
  - `ct_branch_settings__default_warehouse_valid_at_commit`
  - `ct_warehouses__preserve_default_reference_at_commit`
  - `ct_users__default_branch_access_at_commit`
  - `ct_user_branch_access__preserves_default_at_commit`
- The branch default warehouse must exist, be active, and belong to the same branch.
- A warehouse cannot be made inactive or moved to another branch while it remains referenced as a branch default.
- A `SELECTED`-scope user must have its default branch in `user_branch_access` at COMMIT, and that default access cannot be removed while the user remains in that state.
- No independent 03.07 query/performance index was created. PostgreSQL backing indexes created automatically by PRIMARY KEY / UNIQUE constraints are allowed and are not treated as 03.07 work.
- Case-normalized username/email index rules remain deferred to 03.07, per the closed Index Catalog.
- Cross-domain `branch_settings.default_price_list_id` and print-template compatibility references remain deferred to the corresponding later 03.06 constraint slices.
- New PostgreSQL 17 behavioral integration test:
  - `server/tests/postgresql-core-organization-security-constraints.integration.test.mjs`
- Migration framework and schema regressions were extended through migration `0012` without weakening prior Sales, Purchasing/Returns, Inventory/COGS, Finance, Accounting, Repairs/Follow-Up/Notifications, or 03.J schema contracts.
- CI backend gate now runs the dedicated Core / Organization / Security constraint integration test.
- Initial validation SHA `0126c5ea872a49c40d42cf187a60e151110893a7`, run `34895167433`, was **not** accepted as closure evidence. The migration and Core schema gates passed, while the new behavioral test exposed that deferred trigger error messages did not contain the stable constraint name even though the PostgreSQL `constraint` field was populated and the invariant itself fired correctly.
- The four deferred-trigger error messages were made self-identifying without changing SQLSTATE, invariant semantics, or weakening any constraint.
- **Final verified SHA:** `1709910a5f8ff83156e0a11486b53c08f40636c3`.
- **Final CI run:** `34895347217` — SUCCESS on the same final SHA:
  - `verify` — SUCCESS: dependency audit, TypeScript, pagination guard, full tests, printing evidence, security check, production build, release preflight.
  - `backend-verify` — SUCCESS: backend checks, transaction tests, PostgreSQL extension/data-type/migration tests, Core schema regression, dedicated Core constraint integration, every prior schema regression through 03.J, backend build, health/readiness/graceful-shutdown smoke.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR #199:** `CLOSED WITHOUT MERGE` on head SHA `1709910a5f8ff83156e0a11486b53c08f40636c3`.
- No `main` merge, frontend cutover, dual write, Convex Production change, or Production data change occurred.
- At closure of this slice, 03.06 remained `IN_PROGRESS`; subsequent slices are tracked below.
- 03.07 remains `NOT_STARTED`.

### 03.06.D Counterparties + Customer/Supplier Ledgers Constraints

**Status:** `CLOSED`

- Forward migration created:
  - `database/migrations/0013_counterparties_ledgers_constraints.sql`
  - `database/migrations/0013_counterparties_ledgers_constraints.meta.json`
- Scope is limited to `counterparties`, `counterparty_roles`, `customer_profiles`, `supplier_profiles`, `customer_ledger_entries`, and `supplier_ledger_entries`.
- Relation identities / mandatory uniqueness:
  - `counterparties(id)` PRIMARY KEY.
  - `counterparty_roles(counterparty_id, role)` composite PRIMARY KEY, satisfying the mandatory unique role pair.
  - `customer_profiles(counterparty_id)` PRIMARY KEY.
  - `supplier_profiles(counterparty_id)` PRIMARY KEY.
  - `customer_ledger_entries(id)` PRIMARY KEY.
  - `supplier_ledger_entries(id)` PRIMARY KEY.
- Closed-domain and numeric integrity:
  - `counterparty_roles.role` accepts only `CUSTOMER | SUPPLIER | OTHER`.
  - `customer_profiles.credit_limit` is nullable but cannot be negative.
  - Customer/Supplier Ledger `amount` cannot be negative.
  - No `entry_type` CHECK was invented because Architecture Baseline v1.7 does not provide an approved closed vocabulary for ledger entry types.
- Referential actions:
  - `counterparty_roles`, `customer_profiles`, and `supplier_profiles` are true child/config rows and use `ON DELETE CASCADE` to the canonical counterparty.
  - Historical Customer/Supplier Ledger references to counterparty, branch, posting batch, and creator use `ON DELETE RESTRICT`.
- The same counterparty is explicitly verified to support both `CUSTOMER` and `SUPPLIER` roles simultaneously while keeping the two historical ledgers separate.
- `normalized_phone` is **not** made globally unique. The dedicated test proves duplicate normalized phone values remain permitted; phone/name search indexes remain owned by 03.07.
- `customer_profiles.default_price_list_id → price_lists(id)` is deliberately deferred to the Product Catalog constraint slice because the Product Catalog key layer has not yet been closed. No cross-domain FK was pulled forward out of order.
- No independent 03.07 query/search/performance index was created. PostgreSQL backing indexes generated by PRIMARY KEY constraints are allowed and are not 03.07 work.
- New PostgreSQL 17 behavioral integration test:
  - `server/tests/postgresql-counterparties-ledgers-constraints.integration.test.mjs`
- Behavioral coverage proves:
  - duplicate role pair rejection;
  - invalid role rejection;
  - negative credit-limit rejection;
  - negative Customer/Supplier Ledger amount rejection;
  - invalid branch and posting-batch references rejection;
  - child/profile CASCADE semantics;
  - historical ledger `RESTRICT` semantics against counterparty, posting batch, and creator deletion;
  - separate Customer and Supplier Ledger persistence for the same counterparty;
  - no independent Counterparty index before 03.07;
  - idempotent migration rerun + verify-only success.
- Migration framework and all schema regressions were synchronized through migration `0013` without weakening previous domain contracts.
- CI backend gate now runs the dedicated Counterparties/Ledgers behavioral integration test.
- **Final verified SHA:** `06b0526fe9bce36f9b43d719908bb61b6fdf35c9`.
- **Final CI run:** `34994073403` — SUCCESS on the same final SHA:
  - `verify` — SUCCESS: dependency audit, TypeScript, pagination guard, full tests, printing evidence, security check, production build, release preflight.
  - `backend-verify` — SUCCESS: backend/security/typecheck/unit/transaction tests; PostgreSQL 17 extension/data-type/migration tests; Core schema + Core constraints; Counterparties schema + dedicated Counterparties/Ledgers constraints; Product, Inventory, Sales, Purchasing, Finance, Accounting, Repairs/Follow-Up/Notifications, and 03.J read-model regressions; backend build; health/readiness/graceful-shutdown smoke.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR #200:** `CLOSED WITHOUT MERGE` on head SHA `06b0526fe9bce36f9b43d719908bb61b6fdf35c9`.
- No `main` merge, frontend cutover, dual write, Convex Production change, Production data deletion, or 03.07 Index Catalog work occurred.
- 03.06 remains `IN_PROGRESS`; its Core and Counterparties/Ledgers executable slices are now closed.
- 03.07 remains `NOT_STARTED`.

### 03.06.E Product Catalog Constraints

**Status:** `CLOSED`

- Forward migration created:
  - `database/migrations/0014_product_catalog_constraints.sql`
  - `database/migrations/0014_product_catalog_constraints.meta.json`
- Scope is limited to Product Catalog integrity plus the already-approved optional default Price List references from Branch and Customer profiles. No Inventory/Sales/Purchasing/Finance/Accounting/Repairs/Reporting constraint slice was pulled forward.
- Primary/composite identities were added for:
  - `product_categories`
  - `products`
  - `product_variants`
  - `units`
  - `product_units`
  - `variant_barcodes`
  - `attributes`
  - `attribute_values`
  - `price_lists`
  - `product_attributes(product_id, attribute_id)`
  - `variant_attribute_values(variant_id, attribute_value_id)`
  - `price_list_items(price_list_id, variant_id, product_unit_id)`
  - `reorder_levels(variant_id, warehouse_id)`.
- Mandatory Product Catalog uniqueness added for:
  - `product_variants(product_id, combination_signature)`
  - `units(name)`
  - `product_units(product_id, unit_id)`
  - `variant_barcodes(barcode)`
  - `attribute_values(attribute_id, value)`.
- `products.base_unit_id` remains the **only Base Unit Source of Truth**. `product_units.is_base` was not introduced.
- The Product → Base ProductUnit cycle is implemented with a `DEFERRABLE INITIALLY DEFERRED` FK plus COMMIT-time integrity so Product + Base Unit can be created atomically while still requiring the Base ProductUnit to belong to that same Product.
- Every Product is required to retain at least one Variant at COMMIT.
- Barcode integrity requires its `variant_id` and `product_unit_id` to belong to the same Product.
- Deferred constraint triggers added:
  - `ct_products__catalog_integrity_at_commit`
  - `ct_product_units__preserve_catalog_integrity_at_commit`
  - `ct_variant_barcodes__product_match_at_commit`
  - `ct_product_variants__preserve_catalog_integrity_at_commit`.
- Approved Product checks added for:
  - `product_type = STOCK | SERVICE`
  - valid tracking policy: Serial and Batch cannot both be enabled; Expiry requires Batch tracking
  - `minimum_selling_price >= 0` when present
  - `conversion_to_base > 0`
  - `usage_type = VARIANT | DESCRIPTIVE`
  - non-negative attribute sort order
  - non-negative Price List item price
  - non-negative reorder minimum quantity.
- Direct Product Catalog FKs and referential actions were added according to §26.5. Pure mapping/config children may cascade where safe; core Product/category/unit ownership uses restrictive semantics.
- `branch_settings.default_price_list_id` and `customer_profiles.default_price_list_id` are now protected by FKs to `price_lists(id)` with `ON DELETE SET NULL`, because the Product Catalog PK layer is now available.
- **No independent 03.07 query/search/performance index was created.**
- Nullable SKU uniqueness remains deferred to the closed 03.07 Index Catalog rule `UNIQUE (sku) WHERE sku IS NOT NULL`; 03.06 does not implement that partial index early.
- No CHECK was invented for `attribute_type` because Architecture Baseline v1.7 does not define an approved closed vocabulary for that field.
- New PostgreSQL 17 behavioral integration test:
  - `server/tests/postgresql-product-catalog-constraints.integration.test.mjs`
- Behavioral coverage proves:
  - atomic Product + Base Unit + initial Variant creation;
  - cross-Product Base Unit rejection at COMMIT;
  - cross-Product Barcode Variant/ProductUnit rejection at COMMIT;
  - duplicate barcode rejection;
  - duplicate Product combination rejection;
  - duplicate Unit name rejection;
  - duplicate ProductUnit `(product_id, unit_id)` rejection;
  - Product type/tracking/conversion/minimum-price CHECK enforcement;
  - Attribute usage/value integrity;
  - Price List item grain and non-negative price;
  - Branch/Customer default Price List `SET NULL` behavior;
  - Reorder grain and non-negative minimum quantity;
  - prevention of deleting the sole Variant of a Product;
  - absence of independent Product indexes before 03.07;
  - migration history/checksum, idempotent rerun, and verify-only.
- Migration framework and all schema regressions were synchronized through migration `0014` without weakening existing domain assertions.
- The first validation run `35004112623` on earlier head `15fc7d6ca8969f2501855e3dfd182dfc9bfaedea` was **not accepted** as closure evidence. The migration framework, Core/Counterparty regressions, and Product schema regression passed; the new Product behavioral test failed because its fixture used `branch_scope_mode='SELECTED'` before inserting `user_branch_access`, correctly triggering the already-verified Core constraint `ct_users__default_branch_access_at_commit`.
- The Product test fixture was corrected to use `branch_scope_mode='ALL'`, isolating Product tests from an unrelated Core selected-branch invariant; no Core constraint was weakened or changed.
- Remaining schema regressions from Inventory through Repairs were synchronized mechanically to migration `0014` without changing their business assertions.
- **Final verified SHA:** `b4c40ef91869f3c015789657ca92b0c9a5c41201`.
- **Final CI run:** `35004892598` — SUCCESS on the same final SHA:
  - `verify` — SUCCESS: dependency audit, TypeScript, pagination guard, full tests, printing evidence, security check, production build, release preflight.
  - `backend-verify` — SUCCESS: backend/security/typecheck/unit/transaction checks; PostgreSQL 17 extension/data-type/migration framework; Core schema + Core constraints; Counterparty schema + Counterparty/Ledger constraints; Product schema + dedicated Product Catalog behavioral constraints; Inventory, Sales, Purchasing, Finance, Accounting, Repairs/Follow-Up/Notifications and 03.J read-model regressions; backend build; health/readiness/graceful-shutdown smoke.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR #201:** `CLOSED WITHOUT MERGE` on head SHA `b4c40ef91869f3c015789657ca92b0c9a5c41201`.
- No `main` merge, frontend cutover, dual write, Convex Production change, Production data deletion, or 03.07 Index Catalog work occurred.
- 03.06 remains `IN_PROGRESS`; Core, Counterparties/Ledgers, and Product Catalog executable slices are now closed.
- 03.07 remains `NOT_STARTED`.

### 03.06.F Inventory Constraints

**Status:** `CLOSED`

- Forward migration created:
  - `database/migrations/0015_inventory_constraints.sql`
  - `database/migrations/0015_inventory_constraints.meta.json`
- Scope is limited to Inventory integrity. No Sales/Purchasing/Finance/Accounting/Repairs/Reporting constraint slice was pulled forward.
- Inventory identity / grain constraints now cover the canonical Inventory tables, including:
  - `inventory_stock_positions(warehouse_id, variant_id)`
  - `variant_warehouse_cost_projection(warehouse_id, variant_id)`
  - `batch_stock_positions(warehouse_id, batch_id)`
  - serial/batch movement link pairs
  - stocktake serial/batch pairs
  - inventory-adjustment serial/batch pairs.
- Composite Warehouse + Branch protection was implemented using the constraint-owned target:
  - `uq_warehouses__id_branch UNIQUE(id, branch_id)`
  and composite FKs for Inventory movements, transfer source warehouse, stocktake sessions, and inventory adjustments.
- Historical Warehouse safety is therefore enforced: once referenced by Inventory history, a Warehouse cannot be deleted or moved to an incompatible Branch through those protected historical references.
- Mandatory Inventory uniqueness now includes:
  - `serial_numbers(variant_id, serial_number)`
  - `batches(variant_id, batch_number)`
  - `stock_transfers(issuing_branch_id, document_number)`
  - `stock_transfer_lines(transfer_id, variant_id)`
  - `stocktake_sessions(branch_id, document_number)`
  - `stocktake_lines(session_id, variant_id)`
  - `inventory_adjustments(branch_id, document_number)`
  - `inventory_adjustment_lines(adjustment_id, variant_id)`.
- Historical/master Inventory references use `ON DELETE RESTRICT` according to the approved §26.5 policy.
- Closed-domain checks added only where the Architecture supplies an approved vocabulary:
  - `stock_reservations.status = ACTIVE | PARTIALLY_CONSUMED | RELEASED | CONSUMED`
  - `stocktake_sessions.status = OPEN | COUNTED | APPROVED | CANCELLED`.
- Numeric/data-integrity checks include positive reservation/transfer quantities, non-negative reserved/version/cost fields where those fields are not designed to be signed, positive document numbers, and exact stocktake `difference = counted_quantity - book_quantity_at_count`.
- **Negative stock remains supported by design:** no global `on_hand >= 0` CHECK was introduced because Architecture v1.7 permits negative stock under an explicit permission/policy. The PostgreSQL 17 behavioral test proves a negative `inventory_stock_positions.on_hand` value is not globally rejected.
- No unapproved closed vocabulary was invented for Serial status, Transfer status, movement reason, or adjustment reason.
- Sales-owned reservation references (`sales_order_id`, `sales_order_line_id`) remain deferred until the Sales constraint slice establishes its target key/context layer.
- The active-reservation uniqueness rule for `ACTIVE / PARTIALLY_CONSUMED` remains deliberately deferred to **03.07** because the approved Architecture defines it as a Partial Unique Index rule.
- **No independent 03.07 query/search/performance index was created.** Constraint-owned PK/UNIQUE backing indexes are allowed and are not 03.07 work.
- New PostgreSQL 17 behavioral integration test:
  - `server/tests/postgresql-inventory-constraints.integration.test.mjs`
- Behavioral coverage proves:
  - Serial uniqueness;
  - Batch uniqueness;
  - Cross-Branch Warehouse rejection on historical Inventory movement context;
  - Warehouse branch-change/delete protection after historical Inventory use;
  - negative On Hand remains permitted;
  - negative Reserved is rejected;
  - Reservation status and positive quantity checks;
  - duplicate active reservations remain possible **only because** their approved Partial Unique rule is still deferred to 03.07;
  - Transfer source Branch/Warehouse context, different source/target Warehouses, document-number uniqueness, and per-Variant transfer-line uniqueness;
  - Stocktake Branch/Warehouse context, approved status vocabulary, document uniqueness, line grain, and exact difference calculation;
  - Inventory Adjustment Branch/Warehouse context, document uniqueness, line grain, and cost integrity;
  - migration history/checksum, idempotent rerun, and verify-only.
- Migration framework and Inventory schema regression were extended through migration `0015`.
- Existing schema regressions were synchronized mechanically through `0015` without changing their domain/business assertions.
- Initial validation run `35121981594` on earlier head `1d704b2f532960718a1c1af640d6dcba3e116f4d` was **not accepted as closure evidence**. Migration Framework succeeded, but the old Core schema regression still expected migrations only through `0014`, so later backend gates were skipped.
- That regression and the remaining hardcoded schema migration lists were updated mechanically to include `0015`; no existing constraint or business assertion was weakened.
- **Final verified SHA:** `b74999fb0e850072d636c3921c4c25aa9f6462e2`.
- **Final CI run:** `35122746771` — SUCCESS on the same final SHA:
  - `verify` — SUCCESS: dependency audit, TypeScript, pagination guard, full tests, printing evidence, security check, production build, release preflight.
  - `backend-verify` — SUCCESS: backend/security/typecheck/unit/transaction checks; PostgreSQL 17 extension/data-type/migration framework; Core, Counterparties, Product, Inventory schema regressions; Core/Counterparty/Product/Inventory behavioral constraint integrations; all later schema regressions through 03.J; backend build; health/readiness/graceful-shutdown smoke.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR #202:** `CLOSED WITHOUT MERGE` on head SHA `b74999fb0e850072d636c3921c4c25aa9f6462e2`.
- No `main` merge, frontend cutover, dual write, Convex Production change, Production data deletion, or 03.07 Index Catalog work occurred.
- 03.06 remains `IN_PROGRESS`; Core, Counterparties/Ledgers, Product Catalog, and Inventory executable slices are now closed.
- 03.07 remains `NOT_STARTED`.

### 03.06.G Sales Constraints

**Status:** `CLOSED`

- Forward migration created:
  - `database/migrations/0016_sales_constraints.sql`
  - `database/migrations/0016_sales_constraints.meta.json`
- Decision record created:
  - `docs/decisions/ADR-0018-phase03-sales-constraints.md`
- Scope is limited to Sales integrity plus closure of the Inventory reservation references that explicitly target Sales entities. No Purchasing/Tax, Finance, Accounting, Repairs, Reporting, or 03.07 index slice was pulled forward.
- Canonical Sales PK / identity constraints now cover:
  - `sales_quotes(id)`
  - `sales_quote_lines(id)`
  - `sales_orders(id)`
  - `sales_order_lines(id)`
  - `sales_order_status_history(id)`
  - `sales_order_shipping_details(sales_order_id)` as the 1:1 grain
  - `sales_order_deliveries(id)`
  - `sales_order_delivery_lines(delivery_id, sales_order_line_id)`
  - `sales_invoices(id)`
  - `sales_invoice_lines(id)`
  - `sales_returns(id)`
  - `sales_return_lines(id)`.
- Mandatory document uniqueness now includes:
  - `sales_quotes(branch_id, document_number)`
  - `sales_orders(branch_id, document_number)`
  - `sales_invoices(branch_id, document_number)`
  - `sales_returns(branch_id, document_number)`.
- Composite same-Branch protection is enforced where required:
  - Sales Order Warehouse must belong to the Sales Order Branch.
  - Sales Invoice Warehouse must belong to the Sales Invoice Branch.
  - Sales Return Warehouse must belong to the Sales Return Branch.
  - source Quote / source SalesOrder / source Invoice context cannot silently cross Branch boundaries.
- Historical/master Sales relationships use `ON DELETE RESTRICT` according to the approved historical-reference policy.
- Cross-row Sales integrity is enforced with DEFERRABLE constraint triggers at transaction commit:
  - every Sales line Variant + ProductUnit pair must belong to the same Product;
  - a Delivery line must belong to the same SalesOrder as its Delivery;
  - a sourced Invoice Delivery must match the Invoice Branch and the supplied source SalesOrder when present;
  - a Sales Return source line must match the Return Branch and supplied source Invoice when present;
  - later parent/source mutations cannot break those historical hierarchies.
- Inventory-deferred Sales references are now closed:
  - `stock_reservations.sales_order_id -> sales_orders(id)`
  - `stock_reservations.sales_order_line_id -> sales_order_lines(id)`
  - active / partially-consumed reservations must match the referenced SalesOrder line Variant and the current SalesOrder Warehouse.
  - changing the SalesOrder Warehouse while active reservations still point to the previous Warehouse is rejected until the reservations are released/replaced.
- Explicit closed-domain CHECK added only where Architecture v1.7 supplied the vocabulary:
  - `sales_invoice_lines.price_source IN ('PRICE_LIST', 'MANUAL')`.
- **No database CHECK vocabulary was invented** for Sales Order status, Delivery status/type, delivery method, or invoice payment status because the authoritative Architecture did not supply a closed value set for those fields in this slice.
- Numeric integrity covers positive document numbers/line quantities, non-negative applicable money/tax/cost fields, positive posted document versions, and the rule that an Invoice with `due_total > 0` requires a Counterparty.
- Deliberate deferrals remain:
  - `sales_invoices(source_delivery_id) WHERE source_delivery_id IS NOT NULL` uniqueness remains **03.07** because Architecture defines it as a Partial Unique Index.
  - active Stock Reservation uniqueness for `ACTIVE / PARTIALLY_CONSUMED` remains **03.07** because it is also an approved Partial Unique Index rule.
  - all independent Sales query/search/performance indexes remain **03.07**.
  - Sales `tax_code_id` foreign keys remain deferred until the **Purchasing / Tax constraint slice** establishes the canonical `tax_codes` PK target.
- New PostgreSQL 17 behavioral integration test:
  - `server/tests/postgresql-sales-constraints.integration.test.mjs`
- Behavioral coverage proves:
  - Sales document-number uniqueness;
  - cross-Branch Warehouse rejection;
  - cross-Branch source Quote rejection;
  - Variant/ProductUnit same-Product enforcement;
  - Stock Reservation SalesOrder/Line/Variant/Warehouse context;
  - active reservations prevent unsafe SalesOrder Warehouse mutation;
  - Delivery line parent-order integrity;
  - Invoice source Delivery/source SalesOrder hierarchy;
  - Due-without-Counterparty rejection;
  - `PRICE_LIST / MANUAL` price-source enforcement;
  - Return source-line hierarchy;
  - positive Return quantity enforcement;
  - existing source hierarchy cannot be broken by later source-line mutation;
  - the approved source-Delivery and active-reservation Partial Unique rules remain deliberately absent until 03.07;
  - migration history/checksum, idempotent rerun, and verify-only.
- Migration framework and Sales schema regression were extended through migration `0016`.
- Existing Core, Counterparties, Product, Inventory, Purchasing, Finance, Accounting, Repairs, and Reporting regressions were synchronized through `0016` without weakening their business/domain assertions.
- Inventory behavioral fixture was updated to create a real SalesOrder and SalesOrderLine before Reservation tests, because `0016` correctly makes those Sales references real foreign keys.
- Validation run `35136956138` on head `8d1e89a4e0a3ab2ce636b38c80676ea31fb411e5` was **not accepted as closure evidence**. The migration applied, but test teardown still attempted to drop Sales tables before removing the new Stock Reservation → Sales foreign keys.
- Test cleanup was corrected to release those Sales-owned cross-domain FKs before teardown.
- Validation run `35137117362` on head `6de1d624b7d9813f34f726bdcfc4f8fbe4a3a329` was **not accepted as closure evidence**. Migration Framework and earlier regressions passed, but the pre-0016 Inventory reservation fixture still used fake Sales IDs and was correctly rejected by the new foreign keys.
- The Inventory fixture was corrected by seeding valid Sales parent rows; no new FK, Sales constraint, or previous Inventory assertion was weakened.
- **Final verified SHA:** `59c0d07bf655ac9516df6c1ccf9ac36aa48ec83e`.
- **Final CI run:** `35137576373` — SUCCESS on the same final SHA:
  - `verify` — SUCCESS: dependency audit, TypeScript, pagination guard, full tests, printing evidence, security check, production build, release preflight.
  - `backend-verify` — SUCCESS: backend/security/typecheck/unit/transaction checks; PostgreSQL 17 extension/data-type/migration framework; Core, Counterparties, Product, Inventory and Sales schema regressions; Core/Counterparty/Product/Inventory/Sales behavioral constraint integrations; Purchasing, Finance, Accounting, Repairs and Reporting regressions; backend build; health/readiness/graceful-shutdown smoke.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR #203:** `CLOSED WITHOUT MERGE` on head SHA `59c0d07bf655ac9516df6c1ccf9ac36aa48ec83e`.
- No `main` merge, frontend cutover, dual write, Convex Production change, Production data deletion, or 03.07 Index Catalog work occurred.
- 03.06 remains `IN_PROGRESS`; Core, Counterparties/Ledgers, Product Catalog, Inventory, and Sales executable slices are now closed.
- 03.07 remains `NOT_STARTED`.

### 03.06.H Purchasing / Tax Constraints

**Status:** `CLOSED`

- Forward migration:
  - `database/migrations/0017_purchasing_tax_constraints.sql`
  - `database/migrations/0017_purchasing_tax_constraints.meta.json`
- Decision record:
  - `docs/decisions/ADR-0019-phase03-purchasing-tax-constraints.md`
- Scope was limited to Purchasing / Tax integrity and the four Sales tax references explicitly deferred by migration `0016`.
- Canonical keys and uniqueness now include:
  - `tax_codes(id)` primary key.
  - `tax_codes(code)` unique.
  - `purchase_invoices(id)` primary key.
  - `purchase_invoices(branch_id, document_number)` unique.
  - `purchase_invoice_lines(id)` primary key.
  - `purchase_returns(id)` primary key.
  - `purchase_returns(branch_id, document_number)` unique.
  - `purchase_return_lines(id)` primary key.
- Composite same-Branch protection is enforced for Purchase Invoice and Purchase Return Warehouse references through `(warehouse_id, branch_id)` integrity.
- Historical/master Purchasing references use `ON DELETE RESTRICT` in accordance with Architecture v1.7 historical referential policy.
- Purchase Invoice lines enforce Variant + ProductUnit same-Product integrity with a DEFERRABLE constraint trigger.
- Linked Purchase Return lines enforce source PurchaseInvoice / source line / Branch / Variant hierarchy using DEFERRABLE constraint triggers.
- Later mutation of a Purchase Return header or source PurchaseInvoice line cannot silently break an existing linked Return source hierarchy.
- Purchase Invoice `due_total > 0` requires a Counterparty; full cash Purchase Invoices may remain Counterparty-optional as defined by the architecture.
- Positive/non-negative numeric integrity is enforced for applicable Purchasing document numbers, versions, quantities, commercial amounts, tax amounts, landed costs and snapshots.
- `purchase_return_lines.cost_variance` remains signed by design and is deliberately not constrained to non-negative values.
- `tax_codes.rate` is constrained non-negative.
- No closed `tax_type` CHECK was invented. Architecture v1.7 names VAT14 / VAT0 / EXEMPT as supported models but does not define a closed technical vocabulary.
- No closed `payment_status` CHECK was invented because Architecture v1.7 does not define a closed database vocabulary for that field.
- The four Sales `tax_code_id` foreign keys deferred by `0016` are now closed against canonical `tax_codes(id)`:
  - `sales_quote_lines.tax_code_id`
  - `sales_order_lines.tax_code_id`
  - `sales_invoice_lines.tax_code_id`
  - `sales_return_lines.tax_code_id`
- Purchase Returnable Quantity was **not** implemented as a cross-row aggregate CHECK/trigger. The approved concurrency contract remains future Purchasing posting-service enforcement:
  - lock original `purchase_invoice_line` with `SELECT ... FOR UPDATE`;
  - recompute already-posted returned quantity in the same transaction;
  - validate the new return quantity before posting.
- No independent Purchasing / Tax query, search, performance or partial index was introduced. Those remain strictly Phase 03.07.
- PostgreSQL 17 behavioral integration:
  - `server/tests/postgresql-purchasing-tax-constraints.integration.test.mjs`
- Behavioral coverage includes:
  - duplicate Tax Code rejection;
  - negative tax-rate rejection while allowing non-closed custom `tax_type` values;
  - Purchase Invoice document-number uniqueness;
  - cross-Branch Warehouse rejection;
  - Due-without-Counterparty rejection;
  - Purchase Invoice Variant/ProductUnit same-Product protection;
  - Purchase Return source hierarchy and source-line protection;
  - positive quantity and non-negative applicable monetary/tax/cost fields;
  - closure of deferred Sales tax-code foreign keys;
  - preservation of 03.07 index deferrals;
  - migration history/checksum, idempotent rerun and verify-only behavior.
- CI workflow explicitly gates `PostgreSQL purchasing/tax constraint integration tests` inside `backend-verify`.
- Diagnostic CI run `35142400969` on head `67848491cd7a3cf813699b9798b3e85fd824481c` was **not accepted as closure evidence**:
  - Migration Framework, prior Core/Counterparty/Product regressions and general `verify` passed.
  - `backend-verify` stopped at the Inventory behavioral regression because that older test still asserted migration `0016` was the latest migration.
  - Actual database history correctly returned `0017`; this was a stale test-contract expectation, not a Purchasing/Tax DDL or business-rule failure.
- The Inventory regression was synchronized without weakening any Inventory rule:
  - it still verifies migration `0015 = inventory_constraints`;
  - it now verifies the latest migration is `0017 = purchasing_tax_constraints`;
  - migration checksum validation remains enforced.
- **Final verified SHA:** `74a586404960d7fe1f66b935e8810dbac8fcba9d`.
- **Final CI run:** `35151573780` — SUCCESS on the same final SHA:
  - `verify` — SUCCESS: dependency audit, TypeScript, pagination guard, full tests, printing evidence, security check, production build and release preflight.
  - `backend-verify` — SUCCESS: backend security/typecheck/unit; transaction helper/unit/PG integration; PostgreSQL 17 extensions/data types/migration framework; Core, Counterparties, Product, Inventory, Sales and Purchasing/Tax schema/constraint regressions; Finance, Accounting, Repairs and Reporting schema regressions; backend build; health/readiness/graceful-shutdown smoke.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR #204:** `CLOSED WITHOUT MERGE` on head SHA `74a586404960d7fe1f66b935e8810dbac8fcba9d`.
- No merge to `main`, no frontend cutover, no dual write, no Convex Production change, no Production data deletion and no 03.07 Index Catalog work occurred.
- 03.06 remains `IN_PROGRESS`; Core, Counterparties/Ledgers, Product Catalog, Inventory, Sales and Purchasing/Tax executable slices are now closed.
- 03.07 remains `NOT_STARTED`.

### 03.06.I Finance / Settlement Constraints

**Status:** `CLOSED`

- Forward migration:
  - `database/migrations/0018_finance_settlement_constraints.sql`
  - `database/migrations/0018_finance_settlement_constraints.meta.json`
- Decision record:
  - `docs/decisions/ADR-0020-phase03-finance-settlement-constraints.md`
- Scope was limited to Finance / Treasury / Settlement relational integrity.
- Canonical primary keys now cover:
  - `treasuries`
  - `receipts`
  - `disbursements`
  - `finance_categories`
  - `treasury_transfers`
  - `financial_movements`
  - `treasury_balance_positions`
  - `financial_allocations`
  - `customer_advances`
  - `advance_applications`
  - `cheques`
  - `installment_plans`
  - `installments`
- Same-Branch Treasury context is enforced for Receipts, Disbursements, Treasury Transfers, Financial Movements and Cheque settlement movements using composite relational integrity.
- Finance document numbers are unique in their approved Branch scope:
  - `receipts(branch_id, document_number)`
  - `disbursements(branch_id, document_number)`
  - `treasury_transfers(issuing_branch_id, document_number)`
- Treasury Transfers reject `from_treasury_id = to_treasury_id`.
- Financial Movements enforce `direction IN ('IN','OUT')` and positive movement amount.
- `treasury_balance_positions.current_balance` deliberately remains signed; only the lock/projection version is constrained non-negative.
- Finance Categories enforce `category_type IN ('INCOME','EXPENSE')`.
- Financial Allocation integrity:
  - amount must be positive;
  - logical uniqueness is enforced across `(financial_source_type, financial_source_id, target_type, target_id)`;
  - no fake PostgreSQL FK was introduced for polymorphic source/target pairs.
- Customer Advance integrity:
  - `customer_advances(receipt_id)` is unique;
  - original amount must be positive;
  - `remaining_amount_projection` must remain within `0..original_amount`;
  - multiple Advance Applications remain structurally allowed;
  - each Advance Application amount must be positive.
- Cheque integrity:
  - direction = `RECEIVABLE / PAYABLE`;
  - status = `PENDING / CLEARED / BOUNCED / CANCELLED`;
  - amount positive;
  - linked settlement Financial Movement must belong to the same Branch.
- Installment integrity uses the versioned ADR-0017 canonical V1 status vocabulary:
  - `UPCOMING`
  - `DUE`
  - `PARTIAL`
  - `PAID`
  - `OVERDUE`
- Conflicting legacy vocabulary `PENDING / PARTIALLY_PAID` is rejected by PostgreSQL.
- Installment amount must be positive and `paid_amount_projection` must remain within `0..amount`.
- `finance_categories.gl_account_id -> gl_accounts(id)` is deliberately deferred to the **Accounting constraint slice**, where the canonical Accounting PK/FK layer is established. The Finance migration does not invent or partially own Accounting integrity.
- The following are deliberately **not** implemented in 0018 because Architecture v1.7 assigns them to the closed Index Catalog / Phase 03.07:
  - case-normalized Treasury name uniqueness such as `lower(name)`;
  - transfer-leg partial uniqueness;
  - Finance/Treasury query, search, partial or expression indexes.
- The following remain backend transaction rules for later Finance implementation and were not replaced by unsafe aggregate triggers:
  - active Treasury validation;
  - deterministic Treasury lock ordering;
  - over-allocation prevention;
  - cheque/installment double-settlement prevention;
  - posting effects and projection updates.
- PostgreSQL 17 behavioral integration:
  - `server/tests/postgresql-finance-settlement-constraints.integration.test.mjs`
- Behavioral coverage includes:
  - Finance constraint catalog existence;
  - Branch/Treasury mismatch rejection;
  - duplicate Finance document-number rejection;
  - transfer same-Treasury rejection;  - invalid direction/category/cheque/status rejection;
  - signed Treasury balance preservation;
  - Financial Allocation uniqueness and positive amounts;
  - no fake polymorphic source/target FKs;
  - Customer Advance receipt uniqueness and projection bounds;
  - multiple positive Advance Applications allowed;
  - canonical Installment status acceptance and conflicting status rejection;
  - paid projection bounds;
  - explicit proof that case-normalized Treasury-name uniqueness remains deferred to 03.07;
  - migration checksum, idempotent rerun and verify-only behavior.
- Existing historical schema/regression tests were synchronized through migration `0018` without weakening their domain contracts:
  - Migration Framework
  - Core / Organization / Security schema
  - Counterparties schema
  - Product Catalog schema
  - Inventory behavioral history
  - Purchasing / Tax schema
  - Purchasing / Tax behavioral history
  - Accounting schema
  - Repairs / Follow-Up / Notifications schema
- Earlier CI attempts were treated as **diagnostic only**, never closure evidence. They exposed stale migration-history/cleanup assumptions in prior tests after adding the new FK layer; those contracts were updated without weakening approved constraints.
- Finance schema + Finance behavioral integration reached SUCCESS before downstream historical-regression cleanup was completed.
- **Final verified SHA:** `561e268bd3805fa51af20f39247a198525ac20f5`.
- **Final CI run:** `35155091670` — SUCCESS on the same final SHA:
  - `verify` — SUCCESS: dependency audit, TypeScript, pagination guard, full tests, printing evidence, security check, production build and release preflight.
  - `backend-verify` — SUCCESS: backend security/typecheck/unit; transaction helper/unit/PG integration; PostgreSQL 17 extensions/data types/migration framework; Core, Counterparties, Product, Inventory, Sales, Purchasing/Tax and Finance schema/behavioral regressions; Accounting, Repairs and Reporting schema regressions; backend build; health/readiness/graceful-shutdown smoke.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR #205:** `CLOSED WITHOUT MERGE` on head SHA `561e268bd3805fa51af20f39247a198525ac20f5`.
- No merge to `main`, no frontend cutover, no dual write, no Convex Production change, no Production data deletion and no 03.07 Index Catalog work occurred.
- 03.06 remains `IN_PROGRESS`; Core, Counterparties/Ledgers, Product Catalog, Inventory, Sales, Purchasing/Tax and Finance/Settlement executable slices are now closed.
- 03.07 remains `NOT_STARTED`.

### 03.06.J Accounting Constraints

**Status:** `CLOSED`

- Forward migration:
  - `database/migrations/0019_accounting_constraints.sql`
  - `database/migrations/0019_accounting_constraints.meta.json`
- Decision record:
  - `docs/decisions/ADR-0021-phase03-accounting-constraints.md`
- Scope was limited strictly to Accounting relational integrity plus the Finance → GL Account FK explicitly deferred from the previous Finance slice.
- Canonical primary keys now cover:
  - `gl_accounts`
  - `journal_entries`
  - `journal_lines`
- `gl_accounts(company_id, code)` is enforced as the approved ordinary uniqueness rule.
- Historical/master Accounting references use `ON DELETE RESTRICT`:
  - `gl_accounts.company_id -> companies.id`
  - `gl_accounts.parent_id -> gl_accounts.id`
  - `journal_entries.branch_id -> branches.id`
  - `journal_entries.posting_batch_id -> posting_batches.id`
  - `journal_entries.reversal_of_entry_id -> journal_entries.id`
  - `journal_entries.created_by -> users.id`
  - `journal_lines.journal_entry_id -> journal_entries.id`
  - `journal_lines.gl_account_id -> gl_accounts.id`
  - optional `journal_lines.counterparty_id -> counterparties.id`
- The Finance relationship deliberately deferred by migration `0018` is now closed:
  - `finance_categories.gl_account_id -> gl_accounts.id`
- Journal line row-level integrity:
  - `debit >= 0`
  - `credit >= 0`
  - debit and credit cannot both be positive on the same line.
- No stronger row rule was invented: a `0 / 0` JournalLine is not rejected by this slice because Architecture Baseline v1.7 does not require “exactly one side must be positive”.
- The existing `ct_journal_entries__balanced_at_commit` mechanism remains unchanged:
  - constraint trigger
  - `DEFERRABLE`
  - `INITIALLY DEFERRED`
  - full JournalEntry balance is validated at COMMIT.
- `journal_entries.posting_batch_id` deliberately remains non-unique.
- No conventional FK was invented for polymorphic `journal_entries.source_type / source_id`.
- No closed CHECK vocabulary was invented for `gl_accounts.account_type`.
- No same-company parent-account rule or Branch-to-GL-account composite rule was invented because neither is an approved Accounting invariant in this constraint slice.
- Independent Accounting query/search/performance indexes remain Phase `03.07`; migration `0019` introduces no speculative Accounting index.
- Business posting, account mapping selection, immutable-posting command behavior and Reversal/Correction workflows remain later backend transaction responsibilities.
- PostgreSQL 17 behavioral integration:
  - `server/tests/postgresql-accounting-constraints.integration.test.mjs`
- Behavioral coverage includes:
  - Accounting PK/FK/UNIQUE/CHECK catalog verification;
  - preservation of the deferred Journal balance trigger;
  - duplicate GL account code rejection inside one Company;
  - the same GL code remaining valid in a different Company;
  - direct FK violation rejection;
  - Finance Category → GL Account integrity;
  - negative debit rejection;
  - negative credit rejection;
  - double-sided positive debit/credit rejection;
  - valid balanced multi-line Journal commit;
  - unbalanced Journal rejection specifically at COMMIT;
  - proof that a PostingBatch may back more than one JournalEntry;
  - proof that no fake source FK exists;
  - proof that custom `account_type` values are not rejected by an invented closed vocabulary;
  - proof that independent Accounting indexes remain deferred to 03.07;
  - migration checksum, idempotent rerun and verify-only behavior.
- Existing historical schema/regression tests were synchronized through migration `0019` without weakening their business/domain contracts:
  - Migration Framework
  - Core schema regression
  - Counterparties schema regression
  - Product Catalog schema regression
  - Inventory behavioral history
  - Purchasing / Tax schema and behavioral history
  - Finance schema and behavioral regression
  - Accounting schema regression
  - Repairs / Follow-Up / Notifications schema regression
- Earlier CI runs were diagnostic only. They exposed stale migration-history assumptions after adding `0019`; those tests were synchronized rather than weakening the Accounting migration.
- **Final verified SHA:** `ef03d141958c392032bd8caf16b5f880a193e86e`.
- **Final CI run:** `35224498880` — SUCCESS on the same final SHA:
  - `verify` — SUCCESS: dependency audit, TypeScript, pagination guard, full tests, printing evidence, security check, production build and release preflight.
  - `backend-verify` — SUCCESS: backend security/typecheck/unit; transaction helper/unit/PostgreSQL integration; PostgreSQL 17 extensions/data types/migration framework; Core, Counterparties, Product, Inventory, Sales, Purchasing/Tax, Finance/Settlement, Accounting schema regressions; new Accounting behavioral constraint gate; Repairs and Reporting regressions; backend build; health/readiness/graceful-shutdown smoke.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR #206:** `CLOSED WITHOUT MERGE` on head SHA `ef03d141958c392032bd8caf16b5f880a193e86e`.
- No merge to `main`, no frontend cutover, no dual write, no Convex Production change, no Production data deletion and no 03.07 Index Catalog work occurred.
- 03.06 remains `IN_PROGRESS`; Core, Counterparties/Ledgers, Product Catalog, Inventory, Sales, Purchasing/Tax, Finance/Settlement and Accounting executable slices are now closed.
- 03.07 remains `NOT_STARTED`.

### 03.06.K Repairs / Follow-Up / Notifications Constraints

**Status:** `CLOSED`

- Forward migration:
  - `database/migrations/0020_repairs_followup_notifications_constraints.sql`
  - `database/migrations/0020_repairs_followup_notifications_constraints.meta.json`
- Decision record:
  - `docs/decisions/ADR-0022-phase03-repairs-followup-notifications-constraints.md`
- Scope was limited strictly to Repairs / Follow-Up / Notifications relational integrity. No Printing/Reporting constraint slice or 03.07 performance-index slice was pulled forward.
- Canonical primary keys now cover the 12 relations from migration `0010`, including preservation of `followup_status_history(id)` as its physical primary-key identity.
- Repair business-document uniqueness is enforced by `(branch_id, document_number)`.
- Historical/business references use `ON DELETE RESTRICT` so Repair timelines, assignments, issue reports, customer decisions, Follow-Up history, Notifications and recipient state cannot be destroyed by parent deletion.
- The approved Repair status vocabulary is enforced across RepairOrder/status history:
  - `WAITING`
  - `HANDED_TO_TECHNICIAN`
  - `IN_REPAIR`
  - `NEW_PROBLEM`
  - `CUSTOMER_APPROVED`
  - `TECHNICIAN_REJECTED`
  - `CUSTOMER_REJECTED`
  - `REPAIRED`
  - `DELIVERED`
- Customer repair decision is constrained to `APPROVED | REJECTED`, with one decision per `repair_issue_report_id`.
- Follow-Up `source_type` is constrained to `SALES_ORDER | REPAIR_ORDER | MANUAL`.
- `customer_followups.source_type/source_id` and `notifications.source_type/source_id` remain intentionally polymorphic; no fake conventional FK was added.
- Non-null automatic Follow-Up `source_event_id` and Notification `outbox_event_id` reference `outbox_events(id)` with restrictive FKs.
- The following Baseline-defined **integrity** partial uniqueness rules are part of 03.06 and are now enforced:
  - one active RepairAssignment per RepairOrder: `uq_repair_assignments__active` where `ended_at IS NULL`;
  - one automatic Follow-Up per non-null source Outbox Event: `uq_customer_followups__source_event`;
  - one Notification per `(outbox_event_id, notification_type)` when `outbox_event_id IS NOT NULL`: `uq_notifications__outbox_event_type`.
- `notification_recipients(notification_id, user_id)` is protected as the canonical recipient-state identity.
- No closed CHECK vocabulary was invented for Follow-Up priority/status/type/action/result, template language/event keys, or notification type/event because Architecture Baseline v1.7 does not close those technical vocabularies.
- Business command/transaction effects such as `NEW_PROBLEM` atomic issue creation, customer-decision side effects, notification delivery and Follow-Up command behavior remain later backend responsibilities.
- All remaining Repairs / Follow-Up / Notifications query/search/performance indexes remain Phase `03.07`.
- PostgreSQL 17 behavioral integration:
  - `server/tests/postgresql-repairs-followup-notifications-constraints.integration.test.mjs`
- Behavioral coverage proves:
  - PK/FK/UNIQUE/CHECK catalog integrity;
  - all nine canonical Repair statuses accepted and invalid statuses rejected;
  - customer decision vocabulary and one-decision-per-issue uniqueness;
  - Follow-Up source vocabulary;
  - one active technician assignment;
  - automatic Follow-Up source-event retry deduplication;
  - Notification outbox-event/type retry deduplication;
  - recipient uniqueness;
  - historical deletion protection;
  - absence of fake polymorphic source FKs;
  - preservation of `followup_status_history(id)` PK;
  - only the three approved integrity partial unique indexes exist before 03.07;
  - migration checksum, idempotent rerun and verify-only behavior.
- Earlier CI attempts were diagnostic only. They exposed stale migration-history assertions in historical regressions after adding `0020`; those assertions were synchronized to the new migration head without weakening any prior business/domain constraint.
- **Final verified SHA:** `e7e6c2c63f81913a6c16d15168209c882db29426`.
- **Final CI run:** `35241250197` (Run `#921`) — SUCCESS on the same final SHA:
  - `verify` — SUCCESS: dependency audit, TypeScript, pagination guard, full tests, printing evidence, security check, production build and release preflight.
  - `backend-verify` — SUCCESS: backend security/typecheck/unit; transaction helper/unit/PostgreSQL integration; PostgreSQL 17 extensions/data types/migration framework; Core, Counterparties, Product, Inventory, Sales, Purchasing/Tax, Finance/Settlement and Accounting schema/behavioral regressions; Repairs / Follow-Up / Notifications schema integration; dedicated Repairs / Follow-Up / Notifications behavioral constraint integration; 03.J Printing/Reporting schema regression; backend build; health/readiness/graceful-shutdown smoke.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR #207:** `CLOSED WITHOUT MERGE` on head SHA `e7e6c2c63f81913a6c16d15168209c882db29426`.
- No merge to `main`, no frontend cutover, no dual write, no Convex Production change, no Production data deletion and no 03.07 Index Catalog work occurred.
- 03.06 remains `IN_PROGRESS`; Core, Counterparties/Ledgers, Product Catalog, Inventory, Sales, Purchasing/Tax, Finance/Settlement, Accounting and Repairs/Follow-Up/Notifications executable slices are now closed.
- 03.07 remains `NOT_STARTED`.

### 03.06.L Printing / Export / Reporting Read Models Constraints

**Status:** `CLOSED`

- Final forward-only migration:
  - `database/migrations/0021_printing_export_reporting_read_models_constraints.sql`
  - `database/migrations/0021_printing_export_reporting_read_models_constraints.meta.json`
- Decision record:
  - `docs/decisions/ADR-0023-phase03-printing-reporting-constraints.md`
- Scope remained limited to Printing / Export / Reporting Read Models integrity only:
  - `print_templates`
  - `branch_print_defaults`
  - `reporting_daily_branch_metrics`
  - `reporting_inventory_balances`
  - `reporting_counterparty_balances`
  - `reporting_treasury_balances`
  - `reporting_followup_metrics`
- `print_templates.paper_size` is constrained to the approved V1 vocabulary: `A4 | A3 | THERMAL_80 | THERMAL_57`.
- `branch_print_defaults(branch_id, document_type)` is the canonical normalized default-print map under ADR-0016. The legacy `branch_settings.default_sales_print_template_id` and `default_purchase_print_template_id` remain compatibility references only and are protected by optional FKs with `ON DELETE SET NULL`.
- Reporting read-model grains and dimension FKs were added as approved; `reporting_inventory_balances` also enforces Branch+Warehouse context integrity.
- Follow-Up reporting counts are constrained non-negative; signed reporting balances, stock, profit and similar projections were intentionally not given blanket non-negative CHECKs because signed values can be valid.
- Reporting tables remain synchronous/rebuildable read projections, not Historical Sources of Truth.
- No Export job/history tables or export engine were invented during 03.06.
- No closed vocabulary was invented for `document_type` or reporting `source_type` beyond what Architecture Baseline v1.7 explicitly closes.
- No independent query/search/performance indexes were added; Phase 03.07 remains separate. Constraint-backed PK/UNIQUE indexes are not treated as 03.07 work.
- PostgreSQL 17 behavioral integration test:
  - `server/tests/postgresql-printing-export-reporting-read-models-constraints.integration.test.mjs`
- CI explicitly runs both the 03.J physical-schema regression and the dedicated 03.06 Printing/Reporting behavioral constraint gate.
- Behavioral coverage verifies, among other items:
  - accepted/rejected paper-size values;
  - print-default grain uniqueness and FK behavior;
  - compatibility `SET NULL` behavior;
  - reporting primary grains and dimension FKs;
  - Branch+Warehouse rejection for mismatched reporting inventory rows;
  - acceptance of legitimate signed projections;
  - non-negative Follow-Up counts;
  - absence of invented Export tables;
  - absence of independent 03.07 indexes;
  - migration checksum, idempotent rerun and verify-only behavior.
- Earlier validation runs were diagnostic only. They exposed historical tests whose sole stale assumption was that migration `0020` remained the migration head. Those migration-history assertions were synchronized through `0021` without weakening any Core, Counterparty, Product, Inventory, Sales, Purchasing/Tax, Finance, Accounting, Repairs, Printing or Reporting business/integrity rule.
- A transient legacy Printing acceptance process exit occurred once and then passed unchanged on subsequent runs; no printing implementation was weakened or modified to mask it.
- Validation run `35251252763` (Run `#934`) was fully green on SHA `cfb7a8e76db501ac6fec7debe304c371501aa340`, including the new PostgreSQL 17 Printing/Reporting behavioral gate.
- The branch then advanced by one technical no-content commit; GitHub compare from `cfb7a8e76db501ac6fec7debe304c371501aa340` to the final SHA reported `files: []`. In order to preserve the same-final-SHA Definition of Done, all CI gates were rerun rather than reusing the earlier green run.
- **Final verified SHA:** `abe8587ef7a08cdb607e283ad01937bc9332247c`.
- **Final CI run:** `35251535466` (Run `#935`) — SUCCESS on the same final SHA:
  - `verify` — SUCCESS: dependency audit, TypeScript, pagination guard, Full Tests, printing evidence, security check, production build and release preflight.
  - `backend-verify` — SUCCESS: backend security/typecheck/unit, transaction helper/unit/PostgreSQL integration, PostgreSQL 17 extensions/data types/migration framework, all schema and behavioral regressions through Repairs, Printing/Export/Reporting schema integration, dedicated Printing/Export/Reporting behavioral constraint integration, backend build, health/readiness and graceful-shutdown smoke.
  - `browser-contract` — SUCCESS.
  - `release-gate` — SUCCESS.
- **Validation PR #208:** `CLOSED WITHOUT MERGE` on final head SHA `abe8587ef7a08cdb607e283ad01937bc9332247c`; `merged=false`.
- No merge to `main`, no frontend cutover, no dual write, no Convex Production change and no Production data deletion occurred.
- **Phase 03.06 Constraints is now CLOSED.**
- Phase 03.07 has not been implemented yet.

**Next Action — one action only:** begin Phase **03.07 Index Catalog** with a documentation/ADR blocker-resolution pass for the two §28.6 references that do not exist in the approved physical schema — `receipts.sales_order_id` and `advance_applications.posting_batch_id`. Reconcile those two catalog lines against Architecture Baseline v1.7 §25.12 and migration `0008` before creating any index migration; do not invent columns merely to satisfy the index catalog.


## 03.07 Index Catalog

**Status:** `CLOSED`

تطبيق §28 حرفيًا بعد تطبيق التصحيحات المعمارية versioned المعتمدة:

- no duplicate PK indexes.
- no redundant prefix indexes.
- exact predicates للـpartial indexes.
- GIN trigram فقط على approved name search columns.
- no speculative indexes.

### 03.07.A Pre-DDL Catalog / Physical-Schema Reconciliation

**Status:** `CLOSED`

- تم اعتماد `ADR-0024 — Phase 03.07 Index Catalog / Physical-Schema Reconciliation`.
- تم حسم تعارض `receipts.sales_order_id`: العمود غير موجود في §25.12 ولا migration `0008`، والعلاقة canonical بالـSalesOrder موجودة على `customer_advances.sales_order_id` مع ربط الإيصال عبر `customer_advances.receipt_id`. لذلك لا يضاف العمود ولا ينفذ index `receipts(sales_order_id)`; سطر §28.6 مصنف Catalog Defect.
- تم حسم تعارض `advance_applications.posting_batch_id`: العمود غير موجود في §25.12 ولا migration `0008`، وتطبيق العربون لا ينشئ FinancialMovement جديدًا. لذلك لا يضاف العمود ولا ينفذ index `advance_applications(posting_batch_id)`; سطر §28.6 مصنف Catalog Defect.
- لا تغيير على Physical Schema ولا إعادة كتابة migrations قديمة.
- لا Index Migration تم إنشاؤها في هذه الخطوة.
- ADR-0017 يظل ملزمًا لتصحيح Installment open-status predicate.
- ADR-0020 يظل ملزمًا لسلامة AdvanceApplication history وعدم اختراع uniqueness يزيل إمكانية reversal/re-application history.

### 03.07.B Exact Index Inventory Freeze

**Status:** `CLOSED`

- تم إنشاء وتجميد `docs/gap-analysis/phase-03-07-index-inventory.md`.
- تمت مراجعة §28 كاملة مقابل migrations الحالية حتى `0021`.
- Frozen totals:
  - `74` = `ALREADY_SATISFIED`.
  - `155` = `CREATE_IN_03_07`.
  - `2` = `OMITTED_BY_ADR` (ADR-0024).
  - `0` = `BLOCKED`.
  - `231` = إجمالي قرارات/بنود الـCatalog المصنفة.
- قاعدة No Redundant Prefix Indexes طُبقت أثناء التجميد؛ مثال: لا يتم إنشاء `financial_allocations(financial_source_type, financial_source_id)` لأن الـUNIQUE الحالي `(financial_source_type, financial_source_id, target_type, target_id)` يبدأ بنفس الـprefix ويغطي lookup المعتمد.
- `counterparties.normalized_phone` هو اسم العمود canonical المستخدم للبحث بالهاتف.
- ADR-0017 مطبق على Installment open-items predicate باستخدام `UPCOMING / DUE / PARTIAL / OVERDUE`.
- لا Index Migration تم إنشاؤها في هذه الخطوة.

### 03.07.C Forward Index Migration & Exact Catalog Verification

**Status:** `CLOSED`

- تم إنشاء Forward-only migration واحدة: `database/migrations/0022_index_catalog.sql`.
- تم إنشاء executable manifest: `database/index-catalog/phase-03-07-indexes.json`.
- الـMigration تنشئ **155 Index بالضبط** من الـFrozen Inventory، بدون أي Index إضافي.
- أسماء الـIndexes deterministic وفق ADR-0002 باستخدام `ix_` / `ux_` / `gin_`، ومع stable hash عند تجاوز حد PostgreSQL للاسم.
- ADR-0017 مطبق على open installments predicate: `UPCOMING / DUE / PARTIAL / OVERDUE`.
- ADR-0024 مطبق: لا `receipts.sales_order_id` index ولا `advance_applications.posting_batch_id` index.
- PostgreSQL 17 exact catalog test: `server/tests/postgresql-index-catalog.integration.test.mjs`.
- الاختبار يثبت الاسم، الجدول، access method، uniqueness، key/expression order، DESC direction، non-default opclass مثل `gin_trgm_ops`، predicates، غياب أي independent index غير معتمد، وعدم وجود redundant general B-Tree prefix indexes.
- Migration framework محدث حتى `0022/index_catalog` مع checksum drift / idempotent rerun / verify-only.
- الـBehavioral regressions تم تحديثها لإثبات تفعيل قواعد 03.07 فعليًا: case-insensitive User/Treasury uniqueness، SKU partial unique، active reservation uniqueness، وInvoice-per-Delivery uniqueness.
- Diagnostic runs `#938` و`#939` و`#940` كشفت فقط stale regression / catalog-reader gaps وتم تصحيح الاختبارات بدون تغيير الـ155 Index المعتمدة.
- Implementation validation Run `#941` / `35303952439` — SUCCESS على code SHA `ba7eda5ee52f4b021d0afa36b7ab71653d0adb69`: `verify`, `backend-verify` بما فيه exact index-catalog gate، `browser-contract`, و`release-gate` جميعها SUCCESS.
- لا Partitioning، لا Index speculative، لا تعديل على Historical Sources of Truth، ولا Backend/Frontend cutover.

**Next Action:** `03.08 DDL Verification` فقط.

## 03.08 DDL Verification Suite

**Status:** `CLOSED`

Verification-only strategy: لا نكرر DDL أو Constraints أو Indexes المقفولة في 03.06/03.07. تم توثيق الـcoverage في `docs/gap-analysis/phase-03-08-ddl-verification.md`، وتظل الاختبارات القائمة هي الدليل التنفيذي للبنود التي تغطيها بالفعل.

اختبارات آلية تشمل:

- duplicate username case-insensitive rejection — covered by the dedicated 03.08 integrated gate.
- duplicate email case-insensitive rejection — covered by the dedicated 03.08 integrated gate.
- duplicate branch code rejection — reused from the existing Core/Organization/Security constraint suite.
- cross-branch warehouse references rejection — reused from existing Core/Inventory/Sales constraint suites.
- cross-product unit references rejection — reused from the existing Product Catalog constraint suite.
- duplicate barcode/SKU/serial rules — reused from Product/Inventory constraints + exact 03.07 catalog.
- active reservation uniqueness — reused from Inventory/Sales constraints + exact 03.07 catalog.
- document number uniqueness — reused from existing domain constraint suites.
- tombstone uniqueness — reused from the Core constraint suite.
- invalid negative values rejection — reused from existing domain constraints; permission-gated negative stock remains intentionally outside a global CHECK.
- journal line validation — reused from Accounting constraints.
- journal deferred balance failure at COMMIT — reused from Accounting constraints.
- valid journal commit — reused from Accounting constraints.
- delete restriction on historical entities — reused from existing historical-FK/delete restriction tests.
- no direct PostgreSQL client exposure — covered by the dedicated 03.08 deployment contract test.

New executable gate: `server/tests/postgresql-ddl-verification.integration.test.mjs`.

### Gate 03

- [x] clean DB builds from zero.
- [x] all migrations apply in order.
- [x] schema verification passes.
- [x] index catalog matches v1.7.
- [x] no extra unexplained index.
- [x] no direct PostgreSQL exposure to client network.

**03.08 Implementation Validation:** Run `#944` / `35372123130` — SUCCESS على code SHA `18f9b39a7a113a72dc71bb3f5092027506a6ec28`. `verify`, `backend-verify`, PostgreSQL 17 Phase 03.08 DDL verification gate, `browser-contract`, و`release-gate` كلها SUCCESS.  
**03.08 Validation PR:** `#212` — validation-only؛ يغلق WITHOUT MERGE بعد نجاح Full CI النهائي على documentation closure SHA.  
**Scope confirmation:** لا migration `0023`، لا Index جديد، لا Business Backend، لا Module Cutover، لا dual write، ولا Convex Production change.  
**Next Action بعد final same-SHA closure validation:** `PHASE 04 / 04.01 Idempotency Service` فقط.

---

# 10. PHASE 04 — Core Infrastructure Services

**Status:** `CLOSED`

## 04.01 Idempotency Service

**Status:** `CLOSED`

Implemented and verified:

- claim key at transaction start.
- canonical request hash.
- same key + same payload returns existing result/state.
- same key + different payload rejects.
- incomplete/rolled-back business transaction does not create phantom success.
- expiry cleanup mechanism.
- PostgreSQL 17 eight-way parallel same-key execution proves one logical business execution.
- Existing `idempotency_keys` schema, `UNIQUE(key)`, and frozen `expires_at` index reused unchanged; no migration/index added.

**04.01 Implementation SHA:** `c39f99f7f16c95b099d157e3c784c6b5453c5eb1`.  
**04.01 Implementation CI:** Run `#946` / `35377090817` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 Idempotency Service integration, `browser-contract`, and `release-gate` all SUCCESS.  
**04.01 Validation PR:** `#213` — validation-only; close WITHOUT MERGE after final same-SHA documentation validation.

## 04.02 Document Sequence Service

**Status:** `CLOSED`

Implemented and verified:

- numeric visible numbers only.
- branch + document type sequence.
- allocation in same business transaction.
- allocate late after validation/locks.
- atomic update returning value.
- no reuse after deletion.
- PostgreSQL 17 32-worker same-scope concurrency produces exactly one copy of each number `1..32`.
- rollback removes both the sequence increment and business effect; a retry can safely allocate the uncommitted number.
- committed deleted/tombstoned number is not reused; the next allocation remains monotonic.
- Existing `document_sequences` table and `UNIQUE(branch_id, document_type)` reused unchanged; no migration/index added.

**04.02 Implementation SHA:** `eb1c02035bd1dc91e7045e3d6ed08e23b9342acd`.  
**04.02 Implementation CI:** Run `#949` / `35380340039` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 Document Sequence Service integration, `browser-contract`, and `release-gate` all SUCCESS.  
**04.02 Diagnostic Run:** Run `#948` exposed only a test assertion ordering defect: the persisted `bigint` values were cast to text and the SQL alias was ordered lexicographically. The service had already generated unique `1..32`; the test was corrected to order by the underlying numeric column.  
**04.02 Validation PR:** `#214` — validation-only; close WITHOUT MERGE after final same-SHA documentation validation.

## 04.03 Posting Batch Service

**Status:** `CLOSED`

Implemented and verified:

- POST
- CORRECTION
- REVERSAL
- DELETE_REVERSAL
- source traceability via `source_type + source_id`.
- self-reference to reversed posting batch.
- reversal reference locked `FOR UPDATE` and validated against the same branch/source.
- `posted_at` generated by PostgreSQL at execution time; callers cannot backdate posting order through the service.
- service is insert-only and requires an existing Business Transaction `PoolClient`.
- rollback proof confirms Posting Batch and linked posting effect roll back together.
- Existing `posting_batches` schema, CHECK/FKs, and frozen source trace index reused unchanged; no migration/index added.

**04.03 Implementation SHA:** `60d25e108a37bdfb6adbfad261c87f674fbf62d0`.  
**04.03 Implementation CI:** Run `#951` / `35389332195` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 Posting Batch Service integration, `browser-contract`, and `release-gate` all SUCCESS.  
**04.03 Validation PR:** `#215` — validation-only; close WITHOUT MERGE after final same-SHA documentation validation.

## 04.04 Audit Service

**Status:** `CLOSED`

Implemented and verified:

- Who
- What
- When
- Branch
- Entity/Document
- Reason
- Before
- After
- append-only Audit writes through the service.
- PostgreSQL-generated `created_at`; callers cannot backdate Audit chronology.
- JSONB Before/After snapshots reject ambiguous/non-JSON runtime values before SQL.
- nullable branch/user/reason/snapshots preserved exactly as approved for system or non-applicable context.
- Audit and sensitive business effects share the caller-owned Business Transaction and roll back together.
- Existing `audit_logs` schema, FKs, and frozen Audit indexes reused unchanged; no migration/index added.

**04.04 Implementation SHA:** `106770cd0a699edc9f3f68bf5a6386ac1ced1281`.  
**04.04 Implementation CI:** Run `#953` / `35389984264` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 Audit Service integration, `browser-contract`, and `release-gate` all SUCCESS.  
**04.04 Validation PR:** `#216` — validation-only; close WITHOUT MERGE after final same-SHA documentation validation.

## 04.05 Transactional Outbox

**Status:** `CLOSED`

Implemented and verified:

- Event inserted in source transaction.
- Worker uses `FOR UPDATE SKIP LOCKED`.
- `retry_count` managed.
- `processed_at` written only after successful consumer work.
- consumers receive stable `event.id` as the idempotency identity.
- DB-backed consumer effects can use the same worker transaction and commit atomically with `processed_at`.
- non-retryable consumer failures are isolated by SAVEPOINT, increment `retry_count`, and remain pending.
- deadlock/serialization errors are delegated to the existing bounded transaction retry policy.
- committed outbox events survive producer/worker process restart.
- two concurrent workers processed 40 events with disjoint claims and no duplicate logical result.
- Existing `outbox_events` schema, retry CHECK, PK, and frozen partial index reused unchanged; no migration/index added.

**04.05 Implementation SHA:** `b476939de62c00b9ebdad942c985513a76e2fb79`.  
**04.05 Implementation CI:** Run `#955` / `35391957524` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 Transactional Outbox integration, `browser-contract`, and `release-gate` all SUCCESS.  
**04.05 Validation PR:** `#217` — validation-only; close WITHOUT MERGE after final same-SHA documentation validation.

## 04.06 Error Mapping

**Status:** `CLOSED`

Implemented and verified:

- centralized public contract = `errorCode + safe params`.
- existing Idempotency and Posting Batch business errors map to stable codes with explicit safe `reason` only.
- Idempotency keys and posting reference IDs are not exposed.
- PostgreSQL `23505` → `DB_UNIQUE_CONFLICT`.
- PostgreSQL `23503` → `DB_REFERENCE_CONFLICT`.
- PostgreSQL `23514` → `DB_CHECK_VIOLATION`.
- PostgreSQL `23502` → `DB_REQUIRED_VALUE_MISSING`.
- PostgreSQL `22P02 / 22001 / 22003` → `DB_INVALID_INPUT`.
- PostgreSQL `40P01` → `CONCURRENCY_DEADLOCK`.
- PostgreSQL `40001` → `CONCURRENCY_SERIALIZATION`.
- TypeError/RangeError → `INVALID_ARGUMENT` without exposing their message.
- unknown PostgreSQL/runtime failures → `INTERNAL_ERROR` with empty params.
- public output never copies SQL/driver/runtime fields such as `message/detail/hint/query/table/column/constraint/stack`.
- UI localization remains downstream: Arabic/English presentation is based on `errorCode`, not raw backend text.
- no schema or index changes.

**04.06 Implementation SHA:** `40e86d4e2937c9d9f2db3b3ebdcec50b8da9a048`.  
**04.06 Implementation CI:** Run `#957` / `35395761123` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 Error Mapping integration, `browser-contract`, and `release-gate` all SUCCESS.  
**04.06 Validation PR:** `#218` — validation-only; close WITHOUT MERGE after final same-SHA documentation validation.

### Gate 04

- [x] parallel idempotency tests.
- [x] sequence concurrency test with many workers and no duplicate number.
- [x] rollback does not leak posting effects.
- [x] outbox survives process restart.
- [x] worker concurrency has no duplicate logical result.

---

# 11. PHASE 05 — Authentication, Authorization, Organization

**Status:** `IN_PROGRESS`

## 05.01 Authentication

**Status:** `CLOSED`

Implemented and verified:

- backend-owned `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, and `GET /auth/me`.
- passwords stored/verified as salted Scrypt hashes only.
- revocable and expiring PostgreSQL `auth_sessions`.
- refresh tokens are random values; PostgreSQL stores SHA-256 hashes only.
- successful refresh rotates the refresh token/hash and invalidates the previous refresh token and previous access token.
- short-lived access tokens are bound to the session and current refresh hash, and signed using a server-only secret.
- access-token validation rechecks session revocation/expiry and `users.is_active` in PostgreSQL.
- disabled users cannot create sessions and existing sessions are rejected/revoked backend-side.
- refresh cookie is `HttpOnly; SameSite=Strict; Path=/auth`; HTTPS deployment mode adds `Secure`.
- login rate limiting is enforced by normalized identifier + source IP.
- unknown-user and wrong-password login failures use the same public error.
- backend logger/security checks redact and require the auth signing secret to remain environment-backed.
- existing `users/auth_sessions` schema and frozen auth indexes reused unchanged; no migration/index added.
- Frontend/Convex Auth cutover was intentionally not started.

**05.01 Verified Implementation SHA:** `3558211d6db2dcac1a00c52b92747268fa17ebfd`.  
**05.01 Implementation CI:** Run `#962` / `35415190981` — SUCCESS; security scan, Backend TypeScript/unit tests, PostgreSQL 17 Authentication integration, `verify`, `backend-verify`, `browser-contract`, and `release-gate` all SUCCESS.  
**05.01 Validation PR:** `#219` — validation-only; close WITHOUT MERGE after final same-SHA documentation validation.

## 05.02 Roles

**Status:** `CLOSED`

Default roles:

- SYSTEM_ADMIN
- BRANCH_MANAGER
- ACCOUNTANT
- SALES
- CUSTOMER_SERVICE
- TECHNICIAN
- WAREHOUSE_KEEPER

Implemented and verified:

- exact seven-role backend catalog using the Master Plan technical keys.
- idempotent multi-row UPSERT on the existing `UNIQUE(role_key)`.
- 16-way concurrent initialization without duplicate role keys.
- canonical metadata repair preserves the existing role `id` and therefore existing references.
- all seven canonical roles are reconciled to `is_system = true`.
- extra custom roles are preserved unchanged.
- `ADMIN_SYSTEM` is not emitted by the new catalog; canonical key is `SYSTEM_ADMIN`.
- `role_permissions` remains untouched in 05.02; permission defaults belong to 05.03.
- no role-management HTTP API was exposed before backend authorization exists.
- no migration and no index added.

**05.02 Verified Implementation SHA:** `d5aaa05d8b071120c4a5f622c62494f436d59301`.  
**05.02 Implementation CI:** Run `#964` / `35439920395` — SUCCESS; security scan, Backend TypeScript/unit tests, PostgreSQL 17 Role Catalog integration, `verify`, `backend-verify`, `browser-contract`, and `release-gate` all SUCCESS.  
**05.02 Validation PR:** `#220` — validation-only; close WITHOUT MERGE after final same-SHA documentation validation.

## 05.03 Effective Permissions

**Status:** `CLOSED`

Implementation boundary:

- backend-only Effective Permission resolver over the existing `permissions`, `role_permissions`, and `user_permission_overrides` tables.
- logical `INHERIT` = no user override row.
- ALLOW/DENY override takes precedence over Role Default.
- missing/inactive subject fails closed.
- no exhaustive new Permission Matrix is invented from legacy Convex; v1.7 does not freeze exact technical keys/default grants for every module in this section.
- Branch Scope stays exclusively in 05.04.
- no Migration, no Index, no Frontend/Convex cutover.

Resolution:

```text
Role Default
→ User Override ALLOW/DENY
→ Effective Permission
```

## 05.04 Branch Scope

**Status:** `CLOSED`

Implementation boundary:

- `SELECTED` grants only explicit `user_branch_access` rows.
- `ALL` grants every existing V1 branch without requiring mapping rows.
- `default_branch_id` remains within effective branch access through the existing deferred PostgreSQL integrity rules.
- missing/inactive users, missing branches, and unauthorized cross-branch targets fail closed.
- sensitive Backend Business Queries/Commands use transaction-bound Permission + Branch Scope rechecks.
- existing PostgreSQL CHECK/PK/FK/deferred default-branch constraints are reused unchanged.
- no Migration, no Index, no Frontend/Convex cutover, and no 05.05 Organization behavior.

كل Query/Command حساس يعيد فحص permission + branch scope في Backend.

**05.04 Verified Implementation SHA:** `9826a8d187ec84627c20c9eb6ca9ad6dfd3101a8`.  
**05.04 Implementation CI:** Run `#969` / `35481723808` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 Branch Scope integration, `browser-contract`, and `release-gate` all SUCCESS on the same implementation SHA.  
**05.04 Validation PR:** `#222` — validation-only; close WITHOUT MERGE after final same-SHA documentation validation.

## 05.05 Organization

**Status:** `CLOSED`

Implementation boundary:

- Company settings through `company_settings` only for configuration.
- Branch lifecycle uses create + active/inactive state; no physical-delete command is introduced.
- Branch creation atomically creates one active default Warehouse and `branch_settings`.
- `branch_settings.default_warehouse_id` is the only Warehouse Default truth.
- current default Warehouse cannot be moved or deactivated.
- Warehouse branch mutation is blocked after Inventory Movements exist, with the approved composite FK remaining final DB defense.
- historical Warehouses may be deactivated instead of deleted.
- Organization mutations are Audit-recorded.
- existing constraints and frozen indexes are reused unchanged.
- no Migration, no Index, no Frontend/Convex cutover, and no Phase 06 behavior.

**05.05 Verified Implementation SHA:** `1c5c3cdd582713c1e4c655ab5ee9c27519a647f9`.  
**05.05 Implementation CI:** Run `#972` / `35482306897` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 Organization integration, `browser-contract`, and `release-gate` all SUCCESS on the same implementation SHA.  
**05.05 Validation PR:** `#223` — validation-only; close WITHOUT MERGE after final same-SHA documentation validation.


### Gate 05

**Final last/System Admin policy — CLOSED**

- system must retain at least one **active canonical `SYSTEM_ADMIN`** user.
- only role_key `SYSTEM_ADMIN` counts; custom roles do not satisfy this invariant even when `is_system=true`.
- disabling or demoting the last active `SYSTEM_ADMIN` is rejected.
- enabling/promoting a System Admin is allowed.
- disabling/demoting is allowed only when another active canonical `SYSTEM_ADMIN` remains.
- protected user mutations serialize on the canonical `SYSTEM_ADMIN` role row with `SELECT ... FOR UPDATE`, then lock the target user, under the approved `READ COMMITTED` model.
- successful mutations are audited in the same transaction.
- no user-delete path is introduced by this Gate; any future delete path must enforce the same invariant.
- no Migration or Index is required.

Validation record: `docs/gap-analysis/phase-05-gate-last-system-admin.md`.

- [x] role defaults tests.
- [x] allow override test.
- [x] deny override test.
- [x] branch selected/all tests.
- [x] cross-branch denial tests.
- [x] last/system admin protection according to final policy.
- [x] disabled user/session behavior.

---

# 12. PHASE 06 — Counterparties & Master Data

**Status:** `IN_PROGRESS`

## 06.01 Unified Counterparty

**Status:** `CLOSED`

Implementation boundary:

- one canonical Counterparty identity.
- roles limited to `CUSTOMER / SUPPLIER / OTHER`.
- same Counterparty may hold multiple roles simultaneously.
- optional Customer Profile attached to the same identity.
- optional Supplier Profile attached to the same identity.
- Customer Profile requires CUSTOMER role; Supplier Profile requires SUPPLIER role.
- role addition is idempotent at Backend level while the approved composite PK remains final duplicate defense.
- Counterparty activation/deactivation is non-destructive.
- successful master-data mutations are Audit-recorded.
- `normalized_phone` is not calculated in 06.01; phone normalization/search remains 06.02.
- Customer/Supplier Ledger commands remain 06.03.
- existing schema/constraints/frozen indexes are reused unchanged.
- no Migration, no Index, no Frontend/Convex cutover.

**06.01 Verified Implementation SHA:** `0a89fba47d243bac5f47c38eb51439292ea4afb0`.  
**06.01 Implementation CI:** Run `#978` / `35483368078` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 Unified Counterparty service integration, `browser-contract`, and `release-gate` all SUCCESS on the same implementation SHA.  
**06.01 Validation PR:** `#225` — validation-only; close WITHOUT MERGE after final same-SHA documentation validation.

Replace separate customer/supplier identity storage with:

- Counterparty identity.
- CUSTOMER/SUPPLIER/OTHER roles.
- optional customer profile.
- optional supplier profile.
- same party may have both roles.

## 06.02 Phone Normalization

- preserve display phone.
- calculate/store canonical `normalized_phone`.
- search uses normalized value.

## 06.03 Customer/Supplier Ledgers

- separate historical ledgers.
- no mutable customer/supplier balance truth.
- official settlement only; no history erasure.

### Gate 06

- [x] same account can be customer+supplier.
- [x] no duplicate role pair.
- [ ] normalized phone search tests.
- [ ] ledger immutability tests.
- [ ] branch scope tests.

---

# 13. PHASE 07 — Product Catalog / Variants / Units / Pricing

**Status:** `NOT_STARTED`

## 07.01 Product Model

Implement:

- Product STOCK/SERVICE.
- mandatory at least one Variant.
- hidden/default variant for simple product.
- product base unit single source of truth.

## 07.02 Units

- conversion to base.
- sellable/purchasable flags.
- fractional quantity rules.
- no cross-product unit link.

## 07.03 Barcodes / SKU

- unique catalog barcode.
- unique non-null SKU.
- barcode may differ by Variant + ProductUnit.

## 07.04 Dynamic Attributes

- VARIANT/DESCRIPTIVE usage.
- combination signature canonicalization.
- prevent duplicate variant combination.

## 07.05 Price Lists

- unlimited price lists.
- price per price-list + variant + product-unit.
- branch/customer default linkage.
- manual price permission.
- minimum selling price policy.

## 07.06 Reorder Levels

- per Warehouse + Variant.
- alerts honor branch scope.

### Gate 07

- [ ] default variant behavior.
- [ ] unit conversion tests.
- [ ] fraction restriction tests.
- [ ] SKU/barcode concurrency uniqueness.
- [ ] combination signature tests.
- [ ] minimum price permission tests.

---

# 14. PHASE 08 — Inventory Core

**Status:** `NOT_STARTED`

هذه المرحلة Critical ولا يتم ربط Sales/Purchasing النهائي بها قبل نجاح Concurrency Gate.

## 08.01 Inventory Ledger

- append-only movement headers/lines.
- movement types defined by v1.7.
- signed quantities.
- posting_batch traceability.

## 08.02 Stock Positions

For each Warehouse+Variant:

- on_hand
- reserved
- available = on_hand - reserved
- version

Position row is lock row/projection, not history.

## 08.03 Weighted Average Cost

Per Warehouse+Variant:

- weighted_average_cost
- last_purchase_cost
- inventory_value

No historical rewrite due to backdating.

## 08.04 Reservations

- Confirm Sales Order increases reserved only.
- one active logical reservation per order line + warehouse + variant.
- no hand_on deduction.
- atomic delta update for order edit.
- release remaining on cancel.
- warehouse change releases/revalidates/reserves atomically.

## 08.05 Serials

- unique within Variant.
- current location/status operational projection.
- historical truth from movements.
- prevent double sale/use.

## 08.06 Batches / Expiry

- batch identity per Variant.
- batch quantities per warehouse.
- batch position lock rows.
- FEFO query support.
- expired sale blocked by default, explicit permission+reason+audit override.

## 08.07 Stock Transfer

- validate available source stock.
- reserved stock not consumed by normal transfer.
- TRANSFER_OUT + TRANSFER_IN in one transaction.
- transfer serial/batch/expiry identity.
- target WA recalculation.
- no P&L impact by default.

## 08.08 Stocktake

- OPEN → COUNTED → APPROVED/CANCELLED.
- book quantity snapshot.
- stock position version at count.
- re-count line when version invalid before line is fixed.
- approval locks positions and creates adjustment for differences.
- approved session immutable.

## 08.09 Inventory Adjustment

- formal document only.
- no direct stock update.
- reason code mandatory.
- OTHER requires note.
- shortage/overage costing according to v1.7.
- generate accounting effect when required.
- detect reservation shortfall; never hide it by silently rewriting reservation.

## 08.10 Projection Rebuild

Create controlled verification/rebuild procedures capable of recalculating operational projections from immutable ledgers in test/maintenance mode.

### Gate 08 — Mandatory Concurrency Suite

- [ ] 2 simultaneous reservations for same stock cannot overreserve.
- [ ] 20+ parallel reservation stress scenario.
- [ ] concurrent direct sales stock protection.
- [ ] batch last-unit race.
- [ ] serial double-use race.
- [ ] stock transfer source/target atomicity.
- [ ] failed transfer rolls back both sides.
- [ ] WA purchase/return scenarios.
- [ ] projection rebuild equals live projection.
- [ ] stocktake approval version rules.
- [ ] adjustment shortfall behavior.

---

# 15. PHASE 09 — Finance & Accounting Foundation

**Status:** `NOT_STARTED`

## 09.01 Treasuries

- user-defined names.
- case-insensitive unique within branch.
- no mandatory treasury type.
- Cash/Bank/Wallet/InstaPay are treasuries by user naming.
- Credit/Installment/Cheque are settlement modes, not treasuries.

## 09.02 Financial Movements

- append-only IN/OUT ledger.
- source/posting batch references.
- `treasury_balance_positions` maintained synchronously.

## 09.03 Receipts / Disbursements

- idempotent posting.
- treasury row lock.
- optional counterparty/target.
- financial allocations.
- no over-allocation.

## 09.04 Treasury Transfer

- lock from/to in deterministic order.
- OUT + IN one transaction.
- same posting batch/source.
- duplicate leg prevented by partial unique constraint.

## 09.05 Customer Advances

- receipt + treasury movement + liability.
- not sales revenue.
- one advance per receipt.
- remaining projection derived from applications.
- apply using FOR UPDATE on advance.
- no new cash movement during application.
- reversal restores advance availability.

## 09.06 Cheques

- PENDING/CLEARED/BOUNCED/CANCELLED.
- no treasury movement on PENDING.
- settlement locks cheque.
- movement only on CLEARED.
- double clearing impossible.

## 09.07 Installments

- schedule only, not parallel ledger.
- status/paid projection rebuildable from allocations.
- partial settlement allowed.
- over-allocation impossible under lock.

## 09.08 GL / Journal Engine

- Chart of Accounts.
- system account mappings.
- business-generated journals only for ordinary V1 operation.
- journal lines debit/credit non-negative.
- both debit+credit not simultaneously positive on same line.
- deferred COMMIT-time balance constraint.
- reversal creates compensating entry, never edits original.

## 09.09 Posting Rules Catalog

Implement centralized posting rules for at least:

- sales invoice.
- sales return.
- purchase invoice.
- purchase return including cost variance.
- receipt.
- disbursement.
- treasury transfer.
- customer advance receipt/application/refund.
- cheque lifecycle.
- installment settlement.
- inventory adjustment.
- stock transfer accounting only where account mapping requires reclassification.

### Gate 09

- [ ] financial movement totals reconcile to treasury positions.
- [ ] customer ledger reconciliation.
- [ ] supplier ledger reconciliation.
- [ ] every posted journal balances at COMMIT.
- [ ] intentional unbalanced commit fails.
- [ ] transfer one-side failure rolls back both legs.
- [ ] cheque double-settlement concurrency test.
- [ ] advance double-consumption concurrency test.
- [ ] installment over-allocation concurrency test.
- [ ] reversal restores accounting position without deleting history.

---

# 16. PHASE 10 — Purchasing

**Status:** `NOT_STARTED`

V1 Purchasing contains Purchase Invoice and Purchase Return only.

## 10.01 Purchase Invoice

Transaction pipeline:

```text
Permission/Scope
→ Idempotency
→ Lock Stock/Cost/Batch/Serial
→ Validate
→ Late Document Number
→ Invoice + Lines
→ Inventory PURCHASE
→ Landed Cost Allocation
→ Weighted Average Update
→ Supplier Payable or Treasury OUT
→ Recoverable VAT
→ Supplier Ledger
→ Journal
→ Audit
→ Outbox
→ Commit
```

## 10.02 Landed Cost

Additional cost distributed proportionally to stock items according to v1.7 rule, excluding recoverable VAT and service items from inventory valuation.

## 10.03 Purchase Return

Linked return:

- lock original purchase line.
- recalculate purchased - posted returns.
- commercial value from original purchase commercial terms.
- inventory OUT at current WA at return posted_at.
- difference → Purchase Return Cost Variance.
- supplier/VAT/journal effects atomic.

Unlinked return:

- current WA inventory exit.
- entered commercial settlement.
- variance handled by accounting mapping.

## 10.04 Edit/Delete/Reversal

No historical mutation; use versioned reverse/repost/tombstone flow.

### Gate 10

- [ ] cash purchase.
- [ ] credit purchase.
- [ ] mixed payment/payable where allowed.
- [ ] landed cost exact distribution/rounding.
- [ ] WA update.
- [ ] VAT recoverable treatment.
- [ ] batch/serial purchase.
- [ ] linked return quantity race.
- [ ] unlinked return.
- [ ] purchase return cost variance.
- [ ] edit/reverse/delete flows.
- [ ] accounting reconciliation.

---

# 17. PHASE 11 — Sales

**Status:** `NOT_STARTED`

## 11.01 Sales Quote

- no stock effect.
- no financial effect.
- no accounting effect.
- price/tax snapshots on lines.

## 11.02 Sales Order

- independent aggregate.
- optimistic version.
- one selected warehouse per order in V1.
- status history append-only.
- shipping details 1:1 where applicable.

## 11.03 Confirm Order

- lock order + stock positions.
- re-check available.
- reserve all required lines atomically.
- no partial silent reservation.
- no invoice.
- no stock on_hand deduction.

## 11.04 Edit/Cancel/Warehouse Change

- quantity increase: reserve delta.
- quantity decrease: release delta.
- cancel: release remaining reservation only.
- warehouse change: lock old/new, release/validate/reserve in one transaction.

## 11.05 Partial Delivery

One transaction:

```text
Order/Lines Locks
→ Reservation Locks
→ Stock/Batch/Serial Locks
→ Validate Deliverable
→ Delivery + Lines
→ Consume Reservation
→ Inventory SALE
→ COGS Snapshot
→ Sales Invoice for Delivered Qty
→ Advance/Settlement
→ Customer Ledger
→ Journal
→ Order Status
→ Audit
→ Outbox
→ Commit
```

Shipping timing:

- Shipping: stock/invoice effect when handed to shipping company according to v1.7.
- Pickup: effect at actual customer pickup.
- later delivered confirmation must not invoice/stock-deduct twice.

## 11.06 Direct Sales Invoice

- transactionally lock stock positions.
- negative stock only with explicit effective permission/policy/audit.
- create immutable COGS snapshot.

## 11.07 Sales Return

Linked:

- lock source line.
- recalculate returnable quantity.
- commercial terms/historical COGS from original.
- inventory IN at historical cost snapshot.
- WA changes from current posted_at only.

Unlinked:

- explicit permission/reason.
- current WA valuation according to baseline.
- serial rules enforced transactionally.

Settlement may be cash refund, receivable reduction, or customer credit according to actual operation.

## 11.08 Customer Advance with Partial Deliveries

Advance applies sequentially to generated invoices until exhausted under advance lock.

## 11.09 Edit/Delete/Reversal

Same global versioned reversal model.

### Gate 11

- [ ] quote no-side-effect tests.
- [ ] order reservation tests.
- [ ] parallel confirm cannot overreserve.
- [ ] order edit delta tests.
- [ ] warehouse change rollback test.
- [ ] partial delivery 4/10 then remainder.
- [ ] multiple invoices per order.
- [ ] cancel remainder after partial delivery.
- [ ] advance across multiple partial invoices.
- [ ] direct invoice.
- [ ] linked return historical COGS.
- [ ] concurrent returns cannot exceed source.
- [ ] serial/batch return rules.
- [ ] sales VAT/journal reconciliation.
- [ ] edit/reverse/delete.

---

# 18. PHASE 12 — Repairs, Follow-Up, Notifications

**Status:** `NOT_STARTED`

## 12.01 Repair Status Model

Official statuses:

- WAITING
- HANDED_TO_TECHNICIAN
- IN_REPAIR
- NEW_PROBLEM
- CUSTOMER_APPROVED
- TECHNICIAN_REJECTED
- CUSTOMER_REJECTED
- REPAIRED
- DELIVERED

لا حالة مستقلة `waiting_customer_response` في V1.

## 12.02 Repair Commands

Each sensitive command:

- Permission/Branch.
- Idempotency.
- FOR UPDATE RepairOrder.
- reread current status.
- transition validation.
- append status history.
- specialized effects.
- audit/outbox.

## 12.03 Assignments

- active assignment partial uniqueness.
- technician change ends previous assignment and creates new history row.

## 12.04 Issues & Decisions

- NEW_PROBLEM requires Issue Report in same transaction.
- Customer approved/rejected requires Customer Decision linked to issue.
- Technician rejection requires reason.

## 12.05 Parts Consumption

Any repair parts inventory effect must use final Inventory Engine and posting rules; no direct product stock mutation.

## 12.06 Follow-Up

- current task row.
- append-only actions.
- append-only status history.
- source type/id references, no copying source business details as truth.
- automatic follow-up `source_event_id` unique when non-null.

## 12.07 Assisted WhatsApp

- templates in DB.
- Arabic/English.
- action logs employee/template/time.
- no claim of delivery/read receipt.

## 12.08 Notifications

- generated through outbox.
- permission + branch recipient filtering.
- duplicate prevention by outbox event + type.
- per-user seen/read state.
- click/open source rechecks permission.

## 12.09 Repair Tracking Security

- store token hash only.
- expiry/revocation.
- last 4 phone verification.

### Gate 12

- [ ] every repair transition test.
- [ ] invalid transition rejection.
- [ ] required issue/decision records.
- [ ] active technician uniqueness.
- [ ] history immutability.
- [ ] automatic follow-up dedupe.
- [ ] notification retry dedupe.
- [ ] unseen count.
- [ ] tracking token security.
- [ ] parts inventory integration.

---

# 19. PHASE 13 — Reports, Read Models, Export, Printing, Workspace, i18n

**Status:** `NOT_STARTED`

## 13.01 Read Models

Build/rebuildable projections for:
- daily branch metrics.
- inventory balances/value.
- counterparty balances.
- treasury balances.
- follow-up metrics.

كل KPI يدعم Drill-down للمصدر.

## 13.02 Report Center

Final management groups:

1. Profit/Loss.
2. Sales/Profitability.
3. Purchases/Suppliers.
4. Inventory/Capital.
5. Liquidity/Treasuries.
6. Receivables/Payables.
7. Repairs/Customer Service.

Required behavior:

- period filters.
- branch scope.
- comparison where specified.
- permissions.
- drill-down.
- reconciliation to Sources of Truth.

Dashboard target remains 8 primary cards as approved in UX baseline.

## 13.03 Performance Verification

After real DDL + representative data:

- `EXPLAIN (ANALYZE, BUFFERS)`.
- latency measurement.
- buffer reads.
- index usage.
- write amplification review.

No additional index without evidence.

## 13.04 Export

Central export framework:

- Excel.
- PDF.
- current filtered result.
- permission-aware columns.
- stable column order.
- CSV formula injection protections retained where CSV remains supported.

## 13.05 Printing

Reuse existing print work and complete:

- A4 Classic.
- A4 Compact.
- A3.
- Thermal 80.
- Thermal 57.
- template catalog.
- branch defaults.
- preview.
- PDF/save.
- permission checks.

## 13.06 Workspace

Unsaved UI state remains local client state, not PostgreSQL Business Drafts.

Must support:

- multiple tabs.
- unsaved invoice/order/repair state.
- isolation per tab.
- restore after refresh/crash.
- warning before close dirty tab.
- clear protected data on logout according to policy.
- local data never bypasses backend validation.

## 13.07 i18n

- central Arabic/English catalogs.
- RTL/LTR.
- backend `errorCode` translation.
- reports/printing messages included.
- no new hardcoded business UI strings except approved exceptions.

### Gate 13

- [ ] report totals reconcile to ledgers/docs.
- [ ] branch/permission filter tests.
- [ ] drill-down tests.
- [ ] export filter/column permission tests.
- [ ] all print sizes acceptance.
- [ ] RTL/LTR acceptance.
- [ ] workspace crash/refresh restore tests.
- [ ] i18n coverage check.

---

# 20. PHASE 14 — Frontend API Migration & Convex Decommission

**Status:** `NOT_STARTED`

## 14.01 API Adapter Layer

Create frontend data boundary so UI components do not embed backend implementation details.

## 14.02 Module Cutover Order

Recommended cutover sequence after corresponding backend readiness:

1. Auth/Organization/Permissions.
2. Counterparties.
3. Product Catalog.
4. Inventory read screens.
5. Treasury/Finance reads and commands.
6. Purchasing.
7. Sales.
8. Repairs/Follow-Up/Notifications.
9. Reports.
10. Printing/export data sources.

## 14.03 Single Writer Rule

During migration each Business Aggregate has exactly one authoritative writer:

```text
Legacy Convex OR New PostgreSQL Backend
```

Never both.

If side-by-side comparison is needed, legacy side may be read-only/reference in test environment; it must not receive mirrored business writes.

## 14.04 Remove Convex Dependencies

Only after all callers are removed:

- remove Convex runtime code from local execution.
- remove `@convex-dev/auth` where unused.
- remove `convex` dependency where unused.
- remove local self-hosted Convex containers/dashboard.
- retain history in Git; do not duplicate legacy source tree.

## 14.05 Final Local Compose

Final server compose/deployment contains application services required by new architecture, e.g.:

- PostgreSQL.
- Central Backend.
- Frontend/static serving or reverse proxy as selected.
- optional operational service needed by approved deployment design.

PostgreSQL is not exposed directly to client LAN/Internet.

### Gate 14

- [ ] search repository for Convex imports/calls returns only intentionally retained historical tooling, then zero runtime dependencies.
- [ ] frontend works against new API only.
- [ ] no dual writer.
- [ ] no Convex container required for application operation.
- [ ] external internet can be disabled on same-site LAN and core operation remains functional when server is local.

---

# 21. PHASE 15 — Data Migration / Opening State / Reconciliation

**Status:** `NOT_STARTED`

هذه المرحلة منفصلة عن code migration لأن البيانات المالية والمخزنية لا يجوز نقلها بالنسخ العشوائي.

## 15.01 Data Classification

Classify source data into:

- master data.
- open operational documents.
- historical documents.
- inventory opening state/history.
- customer balances.
- supplier balances.
- treasury balances.
- accounting/opening balances.
- audit/reference-only data.

## 15.02 Migration Policy

لا ننسخ mutable legacy balances كـSource of Truth بدون reconciliation.

For production cutover, choose explicitly per dataset between:

- full historical migration with verified mappings; or
- controlled opening balances/movements at cutover date plus archived legacy history.

الاختيار التجاري النهائي يوثق قبل التنفيذ على بيانات حقيقية.

## 15.03 Migration Tooling

Build deterministic scripts with:

- source extract version.
- transformation rules.
- reject file.
- id mapping.
- checksums/counts.
- rerunnable dry-run.
- no duplicate insert on rerun.

## 15.04 Reconciliation

Mandatory checks:

- product/variant counts.
- on-hand by warehouse+variant.
- inventory value by warehouse.
- customer receivable.
- supplier payable.
- treasury balances.
- open advances.
- open installments/cheques.
- journal/control account reconciliation.

## 15.05 Production Safety

No read/write access to Convex Cloud Production for migration without explicit user approval and a separate migration runbook.

### Gate 15

- [ ] migration rehearsal on copy/test data.
- [ ] reject count reviewed.
- [ ] balances reconcile.
- [ ] repeat run deterministic.
- [ ] source remains untouched in rehearsal.
- [ ] rollback/cutover runbook approved.

---

# 22. PHASE 16 — Deployment, LAN, Remote Access & Security

**Status:** `NOT_STARTED`

## 16.01 Server Deployment

Target: one Central Server per customer.

Server responsibilities:

- PostgreSQL.
- Central Backend.
- frontend/static application serving.
- backup jobs.
- logs.
- reverse proxy/TLS where needed.

## 16.02 LAN Mode

- server reachable on selected private LAN IP/name.
- backend binds appropriately to LAN interface through controlled config.
- client devices use browser/app URL only.
- PostgreSQL remains internal-only.

## 16.03 No External Internet Test

For same-site LAN configuration:

- disconnect external internet.
- keep LAN server reachable.
- login and core transactions must still work.
- no hidden Convex/cloud dependency.

## 16.04 Remote Branch Security

Transport decision is Deployment-specific but must satisfy:

- encrypted channel.
- backend authentication.
- no PostgreSQL exposure.
- rate limiting / reverse proxy protections.
- certificate lifecycle/runbook.

Approved implementation may use HTTPS reverse proxy, VPN, or approved secure tunnel without changing Business Core.

## 16.05 Secret Management

- no secrets committed.
- generated credentials stored outside Git.
- separate local/test/production secrets.
- no reuse of Convex Cloud secrets.

## 16.06 Logging

- structured logs.
- request ID.
- user ID where safe.
- no passwords/tokens/secrets.
- business audit remains DB audit, not replaced by application logs.

### Gate 16

- [ ] LAN multi-device test.
- [ ] concurrent client test.
- [ ] no-external-internet test.
- [ ] PostgreSQL port inaccessible from client network.
- [ ] auth/session security test.
- [ ] remote transport test if remote branch is enabled for pilot.

---

# 23. PHASE 17 — Backup, Restore, Restart Persistence & Operations

**Status:** `NOT_STARTED`

## 17.01 Backup Strategy

At minimum:

- scheduled PostgreSQL backup.
- encrypted backup files where sensitive.
- off-machine/offsite copy according to deployment policy.
- retention policy.
- backup logs/health checks.

For stronger recovery objectives:

- WAL archiving / point-in-time recovery.
- optional synchronous replica only if contractual RPO=0 infrastructure requirement is adopted.

## 17.02 Restore Drill

A backup is not accepted until restored to a clean environment and verified.

Verification:

- schema version.
- row counts.
- ledgers.
- balances.
- login.
- sample transactions.
- report reconciliation.

## 17.03 Restart Persistence

Test:

- abrupt backend restart after completed commits.
- PostgreSQL restart.
- full server restart.
- outbox resumes.
- no committed transaction lost logically.
- no duplicate worker effect.

## 17.04 Autostart

Server application stack starts automatically after OS/server restart with health checks and documented recovery procedure.

## 17.05 Operational Runbook

Create:

`docs/operations/OPERATIONS-RUNBOOK.md`

including:

- start/stop.
- health checks.
- backup.
- restore.
- logs.
- disk-space monitoring.
- password reset/admin recovery policy.
- database migration procedure.
- rollback procedure.
- server replacement procedure.

### Gate 17

- [ ] backup create.
- [ ] restore to clean environment.
- [ ] reconciliation after restore.
- [ ] restart persistence.
- [ ] autostart.
- [ ] outbox recovery.
- [ ] operations runbook verified.

---

# 24. PHASE 18 — Full Quality, Security, Performance & Failure Testing

**Status:** `NOT_STARTED`

All tests must run on the same Release Candidate SHA.

## 18.01 Static / Build

- TypeScript strict.
- lint/static checks.
- production frontend build.
- backend build/start.
- dependency vulnerability review.

## 18.02 Unit Tests

Domain rules and calculations.

## 18.03 Integration Tests

Real PostgreSQL, real transactions, API boundaries.

## 18.04 Database Integrity Tests

FK/unique/check/deferred trigger/context integrity.

## 18.05 Concurrency Tests

At least:

- numbering.
- reservations.
- stock sale.
- batch/serial.
- returns.
- treasury transfers.
- advances.
- installments.
- cheque settlement.
- stocktake/adjustment where concurrent behavior applies.
- outbox workers.

## 18.06 Accounting Tests

Every supported transaction type must generate expected balanced journals and reconcile with subledgers.

## 18.07 Inventory / COGS Tests

- WA sequences.
- landed cost.
- sales COGS snapshot.
- sales return historical COGS.
- purchase return current WA/variance.
- transfers.
- adjustments.

## 18.08 Security Tests

- authorization bypass attempts.
- branch scope bypass.
- IDOR checks.
- session revocation.
- login throttling.
- injection resistance.
- export permissions.
- tracking token behavior.
- secret exposure checks.

## 18.09 Performance Tests

Representative dataset:

- product search.
- customer search.
- invoice/order lists.
- inventory movement history.
- ledger statements.
- treasury movement history.
- dashboard/report queries.
- outbox worker throughput.

Record `EXPLAIN ANALYZE BUFFERS` for critical queries.

## 18.10 E2E Business Flows

End-to-end scenarios for:

- sale direct cash.
- sale credit.
- quote→order→reservation→partial deliveries→multiple invoices.
- advance.
- sale return.
- purchase+landed cost.
- purchase return.
- treasury receipt/disbursement/transfer.
- cheque.
- installment.
- repair lifecycle.
- follow-up/notification.
- reporting/drill-down.
- printing/export.

### Gate 18 — Release Candidate Gate

All required suites green on one SHA. No waiver for failed accounting/inventory/concurrency/security test.

---

# 25. PHASE 19 — Pilot Preparation

**Status:** `NOT_STARTED`

## 19.01 Pilot Environment

Use isolated customer-like server/environment with production-style configuration but not live business data unless approved.

## 19.02 Pilot Checklist

- installation.
- company/branch setup.
- users/roles.
- warehouse setup.
- treasury setup.
- products/variants/units.
- opening/migration process.
- printers.
- backup schedule.
- LAN clients.
- optional remote branch connectivity.

## 19.03 User Acceptance

Validate real workflows with user:

- sales.
- purchasing.
- inventory.
- treasury.
- customers/suppliers.
- repairs.
- reports.
- printing.

## 19.04 Pilot Defects

Defects are fixed on dedicated branches and all impacted gates rerun. No direct patch on customer server without corresponding source commit.

### Gate 19

- [ ] agreed pilot period completed.
- [ ] no Critical/High correctness defect open.
- [ ] backup/restore proven.
- [ ] accounting/inventory reconciliation accepted.
- [ ] operational workflow accepted.

---

# 26. PHASE 20 — Installer / Release / Handover

**Status:** `NOT_STARTED`

## 20.01 Server Installer / Bootstrap

Provide repeatable installer/bootstrap that:

- checks prerequisites.
- creates runtime directories.
- generates/requests secure secrets.
- starts PostgreSQL/backend/frontend stack.
- runs migrations.
- creates initial admin through safe setup flow.
- verifies health.
- does not require manual database editing.

## 20.02 Client Access

Client PCs do not require Docker.

Minimum V1 client path:

- supported browser/open application URL.
- optional shortcut/PWA/product shell later without changing backend architecture.

## 20.03 Versioning

Release tags, for example:

```text
v1.0.0-rc.1
v1.0.0-rc.2
v1.0.0
```

Every release points to immutable Git SHA and matching migration set.

## 20.04 Release Evidence

Store:

- final SHA.
- migration version.
- test summary.
- security result.
- backup/restore result.
- build checksum/artifact info.
- known limitations.
- installation instructions.

## 20.05 Main Merge

Only after explicit user approval:

- final PR from `agent/postgres-v1.7-core` to `main`.
- review.
- final gates on merge candidate.
- no force merge bypassing failed checks.

## 20.06 Handover Docs

Required:

- Installation Guide.
- Operations Runbook.
- Backup/Restore Guide.
- User Admin Guide.
- Release Notes.
- Migration/Cutover Guide where applicable.

### Gate 20 — V1 CLOSED

V1 يعتبر صالحًا للتشغيل فقط إذا:

- [ ] Central Backend + PostgreSQL يعملان بدون Convex runtime dependency.
- [ ] كل Business Modules المطلوبة تعمل.
- [ ] accounting/inventory results reconcile.
- [ ] concurrency suite ناجحة.
- [ ] security suite ناجحة.
- [ ] production build ناجح.
- [ ] LAN test ناجح.
- [ ] external-internet-off local LAN test ناجح.
- [ ] backup/restore ناجح.
- [ ] restart/autostart ناجح.
- [ ] printing/export ناجح.
- [ ] Pilot ناجح.
- [ ] installer/bootstrap مثبت.
- [ ] release evidence محفوظ.
- [ ] المستخدم وافق على الإصدار/الدمج.

---

# 27. Cross-Cutting Definition of Done

أي Feature أو Module لا يعتبر مكتملًا لمجرد أن UI يعمل.

## 27.1 Database

- migrations reproducible.
- constraints implemented.
- indexes match catalog.
- no speculative index.
- no direct balance truth outside approved ledgers/projections.

## 27.2 Backend

- permission/branch enforcement.
- idempotency where command is retriable/sensitive.
- correct locking.
- fixed lock order.
- transaction atomicity.
- stable error contract.
- audit/outbox where required.

## 27.3 Business Correctness

- expected inventory effect.
- expected financial effect.
- expected customer/supplier ledger effect.
- expected journal effect.
- expected reversal effect.

## 27.4 Tests

- unit.
- integration.
- database integrity.
- concurrency where relevant.
- accounting/inventory where relevant.
- security.
- production build.

## 27.5 Documentation

- public/internal contract updated.
- migration notes.
- operational impact.
- plan status/commit/PR updated.

---

# 28. Risk Register

| Risk | Severity | Prevention / Mitigation |
|---|---|---|
| Double Posting | Critical | Global idempotency + unique claim + transaction |
| Overselling | Critical | Stock Position locks + Reservations |
| Lost stock updates | Critical | No mutable product stock truth; row locks/projections |
| Wrong COGS | Critical | WA per Warehouse+Variant + immutable COGS snapshots |
| Backdated history rewrite | Critical | server posted_at + immutable history |
| Return race | Critical | lock source line + recalc posted returns |
| Advance double-use | Critical | FOR UPDATE advance + recalc applications |
| Installment overpayment | Critical | FOR UPDATE installment + allocation recalculation |
| Cheque double settlement | Critical | cheque status lock |
| One-sided treasury transfer | Critical | one ACID transaction |
| Journal imbalance | Critical | backend validation + deferred constraint trigger |
| Cross-branch leakage | Critical | backend scope + relational context constraints |
| Lost async event | High | transactional outbox |
| Duplicate async processing | High | idempotent consumers + unique constraints |
| Deadlocks | High | fixed global lock order + bounded retry |
| Duplicate document number | Critical | atomic sequence row allocation |
| Legacy/New dual writer | Critical | single-writer module cutover rule |
| Excess indexes | High | closed §28 catalog + EXPLAIN before additions |
| Slow reports | High | read models + query-driven indexes + measurement |
| Corrupted migration | Critical | dry run + reconciliation + source preservation |
| Backup unusable | Critical | mandatory restore drills |
| Server disk failure | Critical | off-machine backup/WAL; replica if stricter RPO required |
| Secret leak | Critical | ignored env files + no shared cloud secrets |
| Direct PostgreSQL exposure | Critical | internal network only, backend-only access |
| Big-bang UI rewrite | High | retain frontend and migrate module-by-module |
| Main branch destabilization | High | isolated integration branch + explicit main approval |
| Production Convex impact | Critical | no Local Edition operations against production |

---

# 29. Quality Gates Matrix

| Phase | Mandatory Gates |
|---|---|
| 00–01 | Baseline/freeze/current-state evidence |
| 02 | backend boot/build/transaction smoke |
| 03 | migration + DB integrity + index catalog |
| 04 | idempotency/sequence/outbox concurrency |
| 05 | auth/permissions/branch scope |
| 06 | counterparty/ledger integrity |
| 07 | catalog/units/barcode/SKU/pricing |
| 08 | inventory + concurrency + projection rebuild |
| 09 | finance/accounting + concurrency + balance reconciliation |
| 10 | purchase/landed cost/WA/returns/accounting |
| 11 | reservations/partial delivery/COGS/returns/advances |
| 12 | repairs/history/follow-up/notifications/security |
| 13 | reports/printing/export/workspace/i18n/performance |
| 14 | frontend cutover + zero runtime Convex dependency |
| 15 | migration rehearsal + reconciliation |
| 16 | LAN/security/no-external-internet |
| 17 | backup/restore/restart/autostart |
| 18 | full release candidate test matrix |
| 19 | pilot acceptance |
| 20 | installer/release evidence/main approval |

---

# 30. Execution Rules for Every Work Session

1. نقرأ `Current Execution Pointer` في آخر هذا الملف.
2. ننفذ **جزءًا واحدًا فقط** من المرحلة الحالية.
3. لا نقفز إلى Phase لاحقة قبل إغلاق Dependencies.
4. ChatGPT ينفذ بنفسه كل ما يمكن تنفيذه عبر GitHub/code/files/tests المتاحة.
5. إذا احتاجت خطوة جهاز المستخدم، يعطى **أمر CMD أو PowerShell واحد فقط**، مع شرح المتوقع، ثم ينتظر الناتج.
6. أي تغيير Business/Accounting/Inventory غير موجود في v1.7 لا يعتمد تلقائيًا.
7. لا Merge إلى main بدون موافقة صريحة.
8. لا تعديل Convex Cloud Production.
9. لا حذف Production data.
10. لا Force Push دون ضرورة وموافقة.
11. لا تغييرات مدمرة دون Backup/Rollback plan.
12. الاختبارات المطلوبة تعمل على نفس Final SHA للمرحلة.
13. بعد نجاح المرحلة يتم تحديث هذا الملف قبل الانتقال للمرحلة التالية.

---

# 31. Project Instruction Update — المطلوب بعد رفع هذا الملف

بعد إضافة هذا الملف إلى Project Knowledge/Files، يتم تحديث تعليمات المشروع بحيث يصبح ترتيب المراجع:

```text
1. Business-Tech-ERP-Architecture-Baseline-v1.7-Final.docx
2. Business-Tech-ERP-Master-Implementation-Plan-v1.0.md
3. Current repository state / code
4. Historical documents
```

وتضاف قاعدة تنفيذ:

> يتم العمل وفق Current Execution Pointer الموجود في Master Implementation Plan، مرحلة واحدة في كل مرة، ولا يتم إعلان أي Phase CLOSED إلا بعد نجاح Exit Criteria والاختبارات المطلوبة على نفس Commit.

ولا يغيّر Master Plan أي Business/Database/Index rule في v1.7؛ هو فقط يحدد كيفية تنفيذها وترتيب التنفيذ والتحقق.

---

# 32. Current Execution Pointer

**Current Phase:** `PHASE 06 — Counterparties & Master Data / 06.02 Phone Normalization`  
**Status:** `READY_TO_START`  
**Integration Branch:** `agent/postgres-v1.7-core`  
**Phase 01 Final SHA:** `b0d35101bf622264b655bcc574787989fadbcd83`  
**Phase 01 Validation PR:** `#183` — closed without merge.  
**Phase 02 Final SHA:** `922e880ab30b1a51bde14692063b321599d15948`  
**Phase 02 Validation PR:** `#184` — closed without merge.  
**03.01 Physical Naming Convention:** `CLOSED` on verified SHA `a58dd96af9ef5d792f0c15501fbf196fc903aeb1` — Primary CI run `34621383494` SUCCESS; `verify`, `backend-verify`, `browser-contract`, and `release-gate` all passed on the same SHA. Validation PR `#185` closed without merge.  
**03.02 PostgreSQL Extensions:** `CLOSED` on verified SHA `3a97e0f980de252eae34986ccd05c6b352f52558` — Primary CI run `34632905291` SUCCESS; `verify`, `backend-verify` (including PostgreSQL extension integration), `browser-contract`, and `release-gate` all passed on the same SHA. Validation PR `#186` closed without merge.  
**03.03 Data Types:** `CLOSED` on verified SHA `56b5c4aa01d42175149b1c66b7351881e85b0aec` — Primary CI run `34634609255` SUCCESS; `verify`, `backend-verify` (including PostgreSQL data type integration), `browser-contract`, and `release-gate` all passed on the same SHA. Validation PR `#187` closed without merge.  
**03.04 Migration Structure:** `CLOSED` on verified SHA `0663ad8bcf749621088db81ca8c5532ca005a538` — Primary CI run `34641305916` SUCCESS; `verify`, `backend-verify` (including PostgreSQL migration framework integration), `browser-contract`, and `release-gate` all passed on the same SHA. Validation PR `#188` closed without merge.  
**03.05 Schema Build Order:** `CLOSED` on verified SHA `0734525dcd084e4687d64d65dbf3140787b5b8f6` after closure of 03.A through 03.J; Primary final CI run `34777335703` SUCCESS and Validation PR `#198` closed without merge.  
**03.A Infrastructure / Organization / Security:** `CLOSED` on verified SHA `366a4f71df2cd5ee14a5df5fb12881edf0a11be6` — Primary CI run `34643504083`; one same-SHA retry of `verify` was required after a transient Chromium `ERR_STREAM_PREMATURE_CLOSE`, then `verify`, `backend-verify` (including PostgreSQL core infrastructure schema integration), `browser-contract`, and `release-gate` all passed. Validation PR `#189` closed without merge.  
**03.B Counterparties:** `CLOSED` on verified SHA `090e8667a7525a99a2ddc1a6336fcedbe5825547` — Primary CI run `34644994900` SUCCESS بدون rerun; `verify`, `backend-verify` (including PostgreSQL counterparties schema integration), `browser-contract`, and `release-gate` all passed on the same SHA. Validation PR `#190` closed without merge.  
**03.C Product Catalog:** `CLOSED` on verified SHA `aa82737ea10294f9f227b01ce7a57a93f68a64a8` — Primary CI run `34645972595` SUCCESS بدون rerun; `verify`, `backend-verify` (including PostgreSQL product catalog schema integration plus 03.A/03.B regressions), `browser-contract`, and `release-gate` all passed on the same SHA. Validation PR `#191` closed without merge.  
**03.D Inventory:** `CLOSED` on verified SHA `b08fed2cd78d55a53eb9278ccd9e3725e5e125a2` — Primary CI run `34647882649` SUCCESS بدون rerun; `verify`, `backend-verify` (including PostgreSQL Inventory schema integration plus 03.A/03.B/03.C regressions), `browser-contract`, and `release-gate` all passed on the same SHA. Validation PR `#192` closed without merge.  
**03.E Sales:** `CLOSED` on verified SHA `76fcbdd0ea973ca1e2d3bba6fb6ddaeaef0426d1` — Primary CI run `34649716604` SUCCESS بدون rerun; `verify`, `backend-verify` (including PostgreSQL Sales schema integration plus 03.A/03.B/03.C/03.D regressions), `browser-contract`, and `release-gate` all passed on the same SHA. Validation PR `#193` closed without merge.  
**03.F Purchasing / Tax:** `CLOSED` on verified SHA `b7e3779787fdfc9b344d1eea2ef869015e8d872c` — Primary CI run `34651307640` SUCCESS بدون rerun; `verify`, `backend-verify` (including PostgreSQL Purchasing/Tax schema integration plus 03.A/03.B/03.C/03.D/03.E regressions), `browser-contract`, and `release-gate` all passed on the same SHA. Validation PR `#194` closed without merge.  
**03.G Finance / Settlement:** `CLOSED` on verified SHA `a2f62f706ad21cababca93ba72e7771541b6e73b` — Primary CI run `34770538442` SUCCESS بدون rerun; `verify`, `backend-verify` (including PostgreSQL Finance/Settlement schema integration plus 03.A/03.B/03.C/03.D/03.E/03.F regressions), `browser-contract`, and `release-gate` all passed on the same SHA. Validation PR `#195` closed without merge.  
**03.H Accounting:** `CLOSED` on verified SHA `68c6a001ea7253fb2971d9f8289b4227205aad37` — Primary CI run `34771923882` SUCCESS بدون rerun; `verify`, `backend-verify` (including PostgreSQL Accounting schema/deferred-balance integration plus 03.A through 03.G regressions), `browser-contract`, and `release-gate` all passed on the same SHA. Validation PR `#196` closed without merge.  
**03.I Repairs / Follow-Up / Notifications:** `CLOSED` on verified SHA `fc0acc9b325f98d34cf6a5ebace450425ec02395` — Primary CI run `34773141914` SUCCESS بدون rerun; `verify`, `backend-verify` (including PostgreSQL Repairs/Follow-Up/Notifications schema integration plus 03.A through 03.H regressions), `browser-contract`, and `release-gate` all passed on the same SHA. Validation PR `#197` closed without merge.  
**03.J Printing / Export / Reports Read Models:** `CLOSED` on verified SHA `0734525dcd084e4687d64d65dbf3140787b5b8f6` — Primary final CI run `34777335703` SUCCESS بدون rerun بعد الإصلاح؛ `verify`, `backend-verify` (including Migration Framework, PostgreSQL 17 regressions 03.A through 03.I, and PostgreSQL 03.J Printing/Export/Reporting Read Models schema integration), `browser-contract`, and `release-gate` all passed on the same SHA. Validation PR `#198` closed without merge.  
**03.06 Constraints:** `CLOSED` — Gap Analysis complete; all executable constraint slices closed through migration `0021_printing_export_reporting_read_models_constraints`; ADR-0017 through ADR-0023 accepted as applicable.  
**03.06 Final Verified SHA:** `abe8587ef7a08cdb607e283ad01937bc9332247c`.  
**03.06 Final CI:** run `35251535466` (Run `#935`) — `verify`, `backend-verify`, `browser-contract`, and `release-gate` all SUCCESS on the same SHA; PostgreSQL 17 Printing / Export / Reporting Read Models schema and behavioral integration gates both passed.  
**03.06 Validation PR:** `#208` — CLOSED WITHOUT MERGE; `merged=false`.  
**Installment Status Decision:** canonical V1 values remain `UPCOMING / DUE / PARTIAL / PAID / OVERDUE`.  
**03.07 Index Catalog:** `CLOSED` — Pre-DDL reconciliation, Exact Index Inventory, Forward Migration `0022_index_catalog`, and PostgreSQL 17 exact catalog verification completed.  
**03.07 Frozen Inventory:** `docs/gap-analysis/phase-03-07-index-inventory.md` — 231 classified decisions: 74 already satisfied, 155 implemented by `0022`, 2 omitted by ADR-0024, 0 blocked.  
**03.07 Implementation Validation:** Run `#941` / `35303952439` SUCCESS on code SHA `ba7eda5ee52f4b021d0afa36b7ab71653d0adb69`, including exact index-catalog integration, full backend regressions/build/smoke, `verify`, `browser-contract`, and `release-gate`.  
**03.07 Validation PR:** `#211` — CLOSED WITHOUT MERGE; `merged=false`.  
**03.08 DDL Verification:** `CLOSED` — reused the already-closed 03.06/03.07 PostgreSQL 17 evidence without duplicating DDL, and added only the missing case-insensitive user identity + no-direct-PostgreSQL-exposure gates.  
**03.08 Coverage:** `docs/gap-analysis/phase-03-08-ddl-verification.md`.  
**03.08 Implementation Validation:** Run `#944` / `35372123130` SUCCESS on code SHA `18f9b39a7a113a72dc71bb3f5092027506a6ec28`; `verify`, `backend-verify`, dedicated PostgreSQL 17 DDL gate, `browser-contract`, and `release-gate` all SUCCESS.  
**03.08 Final Verified SHA:** `4e0d22b7317af75641e8285725a520b846ef3359`.  
**03.08 Final CI:** Run `#945` / `35372431829` — SUCCESS; `verify`, `backend-verify`, PostgreSQL 17 DDL gate, `browser-contract`, and `release-gate` all SUCCESS on the same SHA.  
**03.08 Validation PR:** `#212` — CLOSED WITHOUT MERGE; `merged=false`.  
**PHASE 03:** `CLOSED`.  
**04.01 Idempotency Service:** `CLOSED` — Gap Analysis at `docs/gap-analysis/phase-04-01-idempotency-service.md`; canonical request hashing, transaction-bound claim/replay, payload mismatch rejection, rollback safety, known incomplete state handling, and bounded expiry cleanup implemented without schema/index changes.  
**04.01 Implementation SHA:** `c39f99f7f16c95b099d157e3c784c6b5453c5eb1`.  
**04.01 Implementation CI:** Run `#946` / `35377090817` — SUCCESS; PostgreSQL 17 eight-way parallel same-key gate and all regressions passed.  
**04.01 Final Verified SHA:** `fbdf02053f905178c209dedb293cd5d8eafe321f`.  
**04.01 Final CI:** Run `#947` / `35377348558` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 Idempotency Service integration, `browser-contract`, and `release-gate` all SUCCESS on the same SHA.  
**04.01 Validation PR:** `#213` — CLOSED WITHOUT MERGE; `merged=false`.  
**04.02 Document Sequence Service:** `CLOSED` — Gap Analysis at `docs/gap-analysis/phase-04-02-document-sequence-service.md`; transaction-bound late allocation via atomic UPSERT/RETURNING, branch/type scope isolation, rollback safety, 32-worker contention safety, and no-reuse-after-deletion proof completed without schema/index changes.  
**04.02 Implementation SHA:** `eb1c02035bd1dc91e7045e3d6ed08e23b9342acd`.  
**04.02 Implementation CI:** Run `#949` / `35380340039` — SUCCESS; PostgreSQL 17 32-worker sequence gate and all regressions passed.  
**04.02 Final Verified SHA:** `20119820d41a24dd9f3bb235e7425ed9303e97a2`.  
**04.02 Final CI:** Run `#950` / `35380599348` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 Document Sequence Service integration, `browser-contract`, and `release-gate` all SUCCESS on the same SHA.  
**04.02 Validation PR:** `#214` — CLOSED WITHOUT MERGE; `merged=false`.  
**04.03 Posting Batch Service:** `CLOSED` — Gap Analysis at `docs/gap-analysis/phase-04-03-posting-batch-service.md`; insert-only transaction-bound Posting Batch creation, server `posted_at`, source traceability, reversal self-reference locking/validation, and rollback atomicity completed without schema/index changes.  
**04.03 Implementation SHA:** `60d25e108a37bdfb6adbfad261c87f674fbf62d0`.  
**04.03 Implementation CI:** Run `#951` / `35389332195` — SUCCESS; PostgreSQL 17 Posting Batch gate and all regressions passed.  
**04.03 Final Verified SHA:** `f93a298665894f68f53d8f8e9194b2f11a278046`.  
**04.03 Final CI:** Run `#952` / `35389542327` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 Posting Batch Service integration, `browser-contract`, and `release-gate` all SUCCESS on the same SHA.  
**04.03 Validation PR:** `#215` — CLOSED WITHOUT MERGE; `merged=false`.  
**04.04 Audit Service:** `CLOSED` — Gap Analysis at `docs/gap-analysis/phase-04-04-audit-service.md`; append-only transaction-bound Audit recording, server `created_at`, JSONB Before/After snapshots, nullable system context, frozen index inventory verification, and rollback atomicity completed without schema/index changes.  
**04.04 Implementation SHA:** `106770cd0a699edc9f3f68bf5a6386ac1ced1281`.  
**04.04 Implementation CI:** Run `#953` / `35389984264` — SUCCESS; PostgreSQL 17 Audit Service gate and all regressions passed.  
**04.04 Final Verified SHA:** `5fa53e6cc6f02db06c03b52201b8141bb56ba384`.  
**04.04 Final CI:** Run `#954` / `35390227804` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 Audit Service integration, `browser-contract`, and `release-gate` all SUCCESS on the same SHA.  
**04.04 Validation PR:** `#216` — CLOSED WITHOUT MERGE; `merged=false`.  
**04.05 Transactional Outbox:** `CLOSED` — Gap Analysis at `docs/gap-analysis/phase-04-05-transactional-outbox.md`; source-transaction enqueue, `FOR UPDATE SKIP LOCKED` workers, SAVEPOINT failure isolation, retry management, processed-at discipline, restart survival, stable event-id consumer idempotency identity, and two-worker no-duplicate logical result proof completed without schema/index changes.  
**04.05 Implementation SHA:** `b476939de62c00b9ebdad942c985513a76e2fb79`.  
**04.05 Implementation CI:** Run `#955` / `35391957524` — SUCCESS; PostgreSQL 17 Transactional Outbox gate and all regressions passed.  
**04.05 Final Verified SHA:** `0b9cbb70511e9df3a08bbb0311452bded0e7d7e6`.  
**04.05 Final CI:** Run `#956` / `35392258769` — SUCCESS on the final same-SHA rerun; `verify`, `backend-verify` including PostgreSQL 17 Transactional Outbox integration, `browser-contract`, and `release-gate` all SUCCESS.  
**04.05 Validation PR:** `#217` — CLOSED WITHOUT MERGE; `merged=false`.  
**04.06 Error Mapping:** `CLOSED` — Gap Analysis at `docs/gap-analysis/phase-04-06-error-mapping.md`; centralized stable `errorCode + safe params` contract, known Business error mapping, PostgreSQL SQLSTATE mapping, validation/concurrency mapping, and explicit redaction of SQL/driver/runtime internals completed without schema/index changes.  
**04.06 Implementation SHA:** `40e86d4e2937c9d9f2db3b3ebdcec50b8da9a048`.  
**04.06 Implementation CI:** Run `#957` / `35395761123` — SUCCESS; PostgreSQL 17 Error Mapping gate and all regressions passed.  
**04.06 Final Verified SHA:** `bbccbfccd30e5797e9434b1880241429108233ad`.  
**04.06 Final CI:** Run `#958` / `35396088571` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 Error Mapping integration, `browser-contract`, and `release-gate` all SUCCESS on the same SHA.  
**04.06 Validation PR:** `#218` — CLOSED WITHOUT MERGE; `merged=false`.  
**PHASE 04:** `CLOSED` — all Gate 04 items complete.  
**05.01 Authentication:** `CLOSED` — Gap Analysis at `docs/gap-analysis/phase-05-01-authentication.md`; backend-owned Login/Refresh/Logout/Me, Scrypt password hashing, hashed rotating refresh sessions, short-lived signed access tokens, session revocation/expiry, disabled-user enforcement, secure refresh-cookie transport, login rate limiting, and secret redaction completed without schema/index changes.  
**05.01 Verified Implementation SHA:** `3558211d6db2dcac1a00c52b92747268fa17ebfd`.  
**05.01 Implementation CI:** Run `#962` / `35415190981` — SUCCESS; PostgreSQL 17 Authentication gate and all regressions passed.  
**05.01 Final Verified SHA:** `ebbecc688f64f8e51da3a65a1ac72a54f5882b2c`.  
**05.01 Final CI:** Run `#963` / `35415324053` — SUCCESS on the final documentation SHA.  
**05.01 Validation PR:** `#219` — CLOSED WITHOUT MERGE; `merged=false`.  
**05.02 Roles:** `CLOSED` — exact seven-role backend catalog, idempotent/concurrency-safe initialization, metadata reconciliation with ID preservation, and custom-role preservation completed without schema/index changes.  
**05.02 Verified Implementation SHA:** `d5aaa05d8b071120c4a5f622c62494f436d59301`.  
**05.02 Implementation CI:** Run `#964` / `35439920395` — SUCCESS; PostgreSQL 17 Role Catalog gate and all regressions passed.  
**05.02 Final Verified SHA:** `624e99c67726bad237bd307ec6a41afb223b22e6`.  
**05.02 Final CI:** Run `#965` / `35440053601` — SUCCESS on the final documentation SHA.  
**05.02 Validation PR:** `#220` — CLOSED WITHOUT MERGE; `merged=false`.  
**05.03 Effective Permissions:** `CLOSED` — Gap Analysis at `docs/gap-analysis/phase-05-03-effective-permissions.md`; backend-only resolver implements `Role Default → User ALLOW/DENY Override → Effective Permission`, logical `INHERIT` by absence of an override row, fail-closed handling for inactive/missing users and unknown permissions, and stable `PERMISSION_DENIED` mapping. No Branch Scope/schema/index/frontend/Convex cutover changes.  
**05.03 Verified Implementation SHA:** `01f2e5c683a90b2465b8147a396fab394637ecbc`.  
**05.03 Implementation CI:** Run `#966` / `35481086538` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 Effective Permissions integration, `browser-contract`, and `release-gate` all SUCCESS on the same implementation SHA.  
**05.03 Final Verified SHA:** `ab17ebe3d3ef78a495143668d8d83d347b428475`.  
**05.03 Final CI:** Run `#967` / `35481193186` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 Effective Permissions integration, `browser-contract`, and `release-gate` all SUCCESS on the final documentation SHA.  
**05.03 Validation PR:** `#221` — CLOSED WITHOUT MERGE; `merged=false`.  
**05.04 Branch Scope:** `CLOSED` — Gap Analysis at `docs/gap-analysis/phase-05-04-branch-scope.md`; Backend SELECTED/ALL resolver, transaction-bound Effective Permission + Branch Scope enforcement, default-branch integrity proofs, and cross-branch fail-closed behavior completed without schema/index/frontend changes.  
**05.04 Verified Implementation SHA:** `9826a8d187ec84627c20c9eb6ca9ad6dfd3101a8`.  
**05.04 Implementation CI:** Run `#969` / `35481723808` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 Branch Scope integration, `browser-contract`, and `release-gate` all SUCCESS on the same implementation SHA.  
**05.04 Final Verified SHA:** `4fad9168cf99ee544f94dabee3bed5d3176468f7`.  
**05.04 Final CI:** Run `#971` / `35481834283` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 Branch Scope integration, `browser-contract`, and `release-gate` all SUCCESS on the final documentation SHA.  
**05.04 Validation PR:** `#222` — CLOSED WITHOUT MERGE; `merged=false`.  
**05.05 Organization:** `CLOSED` — Gap Analysis at `docs/gap-analysis/phase-05-05-organization.md`; Company Settings, atomic Branch + default Warehouse creation, Branch active/inactive lifecycle, official default Warehouse via `branch_settings`, Warehouse history safety, historical Warehouse deactivation, stable Organization errors, and Organization Audit completed without schema/index/frontend changes.  
**05.05 Verified Implementation SHA:** `1c5c3cdd582713c1e4c655ab5ee9c27519a647f9`.  
**05.05 Implementation CI:** Run `#972` / `35482306897` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 Organization integration, `browser-contract`, and `release-gate` all SUCCESS on the same implementation SHA.  
**05.05 Final Verified SHA:** `b848489f16db3fffd9c9d3e0fb3e448d5bd5344e`.  
**05.05 Final CI:** Run `#974` / `35482420355` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 Organization integration, `browser-contract`, and `release-gate` all SUCCESS on the final documentation SHA.  
**05.05 Validation PR:** `#223` — CLOSED WITHOUT MERGE; `merged=false`.  
**Gate 05 Last/System Admin Protection:** `CLOSED` — final policy at `docs/gap-analysis/phase-05-gate-last-system-admin.md`: at least one active canonical `SYSTEM_ADMIN` must remain; custom roles do not count; last active Admin disable/demotion is rejected; promotion/enable is allowed; concurrent removals serialize on the canonical role row with `FOR UPDATE`.  
**Gate 05 Verified Implementation SHA:** `6b7f6dd4f1297580c9ca682ee7a1e9479602b28b`.  
**Gate 05 Implementation CI:** Run `#975` / `35482913070` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 last System Admin protection/concurrency integration, `browser-contract`, and `release-gate` all SUCCESS on the same implementation SHA.  
**Gate 05 Final Verified SHA:** `f9f35046a8451f171b73aff3ccb28e3a2dcdae6b`.  
**Gate 05 Final CI:** Run `#977` / `35483023556` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 last System Admin protection/concurrency integration, `browser-contract`, and `release-gate` all SUCCESS on the final documentation SHA.  
**Gate 05 Validation PR:** `#224` — CLOSED WITHOUT MERGE; `merged=false`.  
**PHASE 05:** `CLOSED` — Authentication, Roles, Effective Permissions, Branch Scope, Organization, and all Gate 05 checks are complete.  
**06.01 Unified Counterparty:** `CLOSED` — Gap Analysis at `docs/gap-analysis/phase-06-01-unified-counterparty.md`; one canonical Counterparty identity now supports CUSTOMER/SUPPLIER/OTHER roles, Customer+Supplier coexistence on one ID, optional role-specific profiles, duplicate-safe concurrent role addition, non-destructive active/inactive lifecycle, Audit, and stable Counterparty error mapping. No phone-normalization or ledger-command work was included.  
**06.01 Verified Implementation SHA:** `0a89fba47d243bac5f47c38eb51439292ea4afb0`.  
**06.01 Implementation CI:** Run `#978` / `35483368078` — SUCCESS; `verify`, `backend-verify` including PostgreSQL 17 Unified Counterparty service integration, `browser-contract`, and `release-gate` all SUCCESS on the same implementation SHA.  
**06.01 Validation PR:** `#225` — validation-only; close WITHOUT MERGE after final same-SHA documentation validation.  
**Next Action:** execute **06.02 Phone Normalization only** after final 06.01 documentation-SHA validation.  
**Forbidden Next Actions:** لا 06.03 قبل إغلاق 06.02، لا Phase 07، لا Frontend cutover، لا dual write، لا `main` merge، ولا Convex Production change.

**Plan update — 2026-09-17 / ACCOUNTING CONSTRAINTS CLOSED:** تم إغلاق ثامن executable slice من 03.06 على SHA `ef03d141958c392032bd8caf16b5f880a193e86e`. Migration `0019`، ADR-0021، Accounting PK/FK/UNIQUE/CHECK layer، Finance Category → GL Account FK، والحفاظ على deferred Journal balance at COMMIT تم التحقق منهم فعليًا على PostgreSQL 17؛ Full CI run `35224498880` أخضر بالكامل وPR `#206` أُغلق بدون Merge. 03.06 ما زالت `IN_PROGRESS` و03.07 لم تبدأ.

**Plan update — 2026-09-17 / REPAIRS-FOLLOW-UP-NOTIFICATIONS CONSTRAINTS CLOSED:** تم إغلاق تاسع executable slice من 03.06 على SHA `e7e6c2c63f81913a6c16d15168209c882db29426`. Migration `0020` وADR-0022 وRepairs/Follow-Up/Notifications PK/FK/UNIQUE/CHECK layer والـ3 integrity partial-unique rules تم التحقق منهم فعليًا على PostgreSQL 17؛ Full CI run `35241250197` / Run `#921` أخضر بالكامل، بما في ذلك Repairs schema + behavioral gates، وPR `#207` أُغلق بدون Merge. 03.06 ما زالت `IN_PROGRESS` لأن Printing / Export / Reporting Read Models constraints لم تُغلق بعد، و03.07 لم تبدأ.

---


**Plan update — 2026-09-20 / 06.01 UNIFIED COUNTERPARTY CLOSED:** تم إغلاق 06.01 وظيفيًا على SHA `0a89fba47d243bac5f47c38eb51439292ea4afb0` بعد Full CI Run `#978` / `35483368078` SUCCESS. تم تنفيذ هوية Counterparty واحدة مشتركة مع Roles `CUSTOMER/SUPPLIER/OTHER`، وإثبات أن نفس الحساب يكون Customer+Supplier على نفس ID مع Customer/Supplier Profiles اختيارية، ومنع mismatch بين الـProfile والـRole، وidempotent concurrent role add مع composite PK كحماية نهائية، وactive/inactive lifecycle وAudit وstable error contract. PostgreSQL 17 أثبت 8-way repeated role add ينتج Role Pair واحدًا فقط، والـLedger tables ظلت untouched، و`normalized_phone` بقي NULL وغير محسوب لأن Phone Normalization تظل 06.02. لا Migration ولا Index جديد ولا Frontend/Convex cutover. Gate 06 أصبح مكتملًا في بندي same account Customer+Supplier وno duplicate role pair فقط. Next Action بعد final documentation-SHA CI: 06.02 Phone Normalization فقط.

**Plan update — 2026-09-20 / 06.01 UNIFIED COUNTERPARTY STARTED:** تم عمل Gap Analysis مقابل Architecture Baseline v1.7 وMaster Plan. الـSchema الحالي `counterparties/counterparty_roles/customer_profiles/supplier_profiles` والـPK/FK/CHECK والـFrozen Index Catalog موجودون ومتوافقون، لذلك لا Migration ولا Index جديد. التنفيذ يضيف Backend `CounterpartyService` لهوية واحدة مشتركة مع Roles `CUSTOMER/SUPPLIER/OTHER` وإمكانية الجمع بين Customer+Supplier على نفس ID، Profiles اختيارية مرتبطة بالدور، role add idempotent مع بقاء composite PK كحماية نهائية، active/inactive lifecycle، Audit وstable error contract. `normalized_phone` لا يتم حسابه في 06.01 لأن 06.02 فقط هي المسؤولة عن Phone Normalization/Search، وLedgers تظل 06.03. لا Frontend/Convex cutover ولا dual write.

**Plan update — 2026-09-20 / GATE 05 LAST-SYSTEM-ADMIN PROTECTION CLOSED:** تم إغلاق آخر Gate في Phase 05 على SHA `6b7f6dd4f1297580c9ca682ee7a1e9479602b28b` بعد Full CI Run `#975` / `35482913070` SUCCESS. السياسة النهائية المثبتة: يجب أن يبقى دائمًا Active canonical `SYSTEM_ADMIN` واحد على الأقل؛ Custom Roles لا تُحسب حتى لو `is_system=true`؛ تعطيل/Demote آخر Admin يُرفض، بينما Enable/Promote مسموحان. الحماية تستخدم canonical role row كـserialization guard بـ`FOR UPDATE` تحت `READ COMMITTED`، واختبارات PostgreSQL 17 أثبتت أن محاولتي Disable أو Demotion المتزامنتين لا تنجحان معًا وأن العدد لا يصل للصفر. Audit وstable error contract نجحا، والـFrozen Index Catalog بقي بلا تغيير، ولا Migration أو Index جديد. بذلك PHASE 05 أصبحت CLOSED. Phase 06 لم تبدأ؛ Next Action بعد final documentation-SHA CI: 06.01 Unified Counterparty فقط.

**Plan update — 2026-09-20 / GATE 05 LAST-SYSTEM-ADMIN PROTECTION STARTED:** بناءً على طلب حسم السياسة، تم تثبيت Final Policy بدل ترك الـGate معلقة: يجب أن يبقى دائمًا مستخدم نشط واحد على الأقل بدور `SYSTEM_ADMIN` القياسي؛ Custom Roles لا تُحسب حتى لو `is_system=true`. تعطيل أو Demote آخر Active System Admin يُرفض، بينما التفعيل/الترقية مسموحان. التنفيذ يستخدم صف `SYSTEM_ADMIN` نفسه كـserialization guard بـ`SELECT ... FOR UPDATE` ثم يقفل المستخدم المستهدف، بحيث محاولتا Disable/Demotion المتزامنتان لا تنجحان معًا تحت `READ COMMITTED`. تمت إضافة Backend protection service وAudit وstable error contract واختبار PostgreSQL 17 concurrency، بدون Migration أو Index أو Phase 06 أو Frontend/Convex cutover. الـGate ما زالت IN_PROGRESS لحين نجاح Full CI على نفس SHA.

**Plan update — 2026-09-20 / 05.05 ORGANIZATION CLOSED:** تم إغلاق 05.05 وظيفيًا على SHA `1c5c3cdd582713c1e4c655ab5ee9c27519a647f9` بعد Full CI Run `#972` / `35482306897` SUCCESS. تم تنفيذ Company Settings، إنشاء Branch + Default Warehouse + Branch Settings داخل Transaction واحدة، active/inactive Branch lifecycle دون حذف فعلي، اعتماد `branch_settings.default_warehouse_id` كمصدر Default Warehouse الوحيد، منع نقل/تعطيل الـDefault Warehouse، منع نقل Warehouse بعد Inventory Movements في Backend مع بقاء Composite FK كحماية DB نهائية، السماح بتعطيل المخزن التاريخي بدل حذفه، وAudit/rollback atomicity. لا Migration ولا Index جديد، ولم يبدأ Phase 06. 05.05 CLOSED لكن PHASE 05 لا تُغلق لأن Gate حماية آخر/System Admin ما زالت بلا final policy في official sources؛ لا يتم اختراعها. PR `#223` validation-only يخضع الآن لـFull CI نهائي على documentation closure SHA قبل إغلاقه بدون Merge.

**Plan update — 2026-09-20 / 05.05 ORGANIZATION STARTED:** تم عمل Gap Analysis مقابل Architecture Baseline v1.7 وMaster Plan. جداول `companies/company_settings/branches/branch_settings/warehouses` والقيود المعتمدة موجودة ومتوافقة، بما فيها حماية Default Warehouse الفعال داخل نفس الفرع وComposite Warehouse+Branch FK لحركات المخزون، والـFrozen Index Catalog مكتمل؛ لذلك لا Migration ولا Index جديد. التنفيذ يضيف Organization Service للـCompany Settings، إنشاء Branch + Default Warehouse + Branch Settings بصورة Atomic، active/inactive lifecycle بدون حذف فعلي، Default Warehouse من `branch_settings` فقط، منع نقل Default Warehouse أو Warehouse له Inventory Movements، السماح بتعطيل المخزن التاريخي، وAudit داخل نفس Transaction. بند last/system admin protection يظل Gate منفصلًا مفتوحًا لأن official sources لا تحدد final command policy، ولن تُخترع داخل 05.05. Phase 06 وFrontend/Convex cutover ممنوعان.

**Plan update — 2026-09-20 / 05.04 BRANCH SCOPE CLOSED:** تم إغلاق التنفيذ الوظيفي على SHA `9826a8d187ec84627c20c9eb6ca9ad6dfd3101a8` بعد Full CI Run `#969` / `35481723808` SUCCESS. تم تنفيذ Backend Branch Scope للوضعيْن `SELECTED/ALL`، واستخدام `user_branch_access` مع SELECTED، وfail-closed للوصول Cross-Branch غير المسموح والمستخدم غير الفعال/المفقود والفرع غير الموجود، مع transaction-bound Effective Permission + Branch Scope recheck للعمليات الحساسة. PostgreSQL 17 أثبت حماية `default_branch_id` بالـDeferred Constraints، وعدم احتياج ALL لأي mapping rows، وثبات Frozen Index Catalog وعدم إضافة Migration أو Index. 05.05 Organization لم يبدأ. PR `#222` validation-only ويخضع الآن لـFull CI نهائي على documentation closure SHA قبل إغلاقه بدون Merge. Next Action بعد نجاحه: 05.05 Organization فقط.

**Plan update — 2026-09-20 / 05.04 BRANCH SCOPE STARTED:** تم عمل Gap Analysis مقابل Architecture Baseline v1.7 وMaster Plan. الـSchema الحالي يحتوي بالفعل على `branch_scope_mode = SELECTED/ALL` و`user_branch_access` وDeferred Constraints لحماية `default_branch_id`، مع Frozen Index Catalog مناسب؛ لذلك لا Migration ولا Index جديد. التنفيذ يضيف Backend Branch Scope resolver وBranch-scoped authorization يعيد فحص Effective Permission + Branch Scope داخل نفس Transaction للعمليات الحساسة، مع fail-closed للمستخدم غير الفعال/المفقود والفرع غير الموجود والوصول Cross-Branch غير المسموح. 05.05 Organization وFrontend/Convex cutover خارج النطاق.

**Plan update — 2026-09-20 / 05.03 EFFECTIVE PERMISSIONS CLOSED:** تم إغلاق التنفيذ الوظيفي على SHA `01f2e5c683a90b2465b8147a396fab394637ecbc` بعد Full CI Run `#966` / `35481086538` SUCCESS. تم تنفيذ Backend Effective Permission resolver بالترتيب المعتمد `Role Default → User ALLOW/DENY Override → Effective Permission`، مع `INHERIT` بعدم وجود override row، fail-closed للمستخدم غير الفعال/المفقود وPermission غير الموجودة، و`PERMISSION_DENIED` public contract آمن. PostgreSQL 17 أثبت default allow/deny وALLOW/DENY precedence والرجوع إلى Role Default بعد حذف override، مع بقاء `user_branch_access` دون استخدام وإثبات عدم إضافة Migration أو Index. لم يتم نسخ Permission Matrix القديمة من Convex ولم يبدأ Branch Scope. PR `#221` validation-only ويخضع الآن لـFull CI نهائي على documentation closure SHA قبل إغلاقه بدون Merge. Next Action بعد نجاحه: 05.04 Branch Scope فقط.

**Plan update — 2026-09-20 / 05.03 EFFECTIVE PERMISSIONS STARTED:** تم عمل Gap Analysis مقابل Architecture Baseline v1.7 وMaster Plan. جداول `permissions` و`role_permissions` و`user_permission_overrides` والـPK/FK/CHECK/UNIQUE المعتمدة موجودة ومتوافقة، لذلك لا Migration ولا Index جديد. التنفيذ يضيف Backend Effective Permission resolver بالترتيب `Role Default → User ALLOW/DENY Override → Effective`، ويمثل `INHERIT` بعدم وجود Override row، ويفشل مغلقًا للمستخدم غير الفعال/المفقود أو Permission غير الموجودة. لا يتم نسخ Permission Matrix القديمة من Convex لأن v1.7 لا يجمّد قائمة technical keys/role grants كاملة في هذا الجزء ولأنها تحتوي Legacy roles خارج الأدوار السبعة الرسمية. Branch Scope يظل 05.04 فقط، ولا Frontend/Convex cutover.

**Plan update — 2026-09-19 / 05.02 ROLES CLOSED:** تم إغلاق التنفيذ الوظيفي على SHA `d5aaa05d8b071120c4a5f622c62494f436d59301` بعد Full CI Run `#964` / `35439920395` SUCCESS. تم تثبيت الكتالوج الرسمي للأدوار السبعة بمفاتيح Master Plan، مع idempotent multi-row UPSERT على `UNIQUE(role_key)`، واختبار 16-way concurrent initialization، وتصحيح metadata drift مع الحفاظ على نفس role ID والـreferences، وعدم حذف custom roles. `role_permissions` بقي بلا أي seed لإبقاء 05.03 خارج النطاق. لا Migration ولا Index جديد، ولا Role Management API قبل Authorization. Gate `role defaults tests` أصبح مكتملًا. Gate حماية آخر/System Admin يظل مفتوحًا لأن Baseline الذي تمت مراجعته لا يحدد command policy كاملة لهذه الحالة، ولن تُخترع داخل 05.02. PR `#220` validation-only يخضع الآن لـFull CI نهائي على documentation closure SHA قبل إغلاقه بدون Merge. Next Action بعد نجاحه: 05.03 Effective Permissions فقط.

**Plan update — 2026-09-19 / 05.02 ROLES STARTED:** تم عمل Gap Analysis مقابل Architecture Baseline v1.7 وMaster Plan. جدول `roles(id, role_key, display_name_key, is_system)` و`UNIQUE(role_key)` موجودان ومتوافقان، ولا يوجد Backend Role Catalog حالي. التنفيذ يضيف catalog backend-only للأدوار السبعة الرسمية `SYSTEM_ADMIN / BRANCH_MANAGER / ACCOUNTANT / SALES / CUSTOMER_SERVICE / TECHNICIAN / WAREHOUSE_KEEPER` باستخدام idempotent multi-row UPSERT داخل READ COMMITTED transaction؛ يصحح metadata drift لنفس `role_key` إلى `is_system=true` ويحافظ على الـID والـreferences الموجودة، ولا يحذف custom roles. لا Permission grants ولا Overrides ولا Branch Scope ولا API management في 05.02؛ هذه تظل 05.03/05.04. لا Migration ولا Index جديد.

**Plan update — 2026-09-19 / 05.01 AUTHENTICATION CLOSED:** تم إغلاق التنفيذ الوظيفي على SHA `3558211d6db2dcac1a00c52b92747268fa17ebfd` بعد Full CI Run `#962` / `35415190981` SUCCESS. Backend Auth أصبح يملك login/refresh/logout/me، Scrypt password hashes فقط، refresh-token hashes فقط، revocable/expiring sessions، refresh rotation، short-lived access tokens موقعة بـserver-only secret ومربوطة بالـsession/current refresh hash، disabled-account enforcement، HttpOnly/SameSite=Strict cookie مع Secure في HTTPS mode، وlogin rate limiting. الـsecurity scan وsecret redaction نجحا. Runs `#959` و`#960` و`#961` كانت تشخيصية وأغلقت مشاكل test fixture/typecheck/test-isolation قبل نجاح Run `#962`. لا Migration ولا Index جديد، ولا Frontend/Convex Auth cutover. PR `#219` validation-only ويخضع الآن لـFull CI نهائي على documentation closure SHA قبل إغلاقه بدون Merge. Next Action بعد نجاحه: 05.02 Roles فقط.

**Plan update — 2026-09-19 / 05.01 AUTHENTICATION STARTED:** تم عمل Gap Analysis مقابل Architecture Baseline v1.7. جداول `users` و`auth_sessions` والـcase-insensitive user identity indexes و`UNIQUE(refresh_token_hash)` و`INDEX(user_id, expires_at)` موجودة ومتوافقة، لذلك لا Migration أو Index جديد. التنفيذ يبني backend-owned Auth Core داخل Central Backend فقط: Scrypt password hashes، random refresh tokens لا يخزن منها إلا SHA-256، revocable/expiring sessions، short-lived signed access tokens مربوطة بالجلسة وموقعة بـserver-only secret + current refresh hash، Refresh rotation، disabled-account enforcement، HttpOnly/SameSite=Strict refresh cookie مع Secure في وضع HTTPS، وlogin rate limiting. لا Frontend cutover في هذه المرحلة.

**Plan update — 2026-09-19 / 04.06 ERROR MAPPING CLOSED:** تم إغلاق التنفيذ الوظيفي على SHA `40e86d4e2937c9d9f2db3b3ebdcec50b8da9a048` بعد Full CI Run `#957` / `35395761123` SUCCESS. تم إنشاء Mapper مركزي بعقد public ثابت `errorCode + safe params`، وربط أخطاء Business الحالية وPostgreSQL SQLSTATE الشائعة بأكواد مستقرة، مع منع تسريب raw message/detail/hint/query/table/column/constraint/stack أو idempotency keys/reference IDs. PostgreSQL 17 integration اختبر أخطاء UNIQUE/FK/CHECK/NOT NULL/invalid UUID فعلية. لا Migration ولا Index جديد. Phase 04 أصبحت CLOSED وظيفيًا، وPR `#218` validation-only يخضع الآن لـFull CI نهائي على documentation closure SHA قبل إغلاقه بدون Merge. Next Action بعد نجاحه: Phase 05 / 05.01 Authentication فقط.

**Plan update — 2026-09-19 / 04.06 ERROR MAPPING STARTED:** تم عمل Gap Analysis مقابل Architecture Baseline v1.7. الـBaseline يفرض public contract = stable `errorCode` + safe params مع ترجمة UI وعدم عرض Stack Trace. لا يوجد Mapper مركزي حاليًا. التنفيذ يضيف application-layer mapper لأخطاء Business المعروفة وPostgreSQL SQLSTATE الشائعة، ويمنع نقل `message/detail/hint/query/table/column/constraint/stack` أو keys/references الحساسة إلى public output. لا Migration ولا Index جديد. Phase 05 ممنوعة قبل إغلاق 04.06 وPhase 04.

**Plan update — 2026-09-18 / 04.05 TRANSACTIONAL OUTBOX CLOSED:** تم إغلاق التنفيذ الوظيفي على SHA `b476939de62c00b9ebdad942c985513a76e2fb79` بعد Full CI Run `#955` / `35391957524` SUCCESS. الـDomain Event يُنشأ داخل source transaction، والWorker يستخدم `FOR UPDATE SKIP LOCKED` على الـunprocessed partial index. non-retryable consumer failure يُعزل بـSAVEPOINT ثم يزيد `retry_count` ويظل `processed_at = NULL`؛ أما deadlock/serialization فيُعاد عبر transaction helper المحدود. PostgreSQL 17 restart proof أثبت بقاء event committed بعد إعادة إنشاء الـprocess/pool، وtwo-worker test على 40 events أثبت disjoint claims وlogical result واحد لكل event باستخدام stable `event.id`. لا Migration `0023` ولا Index جديد. PR `#217` validation-only ويخضع الآن لـFull CI نهائي على documentation closure SHA قبل إغلاقه بدون Merge. Next Action بعد نجاحه: 04.06 Error Mapping فقط.

**Plan update — 2026-09-18 / 04.05 TRANSACTIONAL OUTBOX STARTED:** تم عمل Gap Analysis مقابل Architecture Baseline v1.7. جدول `outbox_events` وretry CHECK والـfrozen partial index على unprocessed rows موجودون ومتوافقون، لذلك لا Migration أو Index جديد. التنفيذ يضيف source-transaction enqueue + worker بـ`FOR UPDATE SKIP LOCKED` + SAVEPOINT-based failure isolation + `retry_count` management + server `processed_at` بعد نجاح consumer فقط، مع PostgreSQL 17 restart survival وtwo-worker concurrency proof. الـconsumer يستلم stable `event.id` كـidempotency identity بدون إضافة generic dedupe schema خارج الـBaseline. 04.06 ممنوع قبل إغلاق 04.05.

**Plan update — 2026-09-18 / 04.04 AUDIT SERVICE CLOSED:** تم إغلاق التنفيذ الوظيفي على SHA `106770cd0a699edc9f3f68bf5a6386ac1ced1281` بعد Full CI Run `#953` / `35389984264` SUCCESS. الخدمة Append-only داخل Business Transaction قائمة، تسجل Who/What/When/Branch/Entity/Reason/Before/After حيث ينطبق، تولد `created_at` من PostgreSQL، وتتحقق من JSON-compatible Before/After snapshots قبل SQL. PostgreSQL 17 rollback proof أثبت أن الـAudit والـlinked business effect لا يتسربان عند فشل الـTransaction. لا Migration `0023` ولا Index جديد. PR `#216` validation-only ويخضع الآن لـFull CI نهائي على documentation closure SHA قبل إغلاقه بدون Merge. Next Action بعد نجاحه: 04.05 Transactional Outbox فقط.

**Plan update — 2026-09-18 / 04.04 AUDIT SERVICE STARTED:** تم عمل Gap Analysis مقابل Architecture Baseline v1.7. جدول `audit_logs` والـFKs والـ3 frozen Audit indexes موجودون ومتوافقون، لذلك لا Migration أو Index جديد. التنفيذ يضيف append-only transaction-bound Audit Service يسجل Who/What/When/Branch/Entity/Reason/Before/After حيث ينطبق، مع PostgreSQL-generated `created_at` وJSONB snapshot validation وPostgreSQL 17 rollback proof يثبت أن الـAudit والـbusiness effect ينجحان أو يفشلان معًا. 04.05 ممنوع قبل إغلاق 04.04.

**Plan update — 2026-09-18 / 04.03 POSTING BATCH SERVICE CLOSED:** تم إغلاق التنفيذ الوظيفي على SHA `60d25e108a37bdfb6adbfad261c87f674fbf62d0` بعد Full CI Run `#951` / `35389332195` SUCCESS. الخدمة Insert-only داخل Business Transaction قائمة، تدعم `POST/CORRECTION/REVERSAL/DELETE_REVERSAL`، تولد `posted_at` من PostgreSQL، وتحافظ على source traceability. أي reversal reference يُقفل `FOR UPDATE` ويُرفض إذا خرج عن نفس الفرع/المصدر. PostgreSQL 17 rollback proof أثبت أن Posting Batch والـlinked posting effect لا يتسربان عند فشل الـTransaction. لا Migration `0023` ولا Index جديد. PR `#215` validation-only ويخضع الآن لـFull CI نهائي على documentation closure SHA قبل إغلاقه بدون Merge. Next Action بعد نجاحه: 04.04 Audit Service فقط.

**Plan update — 2026-09-18 / 04.03 POSTING BATCH SERVICE STARTED:** تم عمل Gap Analysis مقابل Architecture Baseline v1.7. جدول `posting_batches` والـoperation CHECK والـSelf-FK والـsource trace index موجودون ومتوافقون، لذلك لا Migration أو Index جديد. التنفيذ يضيف insert-only transaction-bound service مع server-generated `posted_at`، source traceability، lock/validation للـreversal reference، وPostgreSQL 17 rollback proof يثبت أن Posting Batch وآثاره لا يتسربون عند فشل الـTransaction. 04.04 ممنوع قبل إغلاق 04.03.

**Plan update — 2026-09-18 / 04.02 DOCUMENT SEQUENCE SERVICE CLOSED:** تم إغلاق التنفيذ الوظيفي على SHA `eb1c02035bd1dc91e7045e3d6ed08e23b9342acd` بعد Full CI Run `#949` / `35380340039` SUCCESS. الخدمة لا تبدأ Transaction مستقلة؛ تستقبل `PoolClient` من الـBusiness Transaction وتُستدعى late بعد validation/locks، وتستخدم atomic UPSERT/RETURNING على `document_sequences`. اختبار PostgreSQL 17 بـ32 workers أثبت أرقام `1..32` بدون duplicates، rollback لا يترك sequence/business effect، والرقم committed لا يعاد استخدامه بعد tombstone. Run `#948` كان Diagnostic failure في test-only lexicographic ORDER BY بعد cast إلى text؛ الأرقام المولدة كانت صحيحة وفريدة، وتم إصلاح assertion فقط. لا Migration `0023` ولا Index جديد. PR `#214` validation-only ويخضع الآن لـFull CI نهائي على documentation closure SHA قبل إغلاقه بدون Merge. Next Action بعد نجاحه: 04.03 Posting Batch Service فقط.

**Plan update — 2026-09-18 / 04.02 DOCUMENT SEQUENCE SERVICE STARTED:** تم عمل Gap Analysis مقابل Architecture Baseline v1.7. جدول `document_sequences` و`UNIQUE(branch_id, document_type)` موجودان ومتوافقان، لذلك لا Migration أو Index جديد. التنفيذ يضيف transaction-bound late allocation باستخدام atomic UPSERT/RETURNING، مع PostgreSQL 17 32-worker concurrency gate وrollback/no-reuse-after-deletion proofs. 04.03 ممنوع قبل إغلاق 04.02.

**Plan update — 2026-09-18 / 04.01 IDEMPOTENCY SERVICE CLOSED:** تم إغلاق التنفيذ الوظيفي على SHA `c39f99f7f16c95b099d157e3c784c6b5453c5eb1` بعد Full CI Run `#946` / `35377090817` SUCCESS. الخدمة تعمل داخل نفس Business Transaction، تستخدم canonical SHA-256 request hash، تمنع payload mismatch، تعيد replay/incomplete state بدون duplicate business execution، rollback لا يترك phantom claim/effect، وexpiry cleanup bounded بـ`FOR UPDATE SKIP LOCKED`. اختبار PostgreSQL 17 المتوازي بثمانية callers أثبت تنفيذ work مرة واحدة فقط. لا Migration `0023` ولا Index جديد. PR `#213` validation-only ويخضع الآن لـFull CI نهائي على documentation closure SHA قبل إغلاقه بدون Merge. Next Action بعد نجاحه: 04.02 Document Sequence Service فقط.

**Plan update — 2026-09-18 / 04.01 IDEMPOTENCY SERVICE STARTED:** تم عمل Gap Analysis مقابل Architecture Baseline v1.7. جدول `idempotency_keys` و`UNIQUE(key)` وIndex `expires_at` موجودون ومتوافقون، لذلك لا Migration أو Index جديد. التنفيذ يضيف canonical request hashing + transaction-bound claim/replay + mismatch rejection + rollback safety + bounded expiry cleanup، مع PostgreSQL 17 parallel integration gate. 04.02 ممنوع قبل إغلاق 04.01.

**Plan update — 2026-09-18 / 03.08 DDL VERIFICATION CLOSED:** تم تنفيذ 03.08 كـverification-only phase بدون تكرار DDL المقفول. تم إعادة استخدام اختبارات 03.06/03.07 القائمة وإضافة الفجوتين فقط: case-insensitive username/email behavioral proof وno direct PostgreSQL client exposure. Implementation CI Run `#944` / `35372123130` نجح بالكامل على SHA `18f9b39a7a113a72dc71bb3f5092027506a6ec28`. Validation PR `#212` يبقى بدون Merge ويخضع الآن لـFull CI نهائي على documentation closure SHA. Next Action بعد نجاحه: 04.01 Idempotency Service فقط.

**Plan update — 2026-09-18 / 03.07 INDEX CATALOG CLOSED:** تم تنفيذ `0022_index_catalog` من الـ155 entry المجمدة بالضبط، وإضافة executable manifest وPostgreSQL 17 exact catalog gate. Run `#941` / `35303952439` نجح بالكامل على code SHA `ba7eda5ee52f4b021d0afa36b7ab71653d0adb69`. تم نقل Next Action إلى `03.08 DDL Verification` فقط. Final documentation SHA يخضع لـFull CI مستقل قبل إغلاق PR #211 بدون Merge.

**Plan update — 2026-09-18 / 03.07 EXACT INDEX INVENTORY FROZEN:** تم تجميد `docs/gap-analysis/phase-03-07-index-inventory.md` بعد مراجعة §28 كاملة مقابل الـschema/migrations الحالية. التصنيف النهائي = 74 already satisfied + 155 create in 03.07 + 2 omitted by ADR-0024 + 0 blocked. لم يتم إنشاء أي Index Migration. Next Action الوحيدة: Forward Index Migration من القائمة المجمدة + PostgreSQL 17 exact catalog tests + Full CI على نفس SHA.

**Plan update — 2026-09-18 / 03.07 PRE-DDL BLOCKERS RESOLVED:** تم اعتماد ADR-0024 وحسم تعارضي §28.6 بدون تعديل الـPhysical Schema: `receipts.sales_order_id` و`advance_applications.posting_batch_id` مصنفان Catalog Defects ولا يتم إنشاء العمودين أو الفهرسين في V1. لم يتم إنشاء أي Index Migration. الـNext Action الوحيدة هي تجميد Exact 03.07 Index Inventory كاملًا قبل أي DDL.

**Plan update — 2026-09-18 / 03.06 CONSTRAINTS CLOSED & 03.07 STARTED:** تم إغلاق Phase 03.06 بالكامل على verified code SHA `abe8587ef7a08cdb607e283ad01937bc9332247c` بعد Full CI run `35251535466` / Run `#935` وValidation PR `#208` المغلق بدون Merge. تم نقل Current Execution Pointer إلى 03.07 Index Catalog بحالة `IN_PROGRESS`، على أن تكون أول خطوة فقط هي حسم تعارضي §28.6 المتعلقين بـ`receipts.sales_order_id` و`advance_applications.posting_batch_id` قبل أي Index DDL. من الآن فصاعدًا هذا الملف هو النسخة الوحيدة داخل السورس ويتم تحديثه in-place؛ لا تُنشأ نسخ مرحلة جديدة داخل المستودع.

# 33. Final Success Definition

يعتبر **Business Tech ERP V1 Ready for Production/Pilot Release** عندما يحقق النظام معًا:

- نفس الـERP الحالي من منظور المنتج والـUX الأساسي، مع Backend جديد غير معتمد على Convex runtime.
- Central Backend + Central PostgreSQL مطابقين لـv1.7.
- Immutable historical ledgers.
- Correct synchronous operational projections.
- Atomic financial/inventory/accounting posting.
- Correct reversal/correction/versioning/tombstone behavior.
- Safe concurrency under parallel users/devices.
- Strict permission and branch enforcement.
- Accurate Weighted Average / COGS / VAT / customer-supplier balances / treasury / journals.
- Reports reconcile to Sources of Truth.
- Printing/export/workspace/i18n operational.
- LAN and configured remote access operational.
- no direct PostgreSQL client exposure.
- backup/restore/restart/autostart validated.
- migration/cutover validated where data migration is required.
- full tests pass on the final release SHA.
- pilot accepted.
- installer/bootstrap and operations documentation delivered.
- main merge/release performed only with explicit user approval.

---

## End of Master Implementation Plan v1.0