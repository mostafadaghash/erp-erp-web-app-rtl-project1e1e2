# ADR-0030 — PostgreSQL Runtime Principal and GL Account Lifecycle Integrity Boundary

**Status:** ACCEPTED — ARCHITECTURE CONTRACT ONLY; IMPLEMENTATION NOT STARTED; MIGRATION/ROLE/GRANT CHANGES REQUIRE SEPARATE APPROVAL  
**Date:** 2026-11-03 (proposal); **Owner acceptance:** 2026-11-06  
**Approval evidence:** The owner explicitly replied «اعتمد» to the immediately preceding, specifically named request «اعتمد ADR-0030». This accepts the bounded architecture contract in this ADR only; it is **not** approval of a specific migration, database role/GRANT change, live deployment, service mutation, or merge to `main`.  
**Path note:** The historical `-proposed-` filename is retained for stable references; the document status now governs.  
**Reviewed baseline:** `agent/postgres-v1.7-core` @ `72680b22633b2b619262fb6f4ae6efbdf952ac06`  
**Phase:** 09.08-C — GL Account Mutation/Lifecycle, **BLOCKED / NOT IMPLEMENTED**  
**Authority:** `Business-Tech-ERP-Architecture-Baseline-v1.7-Final.docx` §§8, 24.16, 25.14, 27, 28.6; accepted ADR-0027/0028/0029; Master Implementation Plan 09.08.  
**Empirical evidence:** `docs/implementation/phase-09-08-c-gl-lifecycle-runtime-role-integrity-preflight.md` and PostgreSQL 17 CI #1332 / #1334, on an isolated test database.  
**Decision boundary:** The project owner accepted the architectural requirements and testing gates for separating runtime/migration principals and enforcing GL history, active Finance Category and parent/child integrity. Acceptance does **not** approve or implement any specific SQL migration, new DB principal, DDL, role/grant change, Backend lifecycle command, Production operation, Convex cutover or `main` merge.

## 1. Answer / recommendation

**Recommend a new, separately approved, forward-only PostgreSQL migration (or a bounded sequence of forward-only migrations) before enabling any GL account update/deactivation feature.** The need is **architectural**: confirmed PostgreSQL SQL-level paths permit violations of accepted ADR-0029 invariants for a modeled non-owner role granted account DML. The precise production role grants are still unknown, so a production exploitation claim is not supported.

Adopt **two complementary safety boundaries**, not just a software-level check:

1. A deliberately **unprivileged, non-owner Backend runtime login** distinct from the migration/schema principal; database rights limited to necessary operations and audited access paths; no blanket GL UPDATE/DELETE/TRUNCATE, table ownership or DDL/trigger-disabling capability.
2. **Database-level GL lifecycle invariants**, backed by trigger and/or narrowly privileged mutation entrypoint, enforced in the same transaction as the service; history, active Finance Category, inactive-parent, mapped account, immutable system/account identity and no-delete rules cannot be bypassed by an ordinary runtime DML path.

Do not conflate application SYSTEM_ADMIN / `accounting.chart.manage` with PostgreSQL SUPERUSER, schema ownership or `GRANT`. ERP effective permissions remain authenticated and enforced inside the Backend transaction.

**Approval status: ACCEPTED AS ARCHITECTURE ONLY.** A future forward-only hardening migration is the accepted architectural direction before enabling GL lifecycle mutations, but **no migration number, owner role name, runtime username, security function signature, deployment role/grant, SQL file or code change is authorized by this acceptance**. Numbering and concrete design remain independently gated until migration catalog, effective privileges, data state and concurrency are verified.

## 2. What the reviewed sources prove, and what they do not

