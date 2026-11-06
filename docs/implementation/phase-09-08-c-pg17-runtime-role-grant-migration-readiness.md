# Phase 09.08-C — PostgreSQL 17 Runtime Role / Effective GRANT / Historical GL Migration Readiness

**Status:** SOURCE-GROUNDED READINESS COMPLETED; READ-ONLY SESSION/CURRENT USER AND ROLE-MEMBERSHIP AUDIT ADDED; **ACTUAL FASTIFY RUNTIME PRINCIPAL/GRANTS STILL UNVERIFIED**; ROLE/MIGRATION IMPLEMENTATION **NOT AUTHORIZED**.  
**Date:** 2026-11-06  
**Authority:** Architecture Baseline v1.7 §§8, 24.16, 25.14, 27; Master Implementation Plan Phase 09.08; accepted ADR-0027/0028/0029/**0030**.  
**Reviewed branch:** `agent/postgres-v1.7-core`.  
**Scope:** inspect repository and approved architecture; provide a safe metadata-only PG17 runtime principal audit tool, CI diagnostic, proposed rights/guards/locking matrix, migration deployment plan and explicit no-go gates. No live connection or customer-data access.

## 1. Decision summary and hard truth about the “actual” role

**READINESS: NOT READY FOR MIGRATION.** The earlier 09.08-C PostgreSQL 17 tests confirmed three SQL-level lifecycle exposures for a **simulated** non-owner account with `gl_accounts` DML; the Journal sealing/Mapping constraints do **not** make GL account mutation safe by themselves.

The new Fastify Backend's `server/infrastructure/database/database.ts` connects via `AppConfig.ERP_DATABASE_URL`; `server/main.ts` and `server/app.ts` do not pin or attest a runtime database role. The migration runner `scripts/database/migrations.mjs` defaults to **the same environment variable** and uses `CREATE TABLE`/DDL and `schema_migrations` writes when in apply mode. This is an **actual configuration gap** for separation of privileges, not proof that a deployed instance is insecure. No approved new Backend deployment login or grants can be verified from the repository.

`.github/workflows/ci.yml` connects as `postgres` on ephemeral PG17 and must **never** be labeled a least-privilege-runtime gate. `infra/local/docker-compose.yml` and `infra/local/runtime.env.example` still describe the **legacy Convex** backend and are **not** the Fastify runtime. The DB user, role memberships, grant options, effective grants, schema/function owner and deployment credential are **UNKNOWN until an approved nonproduction-equivalent Fastify connection is inspected**.

### Prepared read-only evidence probe

`scripts/database/phase-09-08-c-runtime-role-readonly-audit.mjs` is a **SELECT/catalog-only** auditor. It explicitly opens a `BEGIN TRANSACTION READ ONLY` and returns structured JSON for:

- `current_user`, `session_user`, DB, PostgreSQL version and read-only flag; `pg_roles` flags (`rolsuper`, `rolcreaterole`, `rolcreatedb`, `rolbypassrls`, etc.).
- `public` schema ownership and effective USAGE/CREATE, database CREATE/TEMP, and ability to `SET ROLE` to the schema owner.
- Effective table SELECT/INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/MAINTAIN and ownership; sensitive GL column-level INSERT/UPDATE.
- Sensitive `pg_proc` ownership, `SECURITY DEFINER`, function-local settings, effective EXECUTE, default/PUBLIC EXECUTE and trigger enabled states; inherited/default ACLs.

It examines **zero business rows**, does not print a connection string/password, performs no GRANT/REVOKE/role change, DDL, DML, migration or advisory lock. Running it against CI superuser demonstrates **CI**, not actual Fastify runtime. The only valid role attestation is to run it with the trusted **same role configured for the real Fastify process** in a separately authorized PostgreSQL 17 test environment and compare current/session user to the deployment's secret-inventory metadata **without printing the secret**.

The CI integration test verifies that the tool runs with a genuinely read-only transaction and rolls back a failed inspection. Its expected `postgres` SUPERUSER result is deliberately evidence of the **wrong principal for production-equivalent runtime**.

## 2. Privilege baseline and target decision matrix (proposed implementation details, not GRANT approval)

| Principal/object | Existing source evidence | Target for independently approved implementation |
| --- | --- | --- |
| Migration/schema owner | `migrations.mjs` performs DDL and writes `schema_migrations` using default `ERP_DATABASE_URL`; no separate role config proven | Dedicated restricted install/upgrade executor; preferably non-login object owner + controlled migration executor, NEVER Fastify's pool login |
| Fastify runtime `LOGIN` | Unknown, chosen by `ERP_DATABASE_URL` | `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`, not an object owner or able to assume schema/migration owner; no schema CREATE, no trigger-disabling/DDL, no privileged credentials in app pool |
| `public.gl_accounts` | 09.08-A service currently needs SELECT and direct INSERT; 0034 only blocks mapped-account deactivation | SELECT; **no unrestricted UPDATE/DELETE/TRUNCATE**. Transition existing INSERT/Create service without regression; untrusted direct INSERT also risks bypassing system-account/parent/Audit creation policy, so decide a restricted create path or strong SQL INSERT guards before cutover |
| `public.system_account_mappings` | Existing Writer/Resolver SELECT; 0034 mapping trigger | SELECT for resolver; no unrestricted UPDATE/DELETE/INSERT for ordinary runtime; 09.08-D future admin privileges and controlled path separately gated |
| `public.journal_entries`, `journal_lines`, `posting_batches` | Writer appends Journal; 0035 locks/immutability/seals | Preserve necessary INSERT and SELECT under invariant guards; never grant ordinary UPDATE/DELETE/TRUNCATE of historical Journal rows; no ability to defeat seals |
| `public.journal_entry_seals` | 0035 revokes PUBLIC and uses hardened trigger-based seals | No ordinary direct INSERT/UPDATE/DELETE/TRUNCATE; verify real login, table owner/member privileges, function EXECUTE/default grants |
| `public.finance_categories` | Direct `gl_account_id` FK (0008 + 0019); no active-account lifecycle guard proven | Owned by Finance Category service; future active INSERT/UPDATE must lock/check referenced GL; preserve no invented Company FK or system mapping |
| DB trigger/functions/default privileges | 0034+0035 definitions available; actual effective runtime privileges unknown | Schema-qualified functions, restrictive `SECURITY DEFINER` where justified, protected owner, `search_path` fixed, `PUBLIC EXECUTE` revoked at create time, no session GUC/claimed `app.user_id` alone as trust proof |
| Other Finance/Inventory/ERP tables | Numerous existing service INSERT/UPDATE paths; exact required grants not completely enumerated here | Build per-table/column least-privilege matrix from *all* actual services before role cutover; no global REVOKE that silently breaks posting, audit, projection maintenance or permissions |

**Non-negotiable:** `accounting.chart.manage` and effective user DENY/Company ALL scope are authenticated **ERP** permissions checked on one transaction. They are not DB login grants. `SECURITY DEFINER` is no substitute for application authorization.

### Privilege-model decision requiring explicit migration approval

Preferred candidate: runtime role cannot perform arbitrary GL mutation; a **narrowly typed privileged entrypoint** (or constrained table DML with independently fail-closed physical guards) enforces the accepted ADR-0029 field/mutation matrix. The exact function signature, migration owner, create-path cutover, EXECUTE grants and DB-level auditing model are **not fixed yet**. Avoid a pseudo-secure function that trusts user-controlled `app.user_id` or a caller-provided company ID as authentication.

## 3. Physical GL protection: current versus required

| Invariant | Current PG17 / source | New forward-only protection needed |
| --- | --- | --- |
| Mapped account | 0034 `ct_gl_accounts__mapped_active` rejects deactivate | Preserve existing guard and mapping lock order |
| Historical JournalLine anywhere, including reversed/zero amount | Direct UPDATE of posted/unmapped account succeeds in previous 09.08-C test | Fail-close active→inactive; freeze used code/type/parent; immutable id/company/system flag. Reversal must still append balanced opposite JournalLines against active historical GL |
| Active Finance Category GL | 0019 FK only prevents dangling FK, not inactive account; direct SQL deactivation succeeds | Block GL deactivation and invalid mutations while active category references; new/rotated/activated category must lock GL and validate account state |
| Inactive parent / active child | 0034 validates Company and cycles but allows active child under inactive parent | Fail-close child INSERT, reparent or activate unless parent active; refuse parent deactivation when active children exist |
| GL deletion / direct identity mutations | FK may protect referenced rows, not empty accounts; 0034 freezes Company only | For ordinary app role: no physical DELETE/TRUNCATE, immutable ID and system flag, code/type/parent frozen for mapped, historically used or category-used GL |
| Name correction / Audit | 09.08-A list/create only; no edit service | Allow permitted descriptive label corrections with authenticated reason, before/after Audit in same transaction. DB cannot safely infer a trusted actor from an arbitrary custom session setting |

### Bidirectional READ COMMITTED race requirements

**Journal:** Writer and 0035 JournalLine guard acquire `gl_accounts FOR SHARE`. GL lifecycle acquires affected GL row with a conflicting write lock, then evaluates `journal_lines` **after any wait**. Explicit PG17 two-session tests must prove the trigger sees a fresh committed history snapshot, or the approach must change; an `EXISTS` alone is not a race barrier.

**Mapping:** 0034 locks Treasury/Branch context, then target GL with `FOR SHARE`; new admin path must respect the accepted Company/Treasury → mapping → GL lock discipline. A concurrent target rotation/Journal posting must recheck historic in-use status after wait and fail closed.

**Finance Category:** a category INSERT/UPDATE to active must lock/check target GL with `FOR SHARE`; a GL deactivation takes conflicting GL lock and checks active categories after acquisition. Do not introduce category-row lock inversion by locking Category rows after GL. Test inactive→active, target rotation, active→inactive, and two admins.

**Parent/child:** child INSERT/reparent/reactivation locks relevant GL parents in an agreed deterministic order and tests active state; parent deactivation holds conflicting parent GL lock, checks active children after acquisition, and tests two-session races plus cycles. Reparent and hierarchy-walk order must not deadlock the existing 0034 trigger or Journal leaf checks.

No global `SERIALIZABLE`, arbitrary index, `gl_accounts.version`, account_type enum or edits to committed migrations.

## 4. Candidate future migration and strict no-go gates

**Recommendation:** forward-only hardening after separate explicit owner approval. As reviewed, 0036 is the latest schema migration; `0037` is a *candidate next version*, **not a created or approved migration**. Do not rewrite checksummed 0009, 0019, 0034, 0035 or 0036.

**Before a migration can be proposed for execution:**

1. Obtain **nonproduction, production-equivalent Fastify runtime identity and effective privilege evidence** (not just a simulated `NOLOGIN` role or CI `postgres`). Confirm migration principal separation and function ownership/default ACL.
2. Run a **read-only populated-data preflight** with approved access: inactive GL with historic JournalLines, mapped inactive accounts, active Finance Categories referencing inactive GL, active child under inactive parent, invalid Company/parent references, historic account metadata; produce **counts only**, report violations, never auto-fix. Verify schema_migrations checksums; use existing 09.08 preflight as reference, but do not claim its unrelated earlier checks cover all new invariants.
3. Finalize exact per-table/column/function GRANT **delta**, role/bootstrap sequence and rollback with minimal interruption to the 09.08-A Create and existing services; no ad hoc global REVOKE on production.
4. Finalize transactional SQL with versioned .sql/.meta.json, `preconditionSql`, `verificationSql`, `recovery`; ensure any owner/role bootstrap is provisioned separately and audited. Include a complete `SECURITY DEFINER` threat model.
5. New negative tests on ephemeral **PostgreSQL 17 under a non-owner runtime login** must prove direct UPDATE/DELETE/TRUNCATE denial, 0034 mapped guard, historical posted but now unmapped deactivation rejection, category-active invalidity, inactive parent/child rejection, immutable fields and allowed unused reactivation/rename. Execute interleaved two-session Journal vs deactivate, Category vs deactivate, child vs parent, mapping vs posting, rollback, deadlock and idempotent Audit tests.
6. Ensure backup/restore, restart persistence, upgrade rehearsal, rollback/recovery and deployment-role/secret separation independently pass for any populated target. Existing `docs/BACKUP_RESTORE.md` largely addresses legacy Convex: **do not treat that document as verified PostgreSQL v1.7 backup/restore evidence**.
7. Before closing implementation: TypeScript/Unit/PG17 Integration/Security/Accounting/Concurrency and all required four Full CI jobs on the **same final SHA**; close validation-only PR WITHOUT MERGE; obtain explicit approval for any Production change or `main` merge.

**Do not confuse successful read-only audit/green diagnostics with safe GL lifecycle authorization.** The accepted ADR-0030 is an architectural mandate, not a new migration or role/GRANT execution permit.

## 5. PostgreSQL 17 session_user / SET ROLE / inherited privilege diagnostic (2026-11-06)

**New evidence boundary:** a PostgreSQL connection can display a restricted `current_user` after `SET ROLE` even though its original `session_user` has privileges to switch back to a more privileged role. In PostgreSQL 17, the authenticated *session user*, not simply the current role, determines whether `SET ROLE` is permitted. `INHERIT`, `SET` and `ADMIN` are distinct membership properties.

The new read-only catalog audit deliberately records:

- `pg_roles` attributes for **both** original `session_user` and effective `current_user`; flags a difference and an unexpected non-login session identity.
- A reachable-role privilege matrix using `pg_has_role(session_user, oid, 'MEMBER' / 'USAGE' / 'SET' / 'MEMBER WITH ADMIN OPTION')`.
- A recursive graph of **actual** `pg_auth_members` edges from the session-user membership chain: `set_option`, `inherit_option`, `admin_option`, without creating or changing roles.
- Current/session grants on selected GL/Journal tables, sensitive columns and functions, creation in public schema/database, and whether the session can switch to schema/table owners or privileged roles.
- Conservative risk signals for a privileged session hidden by `SET ROLE`, schema/table ownership or sensitive DML, and administrative role memberships. A signal is not proof of exploitation. **A clean report is not proof of production readiness.**
- Function configuration is restricted to `search_path`; the auditor no longer dumps arbitrary `pg_proc.proconfig` settings that could accidentally carry sensitive application values.

The auditor still runs **only SELECT from PostgreSQL catalog metadata in BEGIN TRANSACTION READ ONLY**; it does not query any business rows, inspect credentials, create DB roles, execute SQL mutations, or change grants. It reports `risk.runtime_principal_attested: false` **unconditionally**. `session_user` is not infallible proof of the initial network authentication if a superuser altered session authorization; compare with trusted Fastify deployment inventory out of band.

**Ephemeral CI proof:** integration assertions validate the instrument against the isolated `postgres` superuser, plus pure tests for a switched-down yet privileged session and a no-warning yet unverified runtime. A separate PG17 test creates NOLOGIN roles and contrasting SET/INHERIT/ADMIN membership options **only inside an isolated CI rollback-only transaction** and validates the real PostgreSQL catalog functions; no changes are retained. These tests do **not** establish the role used by a real Fastify service.

**Missing actual environment evidence (hard blocker):** the repository exposes the Fastify `ERP_DATABASE_URL` consumption but provides no authorized running Fastify instance, nonproduction-equivalent database login, or trusted secure configuration inventory in this workspace. GitHub CI `postgres` is intentionally a privileged migration/test account and cannot substitute. No actual runtime role verification has been performed.

Once there is an approved **nonproduction PostgreSQL 17 deployment** with the intended Fastify pool login, execute the same read-only tool *using that deployment's role without disclosing secrets*, corroborate session identity with the trusted Fastify process configuration, and compare its effective privileges and role graph against ADR-0030. **STOP** on elevated role/owner privileges, unwanted DML or unapproved role switching. Before any SQL change, separately authorize the exact runtime/bootstrap role and forward-only migration with preflight, backup and recovery plan.

Upstream PostgreSQL 17 documentation: [SET ROLE](https://www.postgresql.org/docs/17/sql-set-role.html), [Role information](https://www.postgresql.org/docs/17/functions-info.html), [Role membership catalog](https://www.postgresql.org/docs/17/catalog-pg-auth-members.html).

## 6. Closure status, risks and one next action

**Completed in this bounded review:** repository/source analysis, target effective-grant matrix, protected-table and race matrix, standalone read-only runtime-role auditor, isolated CI integration assertions and migration/rollback/test plan. The artifact contains **no actual database credential, role creation, DDL migration, grant modification, GL mutation or populated-data access**.

**Outstanding blockers:** deployed-equivalent Fastify role identity/grants unknown; forward-only SQL details not yet approved/tested; actual installed data and future two-session race gates not verified. 09.08-C GL Mutation/Lifecycle **BLOCKED / NOT IMPLEMENTED**; parent 09.08 **IN_PROGRESS**; 09.08-D and 09.09 **NOT STARTED**.

**Single next action after review final-SHA CI/PR closure:** obtain authorized **actual Fastify PostgreSQL 17 runtime-role evidence using this read-only probe in a production-equivalent nonproduction environment**; only then present the precise, bounded migration/role/GRANT proposal for separately explicit owner approval. Do not ask for a password or print the connection string.

## PostgreSQL 17 references

- https://www.postgresql.org/docs/17/ddl-priv.html
- https://www.postgresql.org/docs/17/explicit-locking.html
- https://www.postgresql.org/docs/17/functions-info.html
- https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html
- https://www.postgresql.org/docs/17/perm-functions.html
