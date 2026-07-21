# COGS and sales-return coverage matrix

This change establishes the root cause: inventory previously tracked quantity only, used mutable `products.costPrice`, did not freeze invoice-line cost, could not reproduce historical COGS, reversed cancellation quantity without historical value, and had no durable credit-note document. Legacy invoice cost is deliberately unknown and never inferred from today's product cost.

| Area | Automated coverage |
|---|---|
| Opening value; movement consistency | COGS-03 |
| Weighted/landed average; shipping allocation and rounding; duplicate receipt | COGS-01, COGS-02, COGS-04 |
| Sale value, frozen server COGS, hostile UI prices | COGS-05 |
| Legacy policy | COGS-06 |
| Historical partial return and request idempotency | COGS-07 |
| Deterministic cumulative/net allocation | COGS-02, COGS-08 |
| Permission redaction | Backend query implementation plus existing permission integration suite |
| Credit-note UI and print permission | Type/build checks and source-level security check |

Manual acceptance remains appropriate for browser print layout. The Convex integration cases use `convex-test`, the real schema, generated API references, authenticated identities, and actual mutations rather than mocked functions.
