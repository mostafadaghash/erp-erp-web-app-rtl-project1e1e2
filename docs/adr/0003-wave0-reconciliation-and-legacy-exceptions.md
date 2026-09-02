# ADR-0003 — Wave 0 Reconciliation and Legacy Exceptions

**Status:** Accepted  
**Date:** 2026-09-02

## Context

The current deployment evolved over time. Some records may predate newer inventory movements, subledgers or GL bridges. A reconciliation process must distinguish a mathematical inconsistency from incomplete historical coverage without hiding either condition.

## Decision

1. Wave 0 reconciliation is **read-only**. Reconciliation tooling must not patch business data.
2. The exit target is **zero unexplained difference** for the selected current/staging reconciliation scope.
3. Every run must record provenance: repository SHA, dataset/snapshot ID/checksum, extraction time/scope and tool version.
4. Missing historical coverage is reported explicitly as a legacy exception; it is never guessed or normalized away.
5. Approved opening values are required when replay starts after the true historical beginning.
6. Reconciliation must fail closed for unexplained money/quantity differences.
7. A documented legacy exception must have a concrete classification, source records where available, owner/disposition and later migration treatment. Its existence does not authorize Wave 0 data repair.

## Standard classifications

- `UNEXPLAINED_DIFFERENCE`
- `LEGACY_OPENING_REQUIRED`
- `LEGACY_DOCUMENT_NOT_BRIDGED`
- `MISSING_REFERENCE`
- `ROUNDING_POLICY_MISMATCH`
- `SCOPE_DATA_INCOMPLETE`
- inventory-specific quantity/value/average-cost/chain/historical-cost mismatches

## Required evidence families

- GL journal and trial-balance controls.
- Customer and supplier subledger replay.
- Financial-account movement replay.
- Inventory quantity/value/MWA replay from approved openings.
- Historical sale COGS and sales-return cost trace.
- Reversal/idempotency samples.
- Source-document-to-ledger/GL control totals for protected business journeys.

## Exit implication

Committing the reconciliation pack is not equivalent to completing reconciliation. Wave 0 remains open until the normalized current/staging dataset is actually run and any exceptions are classified. The Golden Dataset proves the checker and expected business vectors; it does not prove production/staging data consistency.

## Rejected alternatives

- Mutating data inside a reconciliation script.
- Treating a missing ledger history as a zero opening.
- Ignoring small money differences without identifying the applicable rounding rule.
- Declaring Wave 0 complete because the deterministic fixture passes.
