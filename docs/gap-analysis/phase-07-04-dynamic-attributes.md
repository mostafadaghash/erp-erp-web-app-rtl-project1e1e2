# Phase 07.04 — Dynamic Attributes Gap Analysis

**Status:** `CLOSED`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0

## Scope

07.04 implements the Dynamic Attribute model only:

- Attribute usage `VARIANT / DESCRIPTIVE`.
- Attribute Value master data.
- Product ↔ Attribute mapping.
- Variant creation from selected `VARIANT` Attribute Values.
- canonical `combination_signature`.
- duplicate Variant-combination prevention, including concurrent writers.
- safe transition from the internal simple-product Default Variant to the first actual Variant.

07.05 Price Lists, 07.06 Reorder Levels, Inventory/Sales/Purchasing posting, and Frontend/Convex cutover remain excluded.

## Official baseline

The Architecture Baseline fixes these rules:

- Dynamic Attributes are `VARIANT` or `DESCRIPTIVE`.
- `VARIANT` Attributes form actual Variants such as color/size/capacity.
- `DESCRIPTIVE` Attributes describe the Product only.
- `product_attributes(product_id, attribute_id)` defines Attributes allowed/used by a Product.
- `attribute_values(attribute_id, value)` is unique per Attribute.
- `variant_attribute_values(variant_id, attribute_value_id)` prevents duplicate pair linkage.
- a complete Variant combination is made unique within one Product by `UNIQUE(product_id, combination_signature)`.
- `combination_signature` is canonical.
- the frozen Index Catalog is authoritative.

The Baseline does not define a closed vocabulary for `attribute_type`; therefore 07.04 treats it as a required opaque master-data string and does not invent values such as TEXT/SELECT/COLOR.

The approved schema contains no `product_attribute_values` table or equivalent value column for storing a selected DESCRIPTIVE value at Product level. Therefore 07.04 supports creating/linking DESCRIPTIVE Attribute definitions only and does not invent storage or misuse Variant storage for Product-level descriptive values.

The Baseline also does not explicitly require every linked VARIANT Attribute to be present in every Variant. 07.04 therefore enforces only what is stated: every selected value must belong to an allowed VARIANT Attribute of the same Product, and one Variant cannot select two values from the same Attribute.

## Current-state classification

| Area | Classification | Decision |
|---|---|---|
| `attributes` shape | موجود ومتوافق | reuse |
| usage CHECK VARIANT/DESCRIPTIVE | موجود ومتوافق | reuse |
| `attribute_values` shape + unique | موجود ومتوافق | reuse |
| `product_attributes` mapping unique | موجود ومتوافق | reuse |
| `variant_attribute_values` pair unique | موجود ومتوافق | reuse |
| Product + combination_signature unique | موجود ومتوافق | final concurrency defense |
| frozen Attribute indexes | موجود ومتوافق | no index change |
| Attribute master-data Backend commands | غير موجود | create |
| Product↔Attribute Backend mapping | غير موجود | create |
| selected-value same Product/usage validation | غير موجود في Backend | create |
| canonical signature generation | غير موجود | create |
| first real Variant transition from Default | غير موجود | create |
| DESCRIPTIVE selected-value storage | غير موجود في Baseline schema | do not invent |
| Pricing | 07.05 | do not implement |

## Database decision

No migration is required for 07.04.

Existing approved DDL already supplies:

- `ck_attributes__usage_type`.
- `uq_attribute_values__attribute_value`.
- `pk_product_attributes(product_id, attribute_id)`.
- `pk_variant_attribute_values(variant_id, attribute_value_id)`.
- `uq_product_variants__product_combination(product_id, combination_signature)`.
- frozen Attribute/AttributeValue/VariantAttributeValue indexes.

The missing semantic checks are enforced in the supported Backend command path. No new Index is added.

## Canonical signature rule

For a real Variant, 07.04 builds a signature exclusively from selected `VARIANT` Attribute Values:

1. load each selected Attribute Value together with its Attribute.
2. reject DESCRIPTIVE Attributes in Variant composition.
3. reject Attributes not mapped to the target Product.
4. reject more than one selected value from the same Attribute.
5. sort pairs by `attribute_id` ascending, then `attribute_value_id` ascending.
6. encode each pair as `attribute_id:attribute_value_id`.
7. join pairs with `|`.

