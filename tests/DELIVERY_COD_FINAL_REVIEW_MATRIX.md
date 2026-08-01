# Delivery/COD UAT Final Review Matrix

| ID | Area | Acceptance rule |
| --- | --- | --- |
| UAT-FINAL-01 | Delivery list | First-page loading, empty branch, loading-more, and exhausted states are visually distinct. |
| UAT-FINAL-02 | Settlements | Settlement loading, empty, and pagination states are visually distinct. |
| UAT-FINAL-03 | Record details | Every visible delivery can open a branch-protected read-only details modal using `deliveries.get`. |
| UAT-FINAL-04 | Success feedback | Each mutation reports the specific operation completed rather than a generic success message. |
| UAT-FINAL-05 | Printing | All server-owned strings are HTML-escaped before `document.write`; the print window has no opener reference. |
| UAT-FINAL-06 | Modal data | Ready orders, eligible accounts, destinations, and unsettled COD rows expose loading and empty feedback. |
| UAT-FINAL-07 | Read-only safety | Details mode never renders or invokes the mutation submit action. |
