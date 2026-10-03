# Phase 07.03 — Barcodes / SKU Gap Analysis

**Status:** `CLOSED`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0

## Scope

07.03 implements Product Variant catalog identifiers only:

- nullable Variant SKU.
- Backend-normalized uppercase SKU.
- globally unique non-null SKU.
- globally unique catalog barcode.
- Barcode maps to Variant + ProductUnit.
- Barcode may differ by ProductUnit for the same Variant.
- Variant and ProductUnit used by a Barcode must belong to the same Product.
- exact SKU/barcode lookup.
- concurrency uniqueness verified against PostgreSQL 17.

07.04 Dynamic Attributes, 07.05 Price Lists, 07.06 Reorder Levels, Inventory/Sales/Purchasing posting, and Frontend/Convex cutover remain excluded.

## Official baseline

The Architecture Baseline fixes these rules:

- Variant carries SKU and barcodes.
- SKU is uppercased and validated by the Backend.
- `product_variants.sku` is nullable, but non-null values are unique.
- `variant_barcodes.barcode` is unique across the catalog.
- Barcode is linked to both Variant and ProductUnit.
- the same Variant may have different barcodes for different selling/purchasing ProductUnits.
- Variant + ProductUnit linked by a Barcode must belong to the same Product.
- SKU/Barcode lookup is exact B-Tree lookup in V1.
- the frozen Index Catalog is authoritative; no extra identifier index may be added.

The Baseline does not define a uniqueness rule for the pair `(variant_id, product_unit_id)`, nor does it define a single-primary-barcode constraint. 07.03 therefore does not invent either rule.

## Current-state classification

| Area | Classification | Decision |
|---|---|---|
| `product_variants.sku` nullable column | موجود ومتوافق | reuse |
| partial unique non-null SKU index | موجود ومتوافق | reuse as final concurrency defense |
| `variant_barcodes` physical shape | موجود ومتوافق | reuse |
| global barcode UNIQUE | موجود ومتوافق | reuse as final concurrency defense |
| Barcode Variant/ProductUnit FK | موجود ومتوافق | reuse |
| same-Product Barcode integrity trigger | موجود ومتوافق | reuse |
| exact SKU/barcode B-Tree lookup | موجود ومتوافق | reuse frozen catalog |
| Backend uppercase SKU command | غير موجود | create |
| Backend Barcode command | غير موجود | create |
| exact identifier lookup service | غير موجود | create |
| stable identifier conflict contract | غير موجود | create |
| concurrency uniqueness tests | غير موجود | create |
| Dynamic Attribute combination signature | 07.04 | do not implement |

## Database decision

No migration is required for 07.03.

Existing approved database protection already includes:

- `ux_product_variants__sku__where_sku_is_not_null`.
- `uq_variant_barcodes__barcode`.
- `ix_variant_barcodes__variant_id`.
- Variant/ProductUnit same-Product deferred integrity for Barcode rows.

No new Index is required or permitted by the frozen catalog.

## Backend implementation

Add `ProductIdentifierService` with:

- `setVariantSku()`.
- `addBarcode()`.
- `findVariantBySku()`.
- `findBarcode()`.

Rules:

1. SKU input is trimmed and uppercased before persistence; empty/blank means `NULL`.
2. SKU uniqueness is decided by PostgreSQL's approved partial unique index, including concurrent writers.
3. Barcode input is trimmed, non-empty, and stored exactly after outer-whitespace trimming; no undocumented format/country/vendor normalization is invented.
4. Barcode uniqueness is decided by PostgreSQL's approved UNIQUE constraint, including concurrent writers.
5. addBarcode validates Variant + ProductUnit same Product before insert; DB deferred integrity remains final defense.
6. exact lookup uses equality on the stored canonical SKU or Barcode.
7. identifier mutations are Audit-recorded in the same transaction.
8. DB unique violations from the known SKU/barcode constraints are translated to stable safe business reasons.

## Required tests

- lowercase/mixed-case SKU stores uppercase.
- blank SKU stores NULL.
- exact SKU lookup resolves by uppercase canonical value.
- duplicate non-null SKU is rejected.
- concurrent duplicate SKU writers yield exactly one success and one stable conflict.
- null SKU is allowed on multiple Variants.
- add Barcode for same Product Variant + ProductUnit succeeds.
- same Variant may hold distinct Barcodes for different ProductUnits.
- Barcode exact lookup returns Variant + ProductUnit.
- Cross-Product Barcode linkage is rejected.
- duplicate Barcode is rejected.
- concurrent duplicate Barcode writers yield exactly one success and one stable conflict.
- identifier mutations are Audit-recorded.
- frozen identifier indexes remain unchanged.
- migration verify-only remains through `0023`; no 07.03 migration.
- 07.01/07.02 regressions remain green.
- Full CI passes on the same implementation SHA.

## Gate 07 progress

07.03 is responsible for:

- SKU/barcode concurrency uniqueness.

Remaining Gate 07 items stay open for 07.04 and 07.05.

## Explicit exclusions

- no Dynamic Attributes / combination signature canonicalization.
- no Price List / minimum-price workflow.
- no Reorder Level workflow.
- no Inventory/Sales/Purchasing posting.
- no Frontend/Convex cutover.
- no dual write.
- no `main` merge.
- no Convex Production change.
- no migration.
- no index addition.

## Closure evidence

- Verified implementation SHA: `02ef957e13c609a12a01f894ee0abafea10935ff`.
- Full CI: Run `#1009` / `35534721633` — SUCCESS on the same implementation SHA.
- `verify`: SUCCESS.
- `backend-verify`: SUCCESS, including PostgreSQL 17 Barcode/SKU concurrency integration.
- `browser-contract`: SUCCESS.
- `release-gate`: SUCCESS.
- mixed/lowercase SKU is stored canonically uppercase.
- blank SKU is stored as NULL and multiple NULL SKUs remain allowed.
- exact SKU lookup resolves through canonical uppercase equality.
- direct duplicate non-null SKU is rejected.
- concurrent duplicate SKU writers produce exactly one success and one stable `SKU_ALREADY_EXISTS` conflict.
- Barcode is stored after outer-whitespace trimming with no undocumented format normalization.
- same Variant can carry different Barcodes for different ProductUnits.
- exact Barcode lookup returns Variant + ProductUnit.
- Cross-Product Variant + ProductUnit Barcode linkage is rejected.
- direct duplicate Barcode is rejected.
- concurrent duplicate Barcode writers produce exactly one success and one stable `BARCODE_ALREADY_EXISTS` conflict.
- identifier mutations are Audit-recorded in the same transaction.
- frozen ProductVariant/Barcode identifier index inventory remains unchanged.
- migration history remains through `0023`; no 07.03 migration was added.
- 07.01 Product Model and 07.02 Units regressions remain green.
- 07.04 Dynamic Attributes and later Product Catalog slices were not started.
- Validation PR: `#230`, validation-only, to be closed without merge after final documentation-SHA CI.

## Next action

After final documentation-SHA validation, 07.03 is CLOSED. The next official step is PHASE 07 / 07.04 Dynamic Attributes, READY_TO_START only.
