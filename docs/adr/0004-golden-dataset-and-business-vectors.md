# ADR-0004 — Golden Dataset and Business Vectors

**Status:** Accepted  
**Date:** 2026-09-02

## Context

The current repository contains valuable integration tests, but many are coupled to Convex or source structure. Future architecture work needs a small technology-neutral business baseline without discarding those existing tests.

## Decision

1. Wave 0 establishes a deterministic normalized Golden Dataset plus executable business-vector manifest.
2. The Golden Dataset records explicit expected accounting/inventory numbers, including MWA and historical-cost behavior.
3. Golden vectors complement existing integration tests rather than replacing them.
4. Every Wave 0 vector marked `EXECUTABLE` must point to existing repository test files, while the normalized Golden Dataset has its own executable reconciliation test.
5. Expected financial/quantity values are treated as protected business behavior. They must not be changed inside an architecture refactor merely to make a new implementation pass.
6. If evidence proves a golden expectation wrong, change it separately with an explicit business rationale, affected posting/reconciliation analysis and an ADR/update where material.
7. Future-state journeys that depend on later Waves must be explicitly deferred rather than falsely marked as implemented.

## Initial numeric anchor

The primary inventory vector is:

- opening `10 @ 100` → value `1000`, average `100`,
- receipt `10 @ 120` → quantity `20`, value `2200`, MWA `110`,
- sale `2` → frozen COGS `220`,
- later receipt changes current average to `113`,
- return `1` from the original sale restores cost `110`, not current average `113`.

The normalized fixture also includes balanced GL, customer/supplier subledger replay and treasury replay.

## Deferred journeys

Wave 0 must not claim implementation of journeys requiring:

- true Tenant/Company architecture,
- Tax Engine / ETA eInvoice/eReceipt,
- Local Server / WAN-offline execution,
- later PostgreSQL/Inventory V2 architecture.

## Consequences

Later Application/Repository implementations can be exercised against the same logical vectors while the existing legacy integration suite remains parity evidence. This reduces the risk that architectural decoupling changes money or inventory behavior unintentionally.

## Rejected alternatives

- Copying implementation-specific Convex fixtures as the only golden specification.
- Replacing existing behavioral integration tests with source/regex guards.
- Marking future target journeys as passed before their Waves begin.
