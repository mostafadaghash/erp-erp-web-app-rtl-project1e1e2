# Phase 07.02 — Units Gap Analysis

**Status:** `IN_PROGRESS`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0

## Scope

07.02 implements only Unit/ProductUnit behavior:

- Unit master data with `allows_fraction`.
- ProductUnit conversion to the Product Base Unit.
- `is_sellable` / `is_purchasable` enforcement.
- quantity validation according to the selected Unit's fraction policy.
- exact conversion to Base Unit using the approved quantity precision.
- prevent a Variant from being paired with a ProductUnit owned by another Product.
- preserve `products.base_unit_id` as the only Base Unit source of truth.

07.03 SKU/Barcode, 07.04 Dynamic Attributes, 07.05 Pricing, 07.06 Reorder Levels, Inventory posting, Sales/Purchasing posting, and Frontend/Convex cutover remain excluded.

## Official baseline

The Architecture Baseline fixes these rules:

- quantities use PostgreSQL `numeric(18,6)`; no floating point for inventory quantities.
- every Product has exactly one Base Unit source of truth through `products.base_unit_id`; there is no `product_units.is_base`.
- alternative ProductUnits carry an explicit `conversion_to_base`.
- internal inventory/cost/reservation quantities are expressed in the Base Unit.
- `units.allows_fraction` determines whether a quantity entered in that Unit may contain a fractional part.
- `product_units.is_sellable` and `is_purchasable` define allowed business usage.
- Variant + ProductUnit references used together must belong to the same Product; Cross-Product Unit linkage is forbidden.

The Baseline does not define a rounding policy for a conversion that cannot be represented exactly at quantity scale 6. 07.02 therefore must not silently round. Such a conversion is rejected so persisted quantities remain exact within the approved `numeric(18,6)` model.

## Current-state classification

| Area | Classification | Decision |
|---|---|---|
| `units` physical shape | موجود ومتوافق | reuse |
| `product_units` physical shape | موجود ومتوافق | reuse |
| `units.allows_fraction` | موجود ومتوافق | enforce in Backend |
| `conversion_to_base numeric(18,6)` | موجود ومتوافق | reuse |
| positive conversion CHECK | موجود ومتوافق | reuse |
| one ProductUnit per Product + Unit | موجود ومتوافق | reuse UNIQUE |
| `is_sellable/is_purchasable` | موجود ومتوافق | enforce in Backend |
| `products.base_unit_id` single truth | موجود ومتوافق | preserve |
| cross-product catalog integrity | موجود جزئيًا في DDL | add reusable Backend compatibility check; later document/barcode layers retain their DB checks |
| Unit/ProductUnit Backend commands | غير موجود | create |
| exact quantity/fraction conversion helper | غير موجود | create |
| frozen Unit/ProductUnit indexes | موجود ومتوافق | no index change |
| SKU/Barcode | 07.03 | do not implement |

## Database decision

No migration is required for 07.02.

Existing DDL already provides:

- `uq_units__name`.
- `uq_product_units__product_unit`.
- `ck_product_units__conversion_to_base`.
- Product/Base ProductUnit ownership integrity.
- approved `ix_product_units__unit_id`.

The 07.02 Backend will additionally prevent changing the current Base ProductUnit's conversion away from exactly 1. This is enforced at the supported Backend command path without inventing a second Base Unit flag.

## Backend implementation

Add `ProductUnitService` with:

- `createUnit()`.
- `addProductUnit()`.
- `updateProductUnitPolicy()`.
- `validateAndConvertQuantity()`.
- read helpers for ProductUnit state.

Rules:

1. Unit/ProductUnit master-data writes are transactional and Audit-recorded.
2. conversion factors are positive decimal strings representable as `numeric(18,6)`.
3. Base ProductUnit conversion must remain exactly `1.000000`.
4. non-fraction Units reject non-integral entered quantities.
5. ProductUnit business usage checks `is_sellable` / `is_purchasable`.
6. Variant and ProductUnit must belong to the same Product.
7. quantity conversion uses exact integer-scaled decimal arithmetic, never JS floating point.
8. if the exact converted Base quantity needs more than 6 decimal places or exceeds `numeric(18,6)`, reject rather than silently round.

## Required tests

- create fractional and non-fraction Unit masters.
- add alternative ProductUnit with explicit conversion.
- update sellable/purchasable flags.
- Base ProductUnit conversion cannot be changed away from 1.
- integer quantity succeeds for a non-fraction Unit.
- fractional quantity fails for a non-fraction Unit.
- fractional quantity succeeds for an `allows_fraction=true` Unit.
- exact unit conversion returns expected Base quantity.
- conversion that would require silent rounding is rejected.
- SELL use rejects non-sellable ProductUnit.
- PURCHASE use rejects non-purchasable ProductUnit.
- Variant + ProductUnit from different Products is rejected.
- same-Product Variant + ProductUnit succeeds.
- Unit/ProductUnit Audit records are committed with mutations.
- frozen Unit/ProductUnit index inventory remains unchanged.
- migration verify-only remains through `0023`; no 07.02 migration.
- 07.01 default-variant behavior remains green.
- Full CI passes on the same implementation SHA.

## Gate 07 progress

07.02 is responsible for:

- unit conversion tests.
- fraction restriction tests.

The remaining Gate 07 items stay open for 07.03 through 07.05.

## Explicit exclusions

- no SKU/barcode workflow.
- no Dynamic Attribute/combination workflow.
- no Price List/minimum-price workflow.
- no Reorder Level workflow.
- no Inventory/Sales/Purchasing posting.
- no Frontend/Convex cutover.
- no dual write.
- no `main` merge.
- no Convex Production change.
- no migration.
- no index addition.

## Next action

Implement and validate 07.02 Units only. 07.03 remains forbidden until 07.02 closes.
