# ADR-0001 — Central Backend Runtime and Core Toolchain

**Status:** ACCEPTED  
**Date:** 2026-09-11  
**Phase:** 02.01 — Runtime Decision  
**Branch:** `agent/postgres-v1.7-core`

## Context

Business Tech ERP is moving from the transitional Convex runtime to the approved target architecture:

`React Frontend → Central Backend API → PostgreSQL`

Architecture Baseline v1.7 remains authoritative for business behavior, database integrity, accounting, inventory, permissions, transaction boundaries, concurrency and indexes. This ADR only selects the implementation runtime/toolchain for the new Central Backend. It does not authorize Business DDL, module cutover, or changes to established domain rules.

At the start of Phase 02 the existing repository is ESM (`"type": "module"`), resolves TypeScript `5.7.3`, and CI still executes on Node.js 22. Phase 02 requires the Local Backend runtime to be selected and pinned before the Backend Skeleton is created.

## Decision

### Runtime and package manager

- Node.js: **24.21.0 LTS (Krypton)**, pinned exactly for the new backend/toolchain.
- npm: **11.19.0**, the npm version shipped with Node.js 24.21.0.
- Module system: **ESM**.
- Node.js 26 is not selected because it is the Current release line, not the project LTS baseline.

Repository runtime pins:

- `.nvmrc` = `24.21.0`
- `.node-version` = `24.21.0`
- GitHub Actions `setup-node` = `24.21.0`

### TypeScript

- Keep the repository's currently locked TypeScript **5.7.3** for Phase 02 to minimize unrelated change.
- The backend will use a dedicated strict TypeScript configuration when the skeleton is created in 02.02.
- `strict: true` is mandatory.
- A TypeScript version upgrade is a separate tooling decision and is not bundled into this runtime change.

### HTTP server

- Fastify: **5.12.3**.
- No Express compatibility layer.
- HTTP request/response validation uses Fastify JSON Schema with its built-in Ajv validation pipeline.
- Schemas are centralized under the backend API schema layer rather than duplicated in route handlers.

### Environment/config validation

- `@fastify/env`: **7.0.0**.
- Environment variables are validated at process startup against a closed schema.
- Missing/invalid required configuration fails startup before accepting traffic.
- Secrets must never be logged.

### PostgreSQL access

- `pg` / node-postgres: **8.23.0**.
- No ORM or query builder is adopted for the sensitive transactional core.
- SQL for posting, locking, integrity-sensitive reads/writes and concurrency-critical flows remains explicit.
- All statements in one database transaction must use the same checked-out `pg` client.

Transaction baseline is inherited unchanged from Architecture Baseline v1.7:

- default isolation: `READ COMMITTED`;
- explicit `BEGIN / COMMIT / ROLLBACK`;
- explicit `SELECT ... FOR UPDATE` for protected rows;
- deterministic lock ordering;
- idempotency for retryable commands;
- bounded automatic retry only for PostgreSQL deadlock/serialization conflicts (`40P01`, `40001`), maximum 3 attempts;
- no automatic retry for business validation failures;
- `SERIALIZABLE` is not the global default.

### Logging

- Pino: **10.3.1** as the structured JSON logging standard.
- Fastify request logging uses the same Pino logging model.
- Production logs are structured JSON, not pretty console output.
- Request IDs/correlation IDs are carried in logs.
- Authorization headers, cookies, tokens, passwords, connection strings and equivalent secrets are redacted.
- Business logs must not substitute for the immutable audit model defined by Architecture Baseline v1.7.

### Development/build execution

- `tsx`: **4.23.13** for local TypeScript development execution only.
- Production backend artifacts are compiled TypeScript output; production does not depend on a development watcher.
- Existing `node:test` remains the default low-level test runner unless a later ADR proves a different runner is required.

### Dependency policy for the new backend

Core backend dependencies introduced from 02.02 onward are added deliberately and locked in `package-lock.json`. Broad dependency upgrades are not bundled with backend work. Any replacement of Fastify, `pg`, the validation approach, or the runtime major line requires an ADR before business modules depend on it.

## Rationale

1. Node.js 24 is the current LTS line and provides a supported production baseline without adopting the non-LTS Node.js 26 line.
2. Fastify 5 is the current stable Fastify major and supports modern Node.js releases while providing native schema validation and structured logging integration.
3. `pg` keeps transaction ownership, row locking and SQL semantics explicit, which matches the v1.7 concurrency model better than hiding critical posting paths behind an ORM abstraction.
4. Fastify JSON Schema/Ajv is used as the HTTP validation source instead of introducing a second request-validation model such as Zod. This avoids parallel schema definitions in V1.
5. `@fastify/env` uses the same JSON-Schema-oriented ecosystem for startup configuration validation.
6. Keeping TypeScript 5.7.3 during Phase 02.01 isolates the runtime decision from an unrelated compiler migration.

## Rejected alternatives

### Node.js 26 Current

Rejected for the production baseline because it is not the LTS line on the decision date.

### Continue pinning CI to Node.js 22

Rejected because Phase 02 requires one deterministic runtime baseline. Development, CI and the eventual backend runtime must not silently diverge.

### ORM-first persistence

Rejected for the transactional core. It could obscure exact SQL, lock ordering and transaction-client ownership required by Architecture Baseline v1.7. An ORM may only be reconsidered for non-critical read-only tooling through a later ADR.

### Zod as a second HTTP validation stack

Rejected for V1 because Fastify already has a JSON Schema/Ajv validation pipeline. Adding a second primary validation model would create duplicated schema ownership unless there is a demonstrated need.

### Convex as final backend runtime

Rejected by the approved migration strategy. Convex remains transitional/reference implementation until module cutover is complete.

## Consequences

- CI is moved from Node.js 22 to exact Node.js 24.21.0 as part of this runtime pin.
- Existing frontend/legacy tests must continue to pass on Node.js 24.21.0 before 02.01 is considered verified.
- 02.02 may now create the backend skeleton using this accepted stack.
- No Business PostgreSQL tables, posting logic, finance/inventory schema, or frontend module cutover is authorized by this ADR.

## Verification required for 02.01

- Repository runtime pin files resolve to Node.js 24.21.0.
- Existing CI installs and runs on Node.js 24.21.0.
- Dependency audit passes.
- TypeScript passes.
- Full legacy regression tests pass.
- Security check passes.
- Production frontend build passes.
- Release preflight and browser contract pass.
- No Business DDL or new backend module code is present in this subphase.

## References

- Architecture Baseline v1.7 — transaction/concurrency baseline and lock ordering.
- Master Implementation Plan v1.0 — Phase 02.01 Runtime Decision and Gate 02 sequencing.
- Node.js official LTS download/release pages.
- Fastify v5 documentation and LTS policy.
- node-postgres transaction documentation.
