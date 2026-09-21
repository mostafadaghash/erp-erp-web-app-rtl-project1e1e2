# Phase 07.05 — Price Lists Gap Analysis

**Status:** `IN_PROGRESS`  
**Branch:** `agent/postgres-v1.7-core`  
**Architecture Source:** Business Tech ERP Architecture Baseline v1.7  
**Implementation Plan:** Business Tech ERP Master Implementation Plan v1.0

## Scope

07.05 implements Product Catalog pricing only:

- unlimited Price Lists.
- one price per PriceList + Variant + ProductUnit.
- Branch default Price List.
- Customer default Price List.
- automatic Price List resolution with Customer default taking precedence over Branch default, and an explicit selected Price List taking precedence over both.
- optional Minimum Selling Price per Variant.
- independent permission for manual price edits.
- independent permission for selling below Minimum Selling Price.
- the explicit v1.7 default grant for below-minimum selling: SYSTEM_ADMIN only.
- stable safe errors and Audit for pricing master-data mutations.

07.06 Reorder Levels, Sales document repricing/orchestration, Inventory, Purchasing, Frontend/Convex cutover, and actual Sales posting remain excluded.

## Official baseline

The Architecture Baseline fixes these rules:

- Price Lists are unlimited.
- a Branch may have a Default Price List.
- an Account/Customer may have a Default Price List.
- a Price List item is keyed by Price List + Variant + ProductUnit.
- Minimum Selling Price is optional per Variant.
- manual price editing requires an independent Effective Permission.
- selling below Minimum Selling Price requires a separate Effective Permission.
- the default grant for below-minimum selling is SYSTEM_ADMIN only; an explicit User Override may change the effective result.
- changing Price List/Account reprices Automatic lines only; Manual lines stay Manual.
- sales lines preserve price source as PRICE_LIST/AUTOMATIC versus MANUAL.
- sensitive price use is Audited.
- the frozen Index Catalog is authoritative.

The physical Schema Plan defines Branch and Customer default linkage directly, but does not define a company-level default Price List column/entity. 07.05 therefore implements the explicit Master Plan boundary of Branch/Customer defaults and does not bury a new business reference inside generic JSON settings.

The Baseline does not provide a complete role-default matrix for the manual-price permission. Per Phase 05.03, module-specific permissions are introduced when their module contract is implemented, but undocumented role grants must not be invented. Therefore:

- `sales.price.manual_edit` is created as a distinct permission with no role default seeded by 07.05; missing Role Default fails closed and normal ALLOW/DENY User Overrides remain available.
- `sales.price.below_minimum` is created as a distinct permission; canonical SYSTEM_ADMIN is seeded Allow and the other six canonical roles are seeded Deny only when no row exists, preserving later configured role-default changes.

## Current-state classification

| Area | Classification | 07.05 decision |
|---|---|---|
| `price_lists` shape | موجود ومتوافق | reuse |
| `price_list_items` shape | موجود ومتوافق | reuse |
| composite PK PriceList+Variant+ProductUnit | موجود ومتوافق | final duplicate identity |
| nonnegative price CHECK | موجود ومتوافق | reuse |
| `product_variants.minimum_selling_price` + CHECK | موجود ومتوافق | reuse |
| Branch default FK | موجود ومتوافق | reuse |
| Customer default FK | موجود ومتوافق | reuse |
| frozen pricing index | موجود ومتوافق | no index change |
| Backend Price List master-data service | غير موجود | create |
| Variant/ProductUnit same-Product pricing validation | غير موجود في Backend | create |
| sellable ProductUnit validation | غير موجود في Backend | create |
| active Price List default policy | غير موجود | create |
| Branch/Customer default resolution | غير موجود | create |
| pricing permission catalog/default | غير موجود | create |
| minimum-price permission policy | غير موجود | create |
| Sales line repricing on Account/List change | Sales phase | do not pull forward |
| actual below-minimum Sales Audit | Sales posting phase | policy now; actual-use Audit later |

## Database decision

No migration is required for 07.05.

Existing approved DDL already supplies:

- `pk_price_lists`.
- `pk_price_list_items(price_list_id, variant_id, product_unit_id)`.
- Price List / Variant / ProductUnit FKs.
- Branch and Customer default Price List FKs.
- `ck_price_list_items__price`.
- `ck_product_variants__minimum_selling_price`.
- frozen `ix_price_list_items__variant_id_price_list_id`.

The Baseline relational-safety rule allows context ownership to be enforced by DB constraint or equivalent supported Backend validation. The existing DDL does not add a dedicated PriceListItem Variant/ProductUnit same-Product constraint, so 07.05 validates that relationship in the canonical Backend command path without reopening the closed physical schema or frozen Index Catalog.

No new Index is added.

## Fixed-decimal rule

Money remains `numeric(18,4)` and is never parsed through JavaScript floating point.

07.05 accepts decimal strings, validates at most 14 integer digits + 4 fractional digits, and normalizes to four decimal places before persistence/comparison.

