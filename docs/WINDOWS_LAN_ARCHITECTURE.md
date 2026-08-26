# DAGHASH ERP Windows LAN Architecture

## Status

Foundation only. The Cloud application remains the sole production runtime. The LAN readiness endpoint deliberately returns `503` until PostgreSQL, authentication, migrations, backup, and transaction recovery are implemented and verified.

## Product boundary

- `Cloud Edition` remains React + Convex and is not modified by LAN-only runtime code.
- `Windows LAN Server` will run on the main Windows device and own the authoritative PostgreSQL database.
- `Windows LAN Client` will run the React interface on each workstation and call the LAN Server API.
- Clients must never connect directly to PostgreSQL.
- GitHub stores source code and release artifacts, never customer business data.

## Runtime topology

1. The main device installs PostgreSQL, the LAN Server Windows service, and the desktop client.
2. Workstations install only the desktop client and the trusted local certificate.
3. The installer reserves a fixed port, creates the narrow firewall rule, and records the main device address.
4. Internet access is optional for normal LAN operation. Cloud backup and update checks are separate opt-in services.

## Migration order

The executable manifest is `lan/migration-manifest.mjs`. It covers every table in `convex/schema.ts` exactly once and fixes the migration order:

1. Foundation, branches, users, document numbers, and audit.
2. Catalog and inventory.
3. Customers and suppliers.
4. Sales, returns, and orders.
5. Purchasing, receipts, returns, and supplier payments.
6. Treasury and finance.
7. General ledger.
8. Repairs, deliveries, and COD.
9. CRM.

## Non-negotiable invariants

- Financial and inventory posting is atomic.
- Every write carries an idempotency key.
- Document numbers are unique per configured scope.
- Branch authorization is enforced by the server, never only by the UI.
- Audit records are append-only.
- Money is persisted as integer minor units in PostgreSQL.
- Dates follow the existing business-date rules; timestamps are stored in UTC.
- Backups are verified by restore drills, not file existence alone.
- A failed upgrade must preserve the last known-good database and application version.

## Current migration gate

Run:

```bash
npm run lan:audit
```

The gate records the initial Convex coupling baseline, rejects new direct coupling, and requires the LAN migration manifest to cover all 47 source tables. Counts may only move downward unless a deliberate schema change also updates the manifest and its tests.

## Next implementation slice

1. Add the local PostgreSQL development container and schema migration tool.
2. Implement the foundation tables with integer money and audit constraints.
3. Add authenticated `/v1/session`, `/v1/setup/status`, and `/v1/branches` contracts.
4. Prove login from a second process through the LAN API.
5. Keep `/ready` blocked until database health and migrations pass.
