# Customers / Suppliers Final UAT Review

## Automated acceptance

| ID | Scenario | Expected result |
| --- | --- | --- |
| CSF-01 | Open the ledger of a disabled customer | The customer remains selectable and historical entries load for the correct branch. |
| CSF-02 | Review the customer selector | Disabled customers are visibly labelled instead of silently disappearing. |
| CSF-03 | Open the ledger of a disabled supplier | Historical supplier entries remain available. |
| CSF-04 | Review a supplier ledger entry linked to an external invoice | The external supplier invoice number is shown. |
| CSF-05 | Review a reversed supplier ledger entry | Reversal date and reason are shown. |
| CSF-06 | Load the supplier page on a slow connection | Search remains disabled until the supplier list is ready. |

## Manual UAT still required

- Open one disabled customer from the customer cards and verify its complete historical ledger and statement printing.
- Compare the same supplier across two branches and confirm balances and ledger entries remain isolated.
- Verify Arabic wrapping for long reversal reasons and external invoice numbers on mobile widths.
- Exercise customer statement printing for active and disabled customers.
- Verify keyboard focus returns to the triggering control after closing customer, supplier, and supplier-ledger dialogs.
