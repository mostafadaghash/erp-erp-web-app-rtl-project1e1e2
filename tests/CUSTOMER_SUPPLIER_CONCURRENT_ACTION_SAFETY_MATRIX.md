# Customers/Suppliers Concurrent Action Safety Matrix

| ID | Scenario | Automated expectation | Manual follow-up |
| --- | --- | --- | --- |
| CSA-01 | Double-click customer create/update submit | Shared contact modal accepts only the first submit before the saving cycle completes | Repeat with mouse double-click and Enter + click under throttled network |
| CSA-02 | Double-click supplier create/update submit | Same synchronous submit lock protects supplier forms | Verify one success toast and one resulting write |
| CSA-03 | Retry identical customer update | Backend returns before patching or writing a duplicate audit record | Inspect audit log after retrying the same edit |
| CSA-04 | Retry identical supplier update | Backend returns before patching or writing a duplicate audit record | Inspect audit log after retrying the same edit |
| CSA-05 | Retry customer disable/reactivate request | Backend treats the already-applied state as success without another audit entry | Retry the request from a second tab |
| CSA-06 | Retry supplier disable/reactivate request | Same idempotent state guard applies to suppliers | Retry the request from a second tab |
| CSA-07 | Concurrent duplicate create | Existing normalized phone uniqueness remains the server-side duplicate barrier | Submit the same customer in one branch and the same supplier globally from two tabs |
| CSA-08 | Error and retry | Submit lock releases after the saving state returns to false | Force a duplicate-phone error, correct the value, and submit again |

## Out of scope

- Schema changes
- Journal or ledger posting changes
- New request-id storage
- Cross-device distributed locks
- Customer/supplier ownership changes
