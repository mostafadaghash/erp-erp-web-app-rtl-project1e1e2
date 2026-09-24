# ADR-0005 — PostgreSQL Migration Structure

- Status: Accepted
- Phase: 03.04 — Migration Structure
- Architecture authority: Business Tech ERP Architecture Baseline v1.7
- Implementation plan authority: Business Tech ERP Master Implementation Plan v1.0

## Context

Business Tech ERP V1 requires a reproducible PostgreSQL schema that can be built from zero and evolved without ad-hoc DDL. The Master Implementation Plan requires forward-only versioned migrations, with explicit preconditions, transaction policy where PostgreSQL allows it, a verification query, and a documented rollback/recovery strategy for every migration.

The repository already contains `scripts/migration/*`, but that tooling prepares and rehearses legacy business-data migration packages. It is not the physical PostgreSQL schema migration mechanism and must remain separate for Phase 15.

Phase 03.02 also deferred permanent `pg_trgm` enablement to the migration framework defined here.

## Decision

1. PostgreSQL schema evolution uses project-owned, forward-only migration bundles under `database/migrations/`.
2. A migration is identified by a four-digit monotonically ordered version plus a canonical snake_case name:
   - `<version>_<name>.meta.json`
   - `<version>_<name>.sql`
3. The metadata file is mandatory and contains exactly:
   - `version`
   - `name`
   - `transactional`
   - `preconditionSql`
   - `verificationSql`
   - `recovery`
4. `preconditionSql` and `verificationSql` must each return exactly one row whose first column is boolean `true`. Any other result fails the migration.
5. `transactional: true` means precondition, SQL body, verification, and migration-history insert execute in one PostgreSQL transaction. Failure rolls back the migration body and history insert together.
6. `transactional: false` is supported only for PostgreSQL operations that cannot legally run inside a transaction. If such a migration fails after side effects, the runner does not pretend it was rolled back; the documented recovery procedure is the authoritative recovery path.
7. The technical table `schema_migrations` is the only persistent table introduced by 03.04. It records migration version, canonical name, SHA-256 checksum, and applied timestamp. It is infrastructure metadata, not Business data.
8. Applied migrations are immutable:
   - if a version/name/checksum differs from the repository definition, execution stops;
   - if a database reports an applied migration that is absent from the repository, execution stops;
   - an applied migration is never run again.
9. A dedicated PostgreSQL advisory lock serializes migration runners so two deployment processes cannot apply schema changes concurrently.
10. The CLI accepts one database URL through `ERP_DATABASE_URL`; it never logs credentials or the connection URL.
11. Verification mode rechecks migration history, checksums, and every applied migration's verification query without applying pending migrations.
12. Permanent `pg_trgm` enablement is migration `0001_postgresql_extensions` and remains the only PostgreSQL extension currently approved by v1.7.
13. The legacy data-migration toolkit in `scripts/migration/` is not renamed, deleted, or reused for schema evolution.

## Recovery model

Migrations are forward-only. There is no generic automatic `down` command.

- A failed transactional migration rolls back automatically and remains unapplied.
- A successfully applied migration is corrected by a new forward migration.
- A failed non-transactional migration follows its migration-specific documented recovery procedure before retry or forward correction.
- Destructive corrective work still requires the project's backup/rollback/change-control rules.

## Non-goals

03.04 does not:

- create Business tables, columns, indexes, views, functions, triggers, or constraints;
- implement the 03.05 schema build order;
- change accounting, inventory, sales, purchasing, or authorization behavior;
- migrate legacy Business data;
- perform frontend/module cutover;
- modify `main` or Convex Production.

## Consequences

- Schema evolution is deterministic and auditable before Business DDL begins.
- Applied migration drift is detected rather than silently accepted.
- CI can prove fresh application, idempotent rerun, verification, checksum protection, and transactional rollback on PostgreSQL 17.
- Phase 15 data migration remains a separate concern from Phase 03 schema evolution.
