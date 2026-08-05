# Auth Audit Execution Matrix

| Scenario | Prepared data | Role/branch | Public API or Browser Flow | Actual result | Fields/tables checked | Literal test name | Status |
|---|---|---|---|---|---|---|---|
| AUTH-AUD-01 | Password auth success | active user / trusted branch | `auth.signIn` server action | one deduped `login_success` audit | `auditLogs.module/action/recordId` | `AUTH-AUD-01 login success is recorded by server action exactly once per dedupe key` | EXECUTABLE |
| AUTH-AUD-02 | Bad password | unauthenticated | `auth.signIn` server action | redacted `login_failure` with hash | `auditLogs.afterSnapshot` | `AUTH-AUD-02 failed login audit is redacted and contains no raw secret fields` | EXECUTABLE |
| AUTH-AUD-03 | Existing session | active user / trusted branch | `auth.signOut` server action | one deduped `logout` audit | `auditLogs.action` | `AUTH-AUD-03 logout is recorded from the server signOut action once` | EXECUTABLE |
| AUTH-AUD-04 | Disabled profile | inactive user / branch | backend auth helper | safe rejection | `userProfiles.isActive` | `AUTH-AUD-04 inactive users are rejected by backend auth helper` | EXECUTABLE |
| AUTH-AUD-05 | Valid invite | invited employee / branch | password create account | claim audit no token | `auditLogs.details` | `AUTH-AUD-05 invitation claim audit does not store raw tokens` | EXECUTABLE |
| AUTH-AUD-06 | Repeated callback | same principal/window | auth event mutation | no duplicate | `auditLogs.recordId` | `AUTH-AUD-06 retry dedupe prevents duplicate auth audit rows` | EXECUTABLE |
| AUTH-AUD-07 | Audit page | admin | `auditLogs.listPaginated` | no raw user id/token/email | DTO keys | `AUTH-AUD-07 audit DTO hides raw user id and auth secrets` | EXECUTABLE |
| AUTH-AUD-08 | Other branch logs | manager branch A | `auditLogs.listPaginated` | branch denied | `branchId` filter | `AUTH-AUD-08 audit reading is permission and branch isolated` | EXECUTABLE |
| AUTH-AUD-09 | Role/permission update | admin | employee mutations | target linked | `recordId`, snapshots | `AUTH-AUD-09 role permission and activity updates target employee records` | EXECUTABLE |
| AUTH-AUD-10 | Invalid invite | unauthenticated | password create account | no partial claim | `userProfiles.claimedAt` | `AUTH-AUD-10 rejected auth attempts do not write partial invitation claims` | EXECUTABLE |