| Source | Proven fact | Not proven |
| --- | --- | --- |
| `server/infrastructure/config/config.ts`; `server/infrastructure/database/database.ts` | New Fastify/pg Backend takes one `ERP_DATABASE_URL` and creates a `pg.Pool`; transactions use `READ COMMITTED` | No approved production runtime role identity, schema owner, grants or login separation |
| `server/infrastructure/database/transaction.ts` | Uses optional `app.user_id` / `app.request_id` transaction-local settings, bounded retry for deadlock/serialization | A transaction-local custom setting is **not** an unforgeable database authentication credential; do not use it alone as an authorization bypass token in a privileged SQL function |
| `.github/workflows/ci.yml` | PostgreSQL 17 service uses `POSTGRES_USER=postgres`; integration tests connect as `postgres` | Not proof of least-privilege deployed Backend |
| `infra/local/docker-compose.yml`, `infra/local/runtime.env.example` | Historical local stack runs Convex Backend against a local PostgreSQL user `convex` | This is **not** the v1.7 Fastify Backend's future runtime role policy, and the two stores are not interchangeable |
| `0034_gl_system_account_mapping_integrity.sql` | Same-Company hierarchy/cycle checks; prevent mapped GL account deactivation; mapping context and distinct Treasury targets | Does **not** prevent posted-but-unmapped account deactivation, active Finance Category GL deactivation, or active child under inactive parent |
| `0035_journal_context_immutability_reversal_integrity.sql`, `JournalWriterService` | JournalLine creation locks GL `FOR SHARE`, requires active Company-matching leaf, sealed history immutable; reversal uses active GL | Does not make future GL master-data update safe on its own |
| `09.08-C` PG17 diagnostic CI #1332/#1334 | Modeled non-superuser given GL DML can execute the three forbidden transitions; `FOR SHARE` holds a conflicting GL UPDATE until lock release | Real local/staging/production Fastify `ERP_DATABASE_URL` credentials/grants, application privilege attack surface or populated DB preconditions |

There is **no evidence here of a deployed Backend DB role with current dangerous grants**, and no migration has been executed on a populated customer database.

## 3. Accepted runtime-role / ownership principles (implementation and exact grants pending)

### 3.1 Principal separation

