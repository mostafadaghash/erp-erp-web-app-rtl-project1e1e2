import test from "node:test";import assert from "node:assert/strict";import{assertIsoDate,fromCents,normalizeRequestId,normalizeText,periodKeyOf,toCents}from"../convex/lib/generalLedgerRules.ts";
test("GL rules normalize stable text",()=>assert.equal(normalizeText("  قيد   يدوي "),"قيد يدوي"));
test("GL rules validate request identifiers",()=>{assert.equal(normalizeRequestId(" abc "),"abc");assert.throws(()=>normalizeRequestId(" "))});
test("GL rules validate real ISO dates",()=>{assert.equal(assertIsoDate("2026-07-28"),"2026-07-28");assert.throws(()=>assertIsoDate("2026-02-30"))});
test("GL rules derive monthly period",()=>assert.equal(periodKeyOf("2026-07-28"),"2026-07"));
test("GL rules use exact cents",()=>{assert.equal(toCents(10.25),1025);assert.equal(toCents(18.33),1833);assert.equal(fromCents(1025),10.25);for(const x of[-1,NaN,Infinity,.001,1.001])assert.throws(()=>toCents(x))});
test("GL rules canonicalize idempotent memo and descriptions",()=>{const submitted=[normalizeText("  قيد   نقدي  "),normalizeText("  تحصيل   نقدي  ")];const retried=[normalizeText("قيد نقدي"),normalizeText("تحصيل نقدي")];assert.deepEqual(submitted,retried)});
