# Delivery/COD Action Validation Matrix

| Operation | Required before submit | UI behavior |
|---|---|---|
| Create delivery | branch, ready order, eligible invoice, city, address, carrier, non-negative carrier fee, ISO date | disabled with first blocking reason |
| Confirm shipped | selected pending delivery | disabled when selection is missing |
| Confirm delivered | selected shipped delivery, ISO date, COD clearing account only when COD is positive | disabled with account/date reason |
| Return or cancel | selected delivery and non-empty reason | disabled with reason prompt |
| Reverse confirmation | selected delivered record, non-empty reason, ISO date | disabled with reason/date prompt |
| Create COD settlement | branch, source, different destination, at least one delivery, positive gross, non-negative fee not above gross, ISO date | disabled with first blocking reason |
| Reverse COD settlement | selected settlement, non-empty reason, ISO date | disabled with reason/date prompt |

The backend remains authoritative. This matrix prevents avoidable invalid submissions during UAT and exposes the exact missing input before the mutation is called.
