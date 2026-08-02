# Customers and Suppliers UAT — Branch State Matrix

| Area | Acceptance rule | Automated guard |
| --- | --- | --- |
| Customer branch isolation | An unpinned admin must choose one branch before customer data is queried | CUAT-01, CUAT-02 |
| Customer balances | Customer cards and ledger balances use the same effective branch | CUAT-02 |
| Customer creation | New customers are written to the branch currently visible in the UI | CUAT-03 |
| Customer ledger navigation | The customer ledger opens with the card's visible branch scope | CUAT-03 |
| Customer branch change | Create/edit state from the previous branch is discarded | CUAT-04 |
| Customer states | Branch selection, loading, true empty, and filtered empty are distinct | CUAT-05 |
| Supplier ledger branch | An unpinned admin must explicitly choose the supplier balance branch | SUAT-01, SUAT-02 |
| Supplier branch change | The previously open supplier ledger closes before changing branch | SUAT-03 |
| Supplier balance loading | Balance values and ledger actions are hidden until the scoped query loads | SUAT-04 |
| Supplier list states | Loading, true empty, and filtered empty are distinct | SUAT-05 |
| Type safety | No `as any` or TypeScript-ignore escape is introduced | Contacts guard |

## Deliberate scope

- Supplier master records remain global because current purchasing workflows reference a shared supplier directory.
- Supplier balances and ledger entries remain branch-scoped.
- Contact field validation and action-level submit reasons are a separate UAT slice.
- No finance posting, ledger calculation, schema, permission-definition, or audit-log behavior changes in this slice.
