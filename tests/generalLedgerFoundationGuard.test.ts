import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const integration=readFileSync("tests/generalLedgerFoundationIntegration.test.ts","utf8");
const matrix=readFileSync("tests/GENERAL_LEDGER_FOUNDATION_COVERAGE_MATRIX.md","utf8");
const api=readFileSync("convex/generalLedger.ts","utf8");
const helper=readFileSync("convex/lib/generalLedger.ts","utf8");
const schema=readFileSync("convex/schema.ts","utf8");

function bodies(source:string){
 const result=new Map<string,string>(); let at=0;
 while((at=source.indexOf('test("GLF-',at))>=0){const name=source.slice(at+6,source.indexOf('"',at+6));const arrow=source.indexOf('=>',at),open=source.indexOf('{',arrow);let depth=0,quote="",escaped=false,end=-1;
  for(let i=open;i<source.length;i++){const ch=source[i];if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote="";continue}if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue}if(ch==='{')depth++;if(ch==='}'&&--depth===0){end=i;break}}
  assert.notEqual(end,-1,`unbalanced ${name}`);result.set(name.slice(0,6),source.slice(open+1,end));at=end+1;
 } return result;
}
const glf=bodies(integration);
test("guard extracts forty balanced literal bodies",()=>assert.equal(glf.size,40));
test("guard matrix has forty executable non-pending rows",()=>{assert.equal((matrix.match(/^\| GLF-/gm)??[]).length,40);assert.equal((matrix.match(/EXECUTABLE/g)??[]).length,40);assert.doesNotMatch(matrix,/PENDING/)});
test("guard rejects placeholder generation and duplicate GLF-05..40 bodies",()=>{assert.doesNotMatch(integration,/Placeholder|exercise\(\)|case-|\.map\([^\n]*test|\.forEach\([^\n]*test/);const normalized=[...glf].filter(([id])=>id>="GLF-05").map(([,body])=>body.replace(/\s/g,""));assert.equal(new Set(normalized).size,36);for(const [id,body] of glf)if(id>="GLF-04")assert.match(body,/api\.generalLedger\.(?!initialize|status)|await post\(/)});
const mapping:Record<string,RegExp[]>={
 "GLF-05":[/createAccount/,/assert\.rejects/],"GLF-09":[/confirmOpening/,/1000/,/300/,/500/,/800/],"GLF-13":[/postManualJournal/,/Entries/,/Lines/,/Balances/],
 "GLF-18":[/JRN-2026-00007/,/00009/,/00010/,/Promise\.all/,/2027/,/documentCounters/],"GLF-24":[/reverseJournal/,/reversalEntryId/,/Balances/],"GLF-25":[/Retry/,/reason|السبب/,/reversalDate/],
 "GLF-29":[/second/,/entriesPaginated/,/accountLedgerPaginated/,/trialBalance/],"GLF-30":[/second/,/entriesPaginated/,/branchId/],"GLF-33":[/continueCursor/,/balanceBeforePage/,/runningBalance/],
 "GLF-34":[/1000/,/400/,/600/,/200/,/50/,/1150/,/1200/],"GLF-36":[/allowlist/,/entryDetails/,/entryForPrint/],"GLF-37":[/ledger/,/trial/,/redaction/],
 "GLF-38":[/by_user/,/by_token/,/مستخدم غير معروف/],"GLF-39":[/financialAccounts/,/payments/,/snapshot/],"GLF-40":[/failure after writes/,/Counter/,/Entry/,/Lines/,/Balances/,/Audit/]
};
test("guard enforces scenario-specific executable evidence",()=>{for(const[id,patterns]of Object.entries(mapping)){const body=glf.get(id)??"";for(const pattern of patterns)assert.match(body,pattern,`${id}: ${pattern}`)}});
test("guard forbids destructive or operational GL writes",()=>{assert.doesNotMatch(api+helper,/ctx\.db\.delete/);assert.doesNotMatch(api,/export const (update|delete)Journal/);assert.doesNotMatch(api,/db\.(insert|patch)\("generalLedger(Account|Period)Balances"/);assert.match(helper,/generalLedgerAccountBalances/)});
test("guard requires indexed period and profile reads",()=>{assert.doesNotMatch(api,/generalLedgerPeriodBalances"\)\.withIndex\("by_branch_period"\)\.filter/);assert.match(schema,/index\("by_period",\["periodKey"\]\)/);assert.doesNotMatch(api,/query\("userProfiles"\)\.filter|query\("userProfiles"\)\.collect/)});
test("guard requires historical balance and reversal ordering",()=>{assert.doesNotMatch(api,/let running=0/);assert.doesNotMatch(api,/openingDebit:0,openingCredit:0/);assert.ok(api.indexOf('const existing=await ctx.db.query("journalEntries").withIndex("by_original"')<api.indexOf('if(original.status!=="posted")'))});
test("guard requires configured cutover and disabled operational posting",()=>{assert.doesNotMatch(helper,/date < "2020-01-01"/);assert.match(helper,/settings\.cutoverDate/);assert.match(api,/operationalPostingEnabled:false/);assert.doesNotMatch(api,/operationalPostingEnabled:true/)});
