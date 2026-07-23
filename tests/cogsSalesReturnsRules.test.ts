import test from "node:test";
import assert from "node:assert/strict";
import { allocateProportionally, calculateInventoryChange, roundAverageCost } from "../shared/inventoryRules.ts";
test("PURE-01 weighted-average precision",()=>{const r=calculateInventoryChange(3,10,30,2,11.1111);assert.equal(r.averageCostAfter,roundAverageCost(52.22/5));});
test("PURE-02 allocation assigns rounding remainder",()=>assert.deepEqual(allocateProportionally(1,[1,1,1]),[.33,.33,.34]));
import { deriveInvoiceStatus } from "../shared/businessRules.ts";
test("PURE-03 invoice status preserves return semantics",()=>{assert.equal(deriveInvoiceStatus({netTotal:60,creditedTotal:30,paid:20,remaining:40}),"partial_return");assert.equal(deriveInvoiceStatus({netTotal:60,creditedTotal:30,paid:60,remaining:0}),"paid_returned_partial");assert.equal(deriveInvoiceStatus({netTotal:0,creditedTotal:90,paid:0,remaining:0}),"returned");});
