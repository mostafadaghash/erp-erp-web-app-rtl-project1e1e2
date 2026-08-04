# Audit Log Pagination Foundation Matrix

| ID | Scenario | Automated evidence | Manual follow-up |
|---|---|---|---|
| AUD-01 | Large audit history never uses full-table `collect()` or array slicing | `auditLogPaginationFoundation.test.ts` | Seed more than 5,000 events and confirm first render remains responsive |
| AUD-02 | Audit history uses Convex cursor pagination | Source contract checks `paginationOptsValidator` and `.paginate()` | Load multiple pages and confirm stable newest-first ordering |
| AUD-03 | Audit user filter matches the stored Auth user ID type | Source contract requires `v.string()` | Filter one known administrator after user-filter UI is added |
| AUD-04 | Non-admin access cannot request another user or branch | Source contract checks fail-closed guards | Grant `view_audit_logs` to a branch test role and verify denial |
| AUD-05 | Module, action, branch, user, and date filters are accepted by the backend | Source contract checks every argument and invalid ranges | Exercise combined filters against seeded records |
| AUD-06 | Common filter paths have dedicated indexes | Schema source contract | Review Convex query metrics after production-like load |
| AUD-07 | Public query returns an allowlisted DTO rather than raw documents | Source contract checks DTO mapping | Inspect browser payload for internal-field leakage |
| AUD-08 | UI loads 50 rows initially and 50 per request | UI source contract | Verify repeated Load More under throttled network |
| AUD-09 | Loading, true-empty, local-search-empty, and exhausted states differ | UI source contract | Validate Arabic copy and screen-reader announcements |
| AUD-10 | No unsafe TypeScript escape is introduced | Source guard | Run full TypeScript, security, and production build in CI |

## Scope boundary

This foundation closes scalable reading and honest UI states. The next Audit Log slice must audit all write call sites, add structured Before/After snapshots, correct record-branch attribution for central users, link financial operations to their documents, and cover export plus sensitive administrative events.
