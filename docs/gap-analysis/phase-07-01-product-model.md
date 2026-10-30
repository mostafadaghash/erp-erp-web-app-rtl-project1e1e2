# Phase 07.01 — Product Model Gap Analysis

**Status:** `CLOSED`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0

## Scope

07.01 implements only the Product core model:

- Product type is `STOCK` or `SERVICE`.
- every Product retains at least one Variant.
- a simple/no-options Product is created with one internal Default Variant.
- `products.base_unit_id` remains the only Base Unit source of truth.
- Product + Base ProductUnit + internal Default Variant creation is atomic.
- master-data mutation is Audit-recorded.

07.02 Units, 07.03 Barcodes/SKU, 07.04 Dynamic Attributes, 07.05 Pricing, 07.06 Reorder Levels, Inventory, Sales/Purchasing posting, and Frontend/Convex cutover remain excluded.

## Baseline decisions

- `products.product_type = STOCK | SERVICE`.
- every Product has at least one `product_variant`.
- a Product with no options receives an internal hidden Default Variant.
- `products.base_unit_id` is the single Base Unit source of truth; there is no `product_units.is_base`.
- the Base Unit is represented by a ProductUnit owned by that Product.
- `product_variants.combination_signature` is canonical for variant combinations, but 07.04 owns combination canonicalization.
- Product master-data mutations follow Backend/Audit rules.

## Current-state classification

| Area | Classification | Decision |
|---|---|---|
| `products` physical shape | موجود ومتوافق | reuse |
| `product_variants` physical shape | موجود ومتوافق | reuse |
| `product_units` physical shape | موجود ومتوافق | reuse |
| STOCK/SERVICE CHECK | موجود ومتوافق | reuse |
| Product must retain at least one Variant | موجود ومتوافق | reuse deferred DB trigger |
| Product Base ProductUnit ownership | موجود ومتوافق | reuse deferred DB FK/trigger |
| absence of `product_units.is_base` | موجود ومتوافق | preserve |
| frozen Product indexes | موجود ومتوافق | no index change |
| atomic Product + Base ProductUnit + Default Variant Backend command | غير موجود | create |
| simple-product Default Variant behavior | غير موجود في Backend | create/test |
| Product Model stable error contract | غير موجود | create |
| Product Model Audit integration | غير موجود | create |
| alternate-unit management/fraction policy | 07.02 | do not implement |
| SKU/barcode management | 07.03 | do not implement |
| Dynamic Attribute combinations | 07.04 | do not implement |

## Database decision

No migration is required for 07.01.

The approved DDL already enforces:

- `ck_products__product_type`.
- deferred `fk_products__base_unit`.
- `ct_products__catalog_integrity_at_commit` for same-product Base ProductUnit and at least one Variant.
- `ct_product_variants__preserve_catalog_integrity_at_commit` so the last Variant cannot be removed.

No new Index is required. The frozen v1.7 Index Catalog remains unchanged.

## Backend implementation

Add `ProductModelService` with a 07.01-only command:

`createSimpleProduct()`

The command will:

1. validate the actor and basic Product input.
2. validate referenced Category and Unit exist.
3. create Product, Base ProductUnit and one internal Default Variant in one READ COMMITTED transaction.
4. bootstrap the Base ProductUnit with `conversion_to_base = 1`; no alternate-unit conversion workflow is exposed.
5. create the internal Variant with `is_default=true`; the internal signature marker is implementation-only and is not promoted to an Architecture vocabulary.
6. record `PRODUCT_CREATED` Audit in the same transaction.
7. return a read model that explicitly identifies the Product as simple and the internal Default Variant.

No update/delete/alternate-unit/attribute/price/barcode/reorder command is introduced in 07.01.

## Required tests

- create STOCK simple Product.
- create SERVICE simple Product.
- each created Product has exactly one Variant.
- internal sole Variant is `is_default=true`.
- Product Base Unit points to a ProductUnit owned by the same Product.
- Base ProductUnit conversion is exactly 1.
- `product_units.is_base` remains absent.
- invalid Product type fails before DB access.
- invalid tracking-policy combination fails before DB access.
- missing Category/Unit fails without partial Product rows.
- existing deferred DB constraint still rejects removal of the last Variant.
- `PRODUCT_CREATED` Audit exists.
- frozen Product index inventory remains unchanged.
- migration verify-only remains through `0023`; no 07.01 migration.
- Full CI passes on the same implementation SHA.

## Gate 07 progress

07.01 is responsible only for:

- default variant behavior.

Other Gate 07 items remain open for 07.02 through 07.05.

## Explicit exclusions

- no 07.02 alternate-unit management or fractional quantity enforcement.
- no 07.03 SKU/barcode workflow.
- no 07.04 Dynamic Attribute workflow/canonicalizer.
- no 07.05 Price List/minimum-price workflow.
- no 07.06 Reorder Level workflow.
- no Inventory/Sales/Purchasing posting.
- no Frontend/Convex cutover.
- no dual write.
- no `main` merge.
- no Convex Production change.
- no migration.
- no index addition.

## Closure evidence

- Verified implementation SHA: `1327ec47a59d19fb02f32c2f20e2d38a13d20008`.
- Full CI: Run `#1003` / `35518501734` — SUCCESS on the same implementation SHA.
- `verify`: SUCCESS.
- `backend-verify`: SUCCESS, including PostgreSQL 17 Product Model integration.
- `browser-contract`: SUCCESS.
- `release-gate`: SUCCESS.
- STOCK and SERVICE simple Product creation passed.
- each created simple Product has exactly one Variant and that Variant is `is_default=true`.
- Product + Base ProductUnit + internal Default Variant commit atomically.
- `products.base_unit_id` points to a ProductUnit owned by the same Product.
- Base ProductUnit conversion is exactly 1.
- `product_units.is_base` remains absent.
- existing deferred DB integrity still rejects removal of the last Variant.
- missing Category/Unit leaves no partial Product/ProductUnit/Variant rows.
- `PRODUCT_CREATED` Audit is recorded in the same transaction.
- frozen Product/ProductVariant/ProductUnit index inventory is unchanged.
- migration history remains through `0023`; no 07.01 migration was added.
- 07.02 Units, 07.03 SKU/Barcode, 07.04 Dynamic Attributes, Pricing/Reorder and Frontend/Convex cutover were not started.
- Validation PR: `#228`, validation-only, to be closed without merge after final documentation-SHA CI.

## Next action

After final documentation-SHA validation, 07.01 is CLOSED. The next official step is PHASE 07 / 07.02 Units, READY_TO_START only.
