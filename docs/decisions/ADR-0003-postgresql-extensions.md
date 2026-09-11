# ADR-0003 — PostgreSQL Extensions Baseline

- Status: Accepted
- Phase: 03.02 — PostgreSQL Extensions
- Architecture authority: Business Tech ERP Architecture Baseline v1.7
- Implementation plan authority: Business Tech ERP Master Implementation Plan v1.0

## Context

Architecture Baseline v1.7 fixes PostgreSQL search V1 as `pg_trgm + GIN` for the approved partial-name search patterns. Exact SKU/barcode/serial/document-number lookup remains B-Tree based, and phone lookup uses `normalized_phone`. The Index Catalog in v1.7 is closed and does not authorize an external search service for V1.

The Master Implementation Plan 03.02 therefore allows `pg_trgm` as the only currently approved PostgreSQL search extension and explicitly excludes Elasticsearch/OpenSearch.

## Decision

1. `pg_trgm` is the only project-approved PostgreSQL extension at this stage.
2. No other extension may be added during V1 schema implementation without an explicit architecture change/ADR backed by a real requirement.
3. No Elasticsearch, OpenSearch, or other external search service is introduced in V1.
4. The extension is used only where the v1.7 Index Catalog authorizes trigram/GIN search. This ADR does not add indexes and does not widen the closed Index Catalog.
5. Permanent enablement in a customer database will be expressed through the forward-only migration mechanism defined in Phase 03.04; 03.02 does not create the migration structure early.
6. CI must prove on the supported PostgreSQL 17 image that:
   - `pg_trgm` is available;
   - `CREATE EXTENSION IF NOT EXISTS pg_trgm` succeeds;
   - repeating the same enablement is idempotent;
   - exactly one installed extension row exists afterward;
   - a basic `pg_trgm` function is usable.
7. The CI probe must clean up the extension after verification so it does not create hidden state for later integration checks.

## Non-goals

This decision does not:

- define money/quantity/time types (03.03);
- create migration tooling or production migration files (03.04);
- create Business tables, indexes, views, or constraints (03.05);
- alter Convex runtime ownership or perform a module cutover;
- modify `main` or Convex Production.

## Consequences

- Search extension scope stays aligned with the closed v1.7 Index Catalog.
- PostgreSQL 17 compatibility and idempotent enablement are continuously verified in CI.
- Production/customer database enablement remains auditable and ordered under the migration framework rather than being executed ad hoc.
