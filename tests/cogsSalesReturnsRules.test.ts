import test from "node:test";
import assert from "node:assert/strict";
import { allocateProportionally, calculateInventoryChange, roundAverageCost } from "../shared/inventoryRules.ts";
test("PURE-01 weighted-average precision",()=>{const r=calculateInventoryChange(3,10,30,2,11.1111);assert.equal(r.averageCostAfter,roundAverageCost(52.22/5));});
test("PURE-02 allocation assigns rounding remainder",()=>assert.deepEqual(allocateProportionally(1,[1,1,1]),[.33,.33,.34]));
