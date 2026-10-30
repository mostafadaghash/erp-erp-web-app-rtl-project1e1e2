# ADR-0008 — Phase 03.C Product Catalog Schema Shape

- Status: Accepted
- Phase: 03.05 / 03.C — Product Catalog
- Architecture authority: Business Tech ERP Architecture Baseline v1.7
- Implementation plan authority: Business Tech ERP Master Implementation Plan v1.0

## Context

Phase 03.05 builds the PostgreSQL business schema in the approved dependency order. After 03.B Counterparties, the next approved domain is Product Catalog / Units / Attributes / Pricing. Architecture Baseline v1.7 §25.7 defines the canonical product model and §28.3 defines the final closed constraint/index catalog for these relations.

The Master Implementation Plan intentionally keeps the complete constraint pass in 03.06 and the closed Index Catalog implementation in 03.07. Therefore 03.C creates only canonical relations, columns, scalar types and nullability; it does not introduce project-owned PK/FK/UNIQUE/CHECK/generated constraints or indexes.

## Decision

Migration `0004_product_catalog` creates exactly these thirteen canonical relations:

- `product_categories`
- `products`
- `product_variants`
- `units`
- `product_units`
- `variant_barcodes`
- `attributes`
- `attribute_values`
- `product_attributes`
- `variant_attribute_values`
- `price_lists`
- `price_list_items`
- `reorder_levels`

### Product identity and variants

`products` is the product core. `product_type` is stored as text at this schema-shape stage; the architecture-defined STOCK/SERVICE semantic constraint remains 03.06 work.

Every product is designed to have at least one variant. Products without user-visible options will later receive an internal default variant through the Product Catalog service; this behavior is not seeded or implemented in DDL during 03.C.

`product_variants.sku` is nullable because the closed Index Catalog explicitly defines a partial unique SKU rule `WHERE sku IS NOT NULL`. `combination_signature` is required and is the canonical representation used later to prevent duplicate variant combinations within one product. `minimum_selling_price` uses `numeric(18,4)` and remains nullable because v1.7 explicitly defines it as optional.

### Units

`products.base_unit_id` is the only source of truth for a product's base unit. There is intentionally no `product_units.is_base` column.

`product_units.conversion_to_base` uses `numeric(18,6)` under the approved quantity precision policy. Inventory and costing remain expressed internally in the base unit. The rule that any Variant + ProductUnit pair must belong to the same Product is deferred to 03.06 integrity constraints.

### Barcodes and attributes

`variant_barcodes` supports different barcodes for the same variant by product unit. Catalog-wide barcode uniqueness is required by v1.7 but remains a 03.06 constraint and 03.07 index implementation concern according to the approved phase order.

`attributes`, `attribute_values`, `product_attributes` and `variant_attribute_values` model dynamic variant/descriptive properties without vertical-specific columns. `attribute_type` and `usage_type` remain text in 03.C; allowed-value semantics are deferred to the approved integrity/application layer.

### Pricing and reorder levels

`price_lists` supports multiple price lists. `price_list_items` stores a price for a specific PriceList + Variant + ProductUnit combination and uses `numeric(18,4)`.

`reorder_levels` stores the minimum quantity by Variant + Warehouse and uses `numeric(18,6)`. The final uniqueness rule for `(variant_id, warehouse_id)` is deferred to 03.06 and the corresponding lookup index to 03.07.

## Nullability decisions

The baseline defines fields but does not spell out PostgreSQL nullability for every column. Consistent with ADR-0006 and ADR-0007:

- identity, structural ownership/reference, discriminator, operational flags and required values are `NOT NULL`;
- `product_categories.parent_id` is nullable for root categories;
- `product_variants.sku` is nullable as proven by the approved partial unique catalog rule;
- `product_variants.minimum_selling_price` is nullable because v1.7 explicitly marks it optional;
- no default values are invented in DDL.

`products.category_id` remains required because the architecture presents it as a core structural field and does not mark it optional. Any later requirement to permit uncategorized products must be an explicit architecture change rather than an undocumented relaxation.

## Scalar types

- Internal entity/relation identifiers and references: `uuid`.
- Money/prices: `numeric(18,4)`.
- Quantity/conversion values: `numeric(18,6)`.
- Instants: `timestamptz`.
- Names, codes, signatures and discriminators: `text`.
- Flags: `boolean`.
- Display ordering: `integer`.

No floating-point type is used for monetary or quantity-bearing fields.

## Deferred integrity and indexes

03.C deliberately does not create project-owned PK/FK/UNIQUE/CHECK/generated constraints. 03.06 remains responsible for the approved integrity catalog, including at minimum:

- product/variant/category/unit referential integrity;
- unique variant combination signatures per product;
- optional SKU uniqueness;
- one ProductUnit per product/unit pair;
- catalog-wide barcode uniqueness;
- attribute/value mappings and duplicate prevention;
- one price per PriceList + Variant + ProductUnit;
- one reorder level per Variant + Warehouse;
- ProductUnit + Variant same-product context integrity.

03.C also creates no project-owned indexes. 03.07 will implement the closed v1.7 Index Catalog, including trigram product-name search and all approved exact/partial lookup indexes without adding random or redundant indexes.

## Verification contract

PostgreSQL 17 integration tests must prove that:

- migrations `0001` through `0004` apply in order;
- all thirteen 03.C relations exist with exact canonical columns, PostgreSQL types and nullability;
- money/prices use `numeric(18,4)` and quantity/conversion values use `numeric(18,6)`;
- `products` contains `base_unit_id` and `product_units` does not contain any `is_base` alias;
- `sku` and `minimum_selling_price` remain nullable;
- no 03.D relation such as `serial_numbers` exists;
- no project-owned constraints or indexes have been introduced on 03.C relations;
- 03.A and 03.B schema regression tests remain valid after migration `0004`;
- rerun and verify-only behavior remains correct;
- migration `0004` is recorded with immutable checksum.

## Recovery

Migration `0004` is transactional. Any failure before commit rolls back all thirteen relations and the migration-history insert. After successful application, corrections are forward-only migrations; direct ad-hoc edits are prohibited.

## Non-goals

This step does not:

- implement Product Catalog services, default-variant creation, pricing behavior or barcode APIs;
- implement 03.D Inventory;
- implement 03.06 constraints or 03.07 indexes;
- seed products, units, attributes or price lists;
- cut over any frontend/backend module;
- dual-write with Convex;
- modify `main` or Convex Production.
