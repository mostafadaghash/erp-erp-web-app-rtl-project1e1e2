# COGS and sales-return executable coverage matrix

All backend rows below execute against `convex-test`; no pure rule or source-regression check is counted as Convex integration.

| Scenario | Executable test |
|---|---|
| COGS-01 | `COGS-01 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-02 | `COGS-02 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-03 | `COGS-03 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-04 | `COGS-04 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-05 | `COGS-05 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-06 | `COGS-06 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-07 | `COGS-07 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-08 | `COGS-08 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-09 | `COGS-09 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-10 | `COGS-10 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-11 | `COGS-11 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-12 | `COGS-12 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-13 | `COGS-13 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-14 | `COGS-14 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-15 | `COGS-15 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-16 | `COGS-16 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-17 | `COGS-17 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-18 | `COGS-18 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-19 | `COGS-19 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-20 | `COGS-20 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-21 | `COGS-21 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-22 | `COGS-22 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-23 | `COGS-23 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-24 | `COGS-24 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-25 | `COGS-25 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-26 | `COGS-26 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-27 | `COGS-27 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-28 | `COGS-28 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-29 | `COGS-29 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-30 | `COGS-30 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-31 | `COGS-31 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-32 | `COGS-32 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-33 | `COGS-33 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-34 | `COGS-34 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-35 | `COGS-35 …` in `cogsSalesReturnsIntegration.test.ts` |
| COGS-36 | `COGS-36 …` in `cogsSalesReturnsIntegration.test.ts` |
| Full rounded return | `COGS-22A actual cumulative full return equals invoice net despite rounding` |
| Reversal without cash and retry | `COGS-35A reversal without cash is atomic and idempotent` |
| Cash reversal relationships | `COGS-35B cash-refund reversal links both financial transactions` |

Pure rules: `PURE-01`–`PURE-02` in `cogsSalesReturnsRules.test.ts`. UI regressions: `UI-01`–`UI-09` in `cogsSalesReturnsUiRegression.test.ts`.
