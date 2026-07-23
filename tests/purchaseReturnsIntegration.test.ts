import test from "node:test";import assert from "node:assert/strict";import schema from "../convex/schema.ts";
test("PRT-INTEGRATION-SCHEMA purchase returns use a permanent indexed Convex table",()=>{const json=JSON.stringify(schema);assert.match(json,/purchaseReturns/);assert.match(json,/by_return_number/);assert.match(json,/by_purchase_receipt/)});