UUIDs are fixed-format identifiers, so the signature is deterministic, order-independent, and unambiguous. Display labels are deliberately excluded so renaming an Attribute/Value does not silently change Variant identity.

## Backend implementation

Add `ProductAttributeService` with:

- `createAttribute()`.
- `addAttributeValue()`.
- `linkAttributeToProduct()`.
- `createVariantFromAttributes()`.
- `getVariantComposition()`.

Rules:

- master-data mutations are Audit-recorded.
- Attribute Value belongs to its Attribute.
- selected Variant values must be `VARIANT` usage and mapped to the Product.
- one selected value per Attribute.
- Product row is locked `FOR UPDATE` before creating/transitioning a Variant.
- if the Product still has only the internal 07.01 Default Variant, that same row is converted into the first real Variant so existing SKU/Barcode references are preserved.
- later combinations create additional Variant rows.
- PostgreSQL `uq_product_variants__product_combination` remains the final concurrency authority.
- known combination uniqueness conflicts are translated to a stable safe business reason.

## Required tests

- create VARIANT and DESCRIPTIVE Attributes.
- create multiple Attribute Values.
- link both usages to a Product.
- DESCRIPTIVE value cannot participate in Variant composition.
- value of an Attribute not linked to the Product is rejected.
- two values from the same Attribute in one Variant are rejected.
- canonical signature is independent of input value order.
- first actual Variant reuses the internal Default Variant ID and preserves pre-existing SKU/Barcode.
- first actual Variant becomes `is_default=false`.
- later combinations create new Variant rows.
- two different combinations coexist.
- duplicate combination is rejected.
- concurrent duplicate-combination writers yield exactly one success and one stable conflict.
- Variant composition rows match the selected Attribute Values.
- Attribute/Product/Variant mutations are Audit-recorded.
- frozen Attribute/ProductVariant index inventory remains unchanged.
- migration verify-only remains through `0023`; no 07.04 migration.
- 07.01/07.02/07.03 regressions remain green.
- Full CI passes on the same implementation SHA.

## Gate 07 progress

07.04 is responsible for:

- combination signature tests.

The remaining Gate 07 item stays open for 07.05.

## Explicit exclusions

- no Product-level selected-value persistence for DESCRIPTIVE Attributes because the Baseline schema does not define it.
- no Price List/minimum-price workflow.
- no Reorder Level workflow.
- no Inventory/Sales/Purchasing posting.
- no Frontend/Convex cutover.
- no dual write.
- no `main` merge.
- no Convex Production change.
- no migration.
- no index addition.

## Closure evidence

- Verified implementation SHA: `828866588e14c552887da705deb8cbaf4d28ef6c`.
- Full CI: Run `#1012` / `35600921253` — SUCCESS on the same implementation SHA.
- `verify`: SUCCESS.
- `backend-verify`: SUCCESS, including PostgreSQL 17 Dynamic Attributes concurrency integration.
- `browser-contract`: SUCCESS.
- `release-gate`: SUCCESS.
- VARIANT and DESCRIPTIVE Attribute definitions are supported without inventing a closed attribute_type vocabulary.
- Product↔Attribute mapping is enforced before Variant composition.
- DESCRIPTIVE values are rejected from Variant composition.
- two values from the same Attribute are rejected.
- canonical `combination_signature` is independent of input value order.
- the first actual Variant reuses the internal Default Variant row, preserving pre-existing SKU/Barcode references, and becomes `is_default=false`.
- later combinations create new Variant rows.
- duplicate combinations are rejected by the approved Product+Signature UNIQUE.
- concurrent duplicate-combination writers produce exactly one success and one stable `VARIANT_COMBINATION_ALREADY_EXISTS` conflict.
- Variant composition rows match the selected Attribute Values.
- Attribute/Product/Variant mutations are Audit-recorded.
- frozen Attribute/ProductVariant index inventory remains unchanged.
- migration history remains through `0023`; no 07.04 migration was added.
- Product-level selected-value persistence for DESCRIPTIVE Attributes was not invented because the Baseline schema does not define it.
- 07.01/07.02/07.03 regressions remain green.
- 07.05 Pricing and later Product Catalog slices were not started.
- Validation PR: `#231`, validation-only, to be closed without merge after final documentation-SHA CI.

## Next action

After final documentation-SHA validation, 07.04 is CLOSED. The next official step is PHASE 07 / 07.05 Price Lists, READY_TO_START only.
