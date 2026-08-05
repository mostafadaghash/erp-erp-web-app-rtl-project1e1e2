# Browser Print Acceptance Matrix

| Scenario | Prepared data | Role/branch | Public API or Browser Flow | Actual result | Fields/tables checked | Literal test name | Status |
|---|---|---|---|---|---|---|---|
| A4 invoice RTL | Protected invoice DTO | `print_invoices` / branch | Chromium PDF flow | PDF artifact exists | invoice DTO totals/items | `PRH-GUARD-02 browser print acceptance artifacts are real files` | EXECUTABLE |
| Thermal receipt 80mm | Protected invoice/receipt DTO | `print_invoices` / branch | Chromium PDF flow | thermal PDF artifact exists | width/screenshots | `PRH-GUARD-02 browser print acceptance artifacts are real files` | EXECUTABLE |