- **Schema/migration owner:** privileged principal managed at install/upgrade time only, independent from Fastify runtime; ideally a `NOLOGIN` owner role plus a separate tightly controlled migration executor. No migration secret ever reused as `ERP_DATABASE_URL`.
- **ERP Backend runtime principal:** dedicated `LOGIN` with `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, no owner membership/ability to `SET ROLE` to schema owner, no DDL or `CREATE` on trusted schemas, no `BYPASSRLS`, and no `TRIGGER`/table owner capability to disable guards. Exactly one centralized backend is the business writer, as required by V1.
- **Backend permissions:** grant only proven necessary SELECT/INSERT/UPDATE on specific tables and columns; preserve operations already using canonical append-only Ledgers, projections and transactional audit. On `gl_accounts`, retain read and the current 09.08-A creation path as needed, but **do not grant unrestricted UPDATE, DELETE or TRUNCATE** to the runtime login. No blanket `ALL PRIVILEGES ON ALL TABLES`. The existing 09.08-A authorized create must continue to work, or its future restricted insertion path needs a separate explicit decision and regression gate.
- **Future account mutation path:** only through an explicitly authorized Backend command and a narrowly scoped PostgreSQL integrity-enforced operation that cannot be used for generic arbitrary GL UPDATE. Whether to implement this as constrained DML plus DB triggers, or as a carefully reviewed privileged function with restricted EXECUTE, is a **future implementation detail to resolve with evidence**, not an acceptance here.
- **Protected functions:** if `SECURITY DEFINER` is necessary, its owner must be trustworthy and non-login, use fixed trusted `search_path` with `pg_temp` last, schema-qualify names, revoke default function EXECUTE from `PUBLIC`, grant to only the required principal and prevent arbitrary SQL injection or caller-supplied `companyId` / `app.user_id` from substituting for app authorization. PostgreSQL 17 documents that function EXECUTE privileges must be explicitly controlled.
- **Secrets:** no password, connection URI, deployment username or real grants committed to docs/CI. Provision via separately gated deployment configuration with secret isolation, backup and rollback.

This is an **accepted architectural role-separation requirement**, not a claim that those PostgreSQL roles currently exist. The exact provisioned identities, grants, mutation function architecture and migration sequence are **not accepted implementation details**; the restricted-privileged-function path in §6 remains a preferred candidate requiring verification.

### 3.2 Measurable read-only evidence to collect before final SQL design

On a **nonproduction or cloned/ephemeral, production-equivalent** PostgreSQL 17 environment (and later real deployment only with separate authorization), inspect without exposing credentials: `current_user`, `session_user`, `rolsuper`, `rolcreaterole`, `rolcreatedb`, `rolbypassrls`, `pg_has_role` / owner membership, table owners, schema privileges, effective `has_table_privilege` / `has_column_privilege`, function EXECUTE rights, table and trigger ownership, `PUBLIC`/membership-derived permissions, migration account and app pool configuration. A privileged test role created only inside CI is a **simulation**, not the actual result.

Reject any proposed cutover where Fastify shares a superuser or schema-owner login with DDL/migrations. Define install/upgrade/bootstrap contract without touching local Convex secrets.

## 4. Mandatory GL integrity contract (ADR-0029 plus accepted ADR-0030 database-enforcement boundary)

| Write class | Database-level invariant to prove |
| --- | --- |
| Delete / TRUNCATE | Never permit ordinary runtime physical DELETE or TRUNCATE of `gl_accounts`, even unused; no mutation of posted JournalLines |
| Account identity | `id`, `company_id`, `is_system` immutable; Company-scoped code UNIQUE remains canonical |
| Name correction | Posted/mapped/category-used account may change display **name only** with valid reason and complete same-transaction Who/Before/After Audit; no Journal/GL ID/code rewrite |
| Code/type/reparent | Only allowed for genuinely unused, unmapped, category-unreferenced eligible leaf; existing code uniqueness/cycle/Company guard preserved; no new `version` column |
| Deactivation | Reject if any `journal_lines` reference exists, including reversed or zero-value lines; any `system_account_mappings` reference; any active `finance_categories` reference; any active child; any required posting dependency. No historical reversal may become impossible because of lifecycle administration |
| Reactivation / parent | Verify active same-Company parent and valid hierarchy. Prohibit active child INSERT/reparent under inactive parent and parent deactivation that strands active children |
| Finance Category | `finance_categories.gl_account_id` remains direct FK, not replicated into System Mappings; source Branch/Company must be revalidated at actual financial posting; no invented `company_id` on the Category |
| Future mapping admin | Out of 09.08-C: six ADR-0027 roles only, version-aware expected state, idempotency/Audit, history-locked rotation; no mapping administration now |

**Bidirectional race closure is mandatory:** GL deactivation must lock and check Journal/Category/Child/Mapping dependencies; concurrently inserting a JournalLine, linking an active Finance Category or attaching an active child must lock the referenced GL in a conflicting/compatible fixed order and revalidate active status. Simply querying `EXISTS(...)` without a compatible locking protocol in both directions is insufficient at `READ COMMITTED`.

The existing `0035` JournalLine insert guard locks the GL `FOR SHARE`. A future forward-only integrity correction should preserve this lock and ensure lifecycle UPDATE rechecks after waiting. For active Finance Category and GL-child path, design symmetric row locks to prevent phantom dependent inserts and avoid deadlocks with the 0034 hierarchy, finance and Journal paths. The actual lock matrix must be proven by PostgreSQL 17 concurrency tests rather than assumed.

## 5. Accepted forward-only remediation requirement / separately gated migration design

**Recommended answer: YES, at least one new forward-only, separately approved integrity/privilege migration is indicated before enabling GL Mutation/Lifecycle.** Exact migration count/order and whether install-time role provisioning is migration SQL or operations bootstrap remain unresolved. It must not modify old `0009` / `0019` / `0034` / `0035` / `0036` files or their checksums. A new versioned migration may add complementary triggers or forward-only replace existing function definitions only with compatibility evidence, protect historical identity/dependencies and implement required privilege changes. **No new discretionary index**, storage partition, global SERIALIZABLE mode or non-ADR account type enumeration.

**Preflight gate before approval to implement migration:** establish actual runtime-role grant model; verify existing data against the proposed invariants (historical GL active, active Category targets, inactive parents with active children, mapping integrity, schema ownership); record tests on clean PostgreSQL 17 and upgrade state, transaction/lock interactions and a validated backup/recovery point. If historical data violates a new constraint, **stop with a read-only report** and separately approve safe correction, never silently rewrite ledger history or enable destructive migrations.

**Migration gate when separately approved:** transactional forward-only DDL and guarded metadata/preconditions; tests that new guards reject previously observed unsafe operations, preserve allowed unused account change and valid historical name correction, prevent direct DELETE/TRUNCATE, and verify no role can bypass via membership/default permissions. Verify-only and regression checks, two-session race tests, least-privilege login and fail-closed denial, idempotent service/Audit integration when service is authorized later. All four CI jobs must pass on exact final SHA. No Production action or `main` merge without explicit approval.

**Recovery:** rollback an uncommitted transaction on migration failure; after committed release, correct via a new forward migration, not destructive rollback. A tested backup/restore and cutover plan is a separate prerequisite for populated target databases.

## 6. Alternatives and recommendation

- **Backend validation alone:** **REJECTED**. The observed ordinary DML path can bypass the service and strand historical reversals.
- **Revoke all GL UPDATE permanently without admin path:** temporarily safe for mutation prevention, but **insufficient as complete feature design**; later permitted name corrections and lifecycle changes require an audited controlled path and physical invariants.
- **Only trigger checks with a superuser/owner runtime:** **REJECTED**. A powerful runtime principal may alter schema/disable triggers; never use the migration owner for routine requests.
- **Constrained DML + integrity triggers under limited runtime role:** possible option; requires exact column-level grants and strong backend authorization/atomic Audit evidence.
- **Restricted privileged function(s) + deny direct GL UPDATE, backed by DB integrity guards:** **preferred candidate** for narrow write boundary, contingent on verifying cross-service transactions, function privileges/search_path, race safety and full ADR-0029 authorization. An app-provided actor ID or mutable `app.user_id` alone is not a cryptographically trustworthy PG principal.
- **Manually changing 0034/0035, adding index/column, SERIALIZABLE everywhere:** **REJECTED** absent a separately accepted architecture change and measurement.

## 7. Acceptance and exit checklist

- [x] Source-grounded role vs application permission distinction; Fastify/CI/legacy Convex environments separated.
- [x] 09.08-C PG17 evidence classified as exposure discovery, not production-role/production-integrity proof.
- [x] Recommend forward-only, DB-level lifecycle and least-privilege remediation, explicitly excluding actual SQL/DDL/role mutation.
- [x] Specify mandatory historical, category, parent/child, mapping and reverse-posting integrity tests and lock order.
- [x] Owner explicitly accepted the architecture and role-separation / DB-integrity contract on **2026-11-06**; concrete deployed runtime credentials, SQL privileges and migrations remain separately gated.
- [ ] Exact deployed-equivalent runtime principal and grants confirmed in independently authorized safe environment.
- [ ] Separate approval for any implementation migration, service code or populated database upgrade.
- [ ] Full CI on this review's final documentation SHA and validation-only PR closure WITHOUT MERGE.

**Current status:** ADR-0030 **ACCEPTED (ARCHITECTURE ONLY)** on 2026-11-06. 09.08-C GL Account Mutation/Lifecycle implementation **BLOCKED / NOT STARTED** pending safe runtime principal evidence and separately approved integrity/privilege migration. Parent 09.08 `IN_PROGRESS`; mapping administration 09.08-D and 09.09 Posting Rules `NOT_STARTED`.

**One next action after the acceptance documentation CI/PR gate:** perform a **read-only / non-destructive PG17 runtime-principal, effective-GRANT and GL-integrity migration readiness assessment** on isolated or production-equivalent test infrastructure. Capture the exact proposed DDL/role provisioning, reversible deployment safeguards and PostgreSQL concurrency/negative-test plan for separate owner approval **before** executing any sensitive migration or role/grant operation. Do not start GL lifecycle mutations, mapping administration or 09.09 as a side effect of recording acceptance.

### PostgreSQL 17 technical references

- GRANT and column privileges: https://www.postgresql.org/docs/17/sql-grant.html
- Explicit row/table locking and deadlock avoidance: https://www.postgresql.org/docs/17/explicit-locking.html
- CREATE FUNCTION; secure SECURITY DEFINER and function privileges: https://www.postgresql.org/docs/17/sql-createfunction.html
