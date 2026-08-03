# Customers and Suppliers UAT — Branch and Ledger State

| Area | Acceptance rule | Automated guard |
| --- | --- | --- |
| Customer summaries | Customer and debt totals never show zero merely because queries are still loading | CSU-01 |
| Customer search | Search is unavailable until the selected branch customer list is loaded | CSU-02 |
| Customer branch access | A user without a working branch or branch-selection permission sees an explicit blocked state | CSU-03 |
| Supplier ownership | Supplier master data remains global; only balances and ledgers are branch-scoped | CSU-04 |
| Customer-ledger branch | Admin/accountant opening the ledger directly must choose a branch explicitly | CSU-05 |
| Ledger context reset | Branch changes clear selected customer, pending print, opening values, and retry request ID | CSU-06 |
| Customer picker | Loading and true-empty active-customer states are distinct | CSU-07 |
| Customer ledger | First-page loading, loading-more, and exhausted-empty states are distinct | CSU-08 |
| Opening balance | Non-finite, negative, or over-precision opening amounts are blocked before mutation | CSU-09 |
| Statement printing | Print preparation is cancellable and does not share mutation busy state | CSU-10 |
| Type safety | No `as any` or TypeScript-ignore escape is introduced | CSU-11 |

## Manual UAT follow-up

- Confirm customer statement printing on supported browsers and paper sizes.
- Verify branch switching while network latency is artificially increased.
- Confirm supplier ledger values against purchase receipts, payments, returns, and reversals.
- Test users with customer access but without branch-management permission.
- Verify keyboard focus and screen-reader announcements in customer and supplier dialogs.
