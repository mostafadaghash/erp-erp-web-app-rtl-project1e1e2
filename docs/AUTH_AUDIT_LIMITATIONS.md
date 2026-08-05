# Auth Audit Limitations

Convex Auth in this repository currently exposes trusted server-side profile creation/update code through `convex/auth.ts` and administrative employee/invitation mutations through `convex/employees.ts`. The repository does not currently expose a trusted provider-level server hook for login success, logout, or login failure session events.

Because those events cannot be proven from a server-controlled provider callback in the current codebase, this phase must not add a client-callable mutation that can fabricate `login_success`, `logout`, or `login_failure` audit rows. The auditable auth coverage remains limited to server-side user/profile creation or invite claiming and administrative employee/invitation changes.
