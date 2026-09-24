# PostgreSQL Schema Migrations

This directory is the forward-only schema migration source for the Business Tech ERP PostgreSQL V1 core.

## File contract

Each migration consists of exactly two versioned files:

```text
0001_example.meta.json
0001_example.sql
```

The metadata object contains:

```json
{
  "version": "0001",
  "name": "example",
  "transactional": true,
  "preconditionSql": "SELECT true AS ok;",
  "verificationSql": "SELECT true AS ok;",
  "recovery": "Describe the explicit recovery/forward-correction path."
}
```

Rules:

- versions are four digits and greater than `0000`;
- names are lowercase `snake_case`;
- the metadata version/name must match the filenames;
- every `.meta.json` requires exactly one matching `.sql` file and vice versa;
- precondition and verification queries each return exactly one row with a boolean `true` first column;
- applied definitions are immutable because the runner stores and checks their SHA-256 checksum;
- migrations are forward-only; corrections are new migrations, not edits to applied files;
- `transactional: false` is reserved for PostgreSQL operations that cannot run in a transaction and therefore must carry a specific recovery procedure.

## Commands

```text
ERP_DATABASE_URL=postgresql://... node scripts/database/migrations.mjs apply
ERP_DATABASE_URL=postgresql://... node scripts/database/migrations.mjs verify
```

The runner uses a PostgreSQL advisory lock and stores technical history in `schema_migrations`.

The existing `scripts/migration/` directory is separate legacy/business-data migration tooling for later Phase 15. Do not place schema DDL there.
