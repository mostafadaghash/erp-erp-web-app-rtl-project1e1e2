# Export Coverage Matrix

| ID | Test name | Evidence |
|---|---|---|
| EXP-01 | EXP-01 export coverage matrix is explicit and non-placeholder | This matrix maps the completed export controls. |
| EXP-02 | EXP-02 CSV exports must neutralize formula prefixes | `dataExportGuard.test.ts` verifies formula-prefix neutralization, quoting, and UTF-8 BOM. |
| EXP-03 | EXP-03 backend export requires export_data and dataset view permissions | `dataExportIntegration.test.ts` rejects missing export and source-view permissions. |
| EXP-04 | EXP-04 non-admin export is isolated to the assigned branch | Executable integration coverage proves cross-branch records are excluded. |
| EXP-05 | EXP-05 every export is recorded in the immutable audit log | The export mutation records dataset, scope, row count, and truncation without secrets. |
| EXP-06 | EXP-06 exports are bounded and disclose truncation | Each dataset reads at most 5,001 rows, returns 5,000, and reports `truncated`. |
| EXP-07 | EXP-07 export DTO excludes authentication and request internals | Only explicit flat operational columns are returned; auth/session/request fields are absent. |
| EXP-08 | EXP-08 export navigation is permission-gated and accessible | The route requires `export_data` and active sidebar items expose `aria-current="page"`. |
