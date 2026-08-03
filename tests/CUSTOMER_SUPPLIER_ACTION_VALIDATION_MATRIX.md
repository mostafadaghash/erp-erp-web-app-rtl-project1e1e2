# Customers/Suppliers Action Validation Matrix

## Automated acceptance coverage

| ID | Area | Scenario | Expected result |
| --- | --- | --- | --- |
| CSA-01 | Shared form | Optional email, address, and notes are cleared during edit | The mutation payload carries explicit empty strings; backend normalization converts them to missing fields and `db.patch` removes stored values |
| CSA-02 | Create/update | Customer and supplier forms submit the same normalized payload used for display | Arabic digits, whitespace, email casing, and optional text are normalized once before mutation |
| CSA-03 | Duplicate protection | Create or edit with an existing phone number | Customer duplication is rejected within the branch; supplier duplication is rejected globally |
| CSA-04 | Customer ownership | Create/edit/activate a customer outside the user's branch | Backend branch resolution and access checks reject the action |
| CSA-05 | Supplier ownership | Create/edit/activate a supplier | Supplier master data remains global and is protected by module permissions |
| CSA-06 | Lifecycle | Disable or reactivate a customer or supplier | The UI confirms the action, backend checks the dedicated permission, state is patched, and an audit action is written |
| CSA-07 | Deletion | Call legacy remove mutations | Permanent deletion is rejected; operators must use disable/reactivate |
| CSA-08 | Supplier ledger | Open ledger for a supplier in a selected branch | Permission and branch access are required; entries are cursor-paginated and historical entries remain readable |

## Manual UAT follow-up

1. Create a customer with Arabic phone digits and whitespace; confirm the normalized value is shown.
2. Edit that customer and clear email, address, and notes; reopen the form and confirm all three remain empty.
3. Repeat the same clearing flow for a supplier.
4. Attempt duplicate customer phones in the same branch and in different branches; confirm only same-branch duplication is blocked.
5. Attempt a duplicate supplier phone; confirm it is blocked globally.
6. Disable and reactivate records while observing confirmation text, disabled button state, toast errors, and audit logs.
7. Confirm disabled records remain visible for historical lookup but are absent from new-transaction pickers.
8. Open a supplier ledger in two branches and verify balances and entries do not cross branch boundaries.
9. Exercise ledger first load, empty state, load more, and exhausted state.

## Deliberately unchanged

- Customer records remain branch-owned.
- Supplier master records remain global.
- Disabling does not erase historical documents or ledger entries.
- No finance, journal, schema, or posting behavior is changed by this slice.
