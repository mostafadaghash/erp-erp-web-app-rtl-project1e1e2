# Repairs Final UAT Review Matrix

| Area | Acceptance rule | Automated guard |
| --- | --- | --- |
| Repair list | Loading, true-empty branch, and filtered no-results are distinct | RFU-01 |
| Status history | First-page loading, loading-more, exhausted-empty, and loaded rows are distinct | RFU-02 |
| Status history details | Diagnosis, quality-check notes, reason, technician, employee, and date remain visible | RFU-03 |
| Branch isolation | Changing branch closes every modal or print surface tied to the previous branch | RFU-04 |
| Tracking links | Copy and rotation await the clipboard result, prevent duplicate actions, and report partial success honestly | RFU-05 |
| Repair printing | A second print request cannot start while the print DTO is loading | RFU-06 |
| Printed audit trail | Repair printout includes the status history already supplied by `repairForPrint` | RFU-07 |
| Success feedback | Status-transition success identifies the repair number and resulting status | RFU-08 |
| Type safety | No `as any` or TypeScript-ignore escape is introduced | RFU-09 |

## Manual UAT follow-up

- Verify Arabic RTL print layout on the production-supported browsers and paper sizes.
- Confirm browser clipboard-denial messages on HTTP, private mode, and restricted devices.
- Verify WhatsApp deep links on at least one Android and one iOS device.
- Confirm modal focus trapping and keyboard navigation with the application accessibility checklist.
