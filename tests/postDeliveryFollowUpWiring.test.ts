import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("audited delivery events schedule the post-delivery worker", () => {
  const auth = read("convex/lib/auth.ts");
  assert.match(auth, /isPostDeliveryAuditTrigger/);
  assert.match(auth, /internal\.postDeliveryFollowUps\.processAuditEvent/);
  assert.match(auth, /ctx\.scheduler\.runAfter/);
});

test("automatic follow-up uses a stable creation key and customer-service assignee preference", () => {
  const worker = read("convex/postDeliveryFollowUps.ts");
  assert.match(worker, /buildPostDeliveryFollowUpCreationKey/);
  assert.match(worker, /withIndex\("by_creation_key"/);
  assert.match(worker, /profile\.role === "customer_service"/);
  assert.match(worker, /POST_DELIVERY_FOLLOW_UP_TYPE/);
});

test("settings persist and expose a configurable post-delivery delay to admins", () => {
  const schema = read("convex/schema.ts");
  const settings = read("convex/settings.ts");
  const page = read("src/components/SettingsPage.tsx");
  assert.match(schema, /postDeliveryFollowUpDays: v\.optional\(v\.number\(\)\)/);
  assert.match(settings, /postDeliveryFollowUpDays: v\.optional\(v\.number\(\)\)/);
  assert.match(page, /data-testid="post-delivery-follow-up-days"/);
});

test("existing business transitions emit the exact delivery audit events", () => {
  const orders = read("convex/orders.ts");
  const repairs = read("convex/repairs.ts");
  const deliveries = read("convex/deliveries.ts");
  assert.match(orders, /action: "update_status", module: "orders"/);
  assert.match(repairs, /action: "update_status"[\s\S]*module: "repairs"/);
  assert.match(deliveries, /action:"confirm",module:"deliveries"/);
  assert.match(deliveries, /after:\{status:"delivered"/);
});