ProductUnit conversion remains `numeric(18,6)`.

## Minimum price across ProductUnits

The minimum is stored once per Variant while Price List prices are stored per ProductUnit. To keep one Variant floor consistent across Piece/Box/etc., policy comparison uses the approved ProductUnit conversion to Base Unit.

For a selected ProductUnit:

```text
effective sale-unit price / conversion_to_base < minimum_selling_price
```

is evaluated exactly without floating point by cross multiplication of fixed-scale integers.

VAT is not part of this comparison. The later Sales command must pass the effective selling price after line discount, matching the Baseline rule that discount may not push the effective price below the minimum without the same permission.

## Default resolution

For automatic pricing:

1. an explicit selected active Price List wins when supplied.
2. otherwise an active Customer default wins when the Customer has one.
3. otherwise the active Branch default is used.
4. if no default exists, return a stable business rejection.
5. if the selected/default Price List has no exact Variant+ProductUnit item, return a stable missing-price rejection.

The returned source is always `PRICE_LIST`; a later Sales line changed manually must carry `MANUAL`.

## Active lifecycle

Price Lists are not hard-deleted by 07.05.

- creating a Price List makes it active.
- an inactive Price List cannot be assigned as a Branch/Customer default or resolved for a new automatic price.
- a Price List currently referenced as a Branch/Customer default cannot be deactivated until those defaults are changed/cleared.
- historical document snapshots remain outside this master-data lifecycle.

## Permission policy

Technical keys introduced by this module:

- `sales.price.manual_edit`
- `sales.price.below_minimum`

Authorization is checked inside the same READ COMMITTED transaction with Branch Scope and the existing Effective Permission precedence:

```text
Role Default -> User ALLOW/DENY Override -> Effective Permission
```

Rules:

- `PRICE_LIST` source at/above the floor needs no manual-price permission.
- `MANUAL` source always requires `sales.price.manual_edit`.
- any effective price below the floor, Automatic or Manual, additionally requires `sales.price.below_minimum`.
- if no minimum is configured, below-minimum permission is not consulted.
- a DENY User Override defeats SYSTEM_ADMIN's default below-minimum Allow, as required by the global permission model.

## Backend implementation

Add `PriceListService` with:

- `ensurePricingPermissions()`.
- `createPriceList()`.
- `setPriceListActive()`.
- `setPriceListItem()`.
- `setBranchDefaultPriceList()`.
- `setCustomerDefaultPriceList()`.
- `setMinimumSellingPrice()`.
- `resolveAutomaticPrice()`.
- `authorizeEffectiveSalePrice()`.

Master-data changes are Audit-recorded in the same transaction.

`authorizeEffectiveSalePrice()` proves permission policy only. It intentionally does not claim that a Sale was posted. When Sales posting is implemented, actual sensitive below-minimum/manual use must be included in that document's Audit/Posting transaction.

## Required tests

- create more than one Price List with no artificial count limit.
- one exact price per PriceList+Variant+ProductUnit.
- price persists as numeric(18,4) canonical text.
- same Variant can have distinct prices for base and alternate sellable units.
- cross-Product Variant/ProductUnit pricing is rejected.
- non-sellable ProductUnit pricing is rejected.
- Branch default works.
- Customer default overrides Branch default.
- explicitly selected Price List overrides both defaults.
- inactive Price List cannot become a default.
- a Price List currently used as a Branch/Customer default cannot be deactivated.
- pricing permission catalog is idempotent.
- below-minimum default role grants are SYSTEM_ADMIN only.
- manual-price permission has no invented role default.
- Manual price is rejected without manual permission.
- User ALLOW override enables manual price.
- below-minimum sale is rejected without below-minimum permission.
- SYSTEM_ADMIN default can authorize below-minimum sale.
- User ALLOW override can authorize below-minimum sale for another role.
- User DENY override defeats SYSTEM_ADMIN default.
- alternate-unit minimum comparison uses conversion_to_base exactly.
- null minimum removes the floor.
- pricing master-data changes are Audited.
- frozen Price List index inventory remains unchanged.
- migration history remains through `0023`; no 07.05 migration.
- 07.01-07.04 regressions remain green.
- Full CI passes on the same implementation SHA.

## Gate 07 ownership

07.05 owns the remaining Gate 07 item:

- minimum price permission tests.

Gate 07 cannot close until this implementation passes Full CI on the same SHA and the final documentation SHA is validated.

## Explicit exclusions

- no Sales Invoice/Order/Quote command cutover.
- no automatic repricing of existing Sales lines yet; the Product pricing source/default contract is prepared for the Sales phase.
- no Sales posting or price-override Audit event claiming an actual sale.
- no 07.06 Reorder Levels.
- no Inventory/Purchasing posting.
- no Frontend/Convex cutover.
- no dual write.
- no `main` merge.
- no Convex Production change.
- no migration.
- no index addition.

## Next action

Implement and validate 07.05 only. Do not start 07.06 until 07.05 is CLOSED by the required same-SHA gates.
