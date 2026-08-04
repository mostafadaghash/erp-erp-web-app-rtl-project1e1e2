# Audit Log — Operational Document Links Matrix

| ID | Contract | Automated evidence |
| --- | --- | --- |
| AOD-01 | Invoice create/update/status/cancel rows identify the invoice, branch, customer and safe before/after state. | Source contract |
| AOD-02 | Order create/update/status/payment/refund/cancel rows identify the order and link payment/refund finance transactions. | Source contract |
| AOD-03 | Delivery create/confirm/reverse rows identify delivery, invoice and confirmation lineage. | Source contract |
| AOD-04 | COD settlement creation and reversal produce direct immutable audit rows with finance lineage. | Source contract |
| AOD-05 | Repair create/detail/status/tracking-rotation rows identify repair and customer without exposing tracking tokens. | Source contract |
| AOD-06 | Sales credit notes and reversals identify the invoice and original/reversal finance transactions. | Source contract |
| AOD-07 | Purchase returns and reversals identify receipt, finance transaction and journal entry lineage. | Source contract |
| AOD-08 | New snapshots exclude request IDs, fingerprints, idempotency keys and tracking tokens. | Source contract |
| AOD-09 | Audit Log UI has Arabic labels and no navigation derived from audit values. | Source contract |

## Manual acceptance

- Create, edit, status-change and cancel one invoice and one order; confirm source document, branch, customer and before/after values.
- Record and refund an order deposit; confirm the operational row and the centralized Finance row share the same transaction identifier.
- Create a delivery, confirm COD delivery, reverse the confirmation, create a COD settlement and reverse it; verify each document and reversal lineage is distinguishable.
- Create a repair, rotate its public tracking link, update details and move it through statuses; confirm no tracking token value is displayed.
- Create and reverse one sales credit note and one purchase return; confirm invoice/receipt, Finance and journal references.
- Check long IDs and Arabic labels on desktop and mobile; audit tags must remain non-clickable.

## Scope boundary

This slice changes audit metadata, direct audit coverage and Audit Log presentation only. It does not change balances, inventory calculations, invoice/order totals, delivery eligibility, COD settlement arithmetic, repair workflow rules, return valuation, journal debit/credit mappings, idempotency keys, permissions, branch ownership or schema.
