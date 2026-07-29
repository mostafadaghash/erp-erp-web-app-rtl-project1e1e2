import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const integration=readFileSync("tests/generalLedgerFoundationIntegration.test.ts","utf8");
const matrix=readFileSync("tests/GENERAL_LEDGER_FOUNDATION_COVERAGE_MATRIX.md","utf8");
const api=readFileSync("convex/generalLedger.ts","utf8");
const helper=readFileSync("convex/lib/generalLedger.ts","utf8");
const schema=readFileSync("convex/schema.ts","utf8");

function testBodies(source:string){
 const result=new Map<string,string>();let cursor=0;
 while((cursor=source.indexOf('test("GLF-',cursor))>=0){
  const nameStart=cursor+6,nameEnd=source.indexOf('"',nameStart),name=source.slice(nameStart,nameEnd),arrow=source.indexOf('=>',nameEnd),open=source.indexOf('{',arrow);
  let depth=0,quote:""|'"'|"'"|'`'="",escaped=false,lineComment=false,blockComment=false,end=-1;
  for(let i=open;i<source.length;i++){const ch=source[i],next=source[i+1];if(lineComment){if(ch==='\n')lineComment=false;continue}if(blockComment){if(ch==='*'&&next==='/'){blockComment=false;i++}continue}if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote="";continue}if(ch==='/'&&next==='/'){lineComment=true;i++;continue}if(ch==='/'&&next==='*'){blockComment=true;i++;continue}if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue}if(ch==='{')depth++;else if(ch==='}'&&--depth===0){end=i;break}}
  assert.notEqual(end,-1,`unbalanced ${name}`);result.set(name.slice(0,6),source.slice(open+1,end));cursor=end+1;
 }
 return result;
}
function executableCode(body:string){return body.replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/[^\n]*/g,"").replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g,"STRING")}
const glf=testBodies(integration);
test("guard extracts forty balanced literal test bodies",()=>{assert.equal(glf.size,40);assert.equal((integration.match(/test\("GLF-/g)??[]).length,40)});
test("guard enforces forty executable acceptance rows",()=>{const rows=matrix.match(/^\| GLF-\d{2} .*$/gm)??[];assert.equal(rows.length,40);assert.equal(rows.filter(x=>/\| EXECUTABLE \|$/.test(x)).length,40);assert.doesNotMatch(matrix,/PENDING_HARDENING/);assert.deepEqual(rows.map(row=>row.match(/GLF-\d{2}/)?.[0]),Array.from({length:40},(_,i)=>`GLF-${String(i+1).padStart(2,"0")}`))});
test("guard rejects marker tricks generation forbidden casts and duplicate bodies",()=>{assert.doesNotMatch(integration,/Placeholder|exercise\(\)|case-|\.map\([^\n]*test|\.forEach\([^\n]*test|\bas\s+any\b|@ts-ign[o]re/);const normalized=[...glf.values()].map(body=>executableCode(body).replace(/\s/g,""));assert.equal(new Set(normalized).size,40)});
const mapping:Record<string,RegExp[]>={
 "GLF-05":[/mutation\(api\.generalLedger\.createAccount/g,/assert\.rejects|rejectUnchanged/,/query\(api\.generalLedger\.chart/,/auditLogs/],
 "GLF-06":[/createAccount/g,/posting/,/inactive/,/normalSide/,/isContra/,/snapshot|rejectUnchanged/],
 "GLF-07":[/postManualJournal/,/deactivateAccount/,/entryDetails/,/assert\.rejects/],
 "GLF-08":[/nonposting/,/inactive/,/journalEntries/,/journalLines/,/generalLedgerAccountBalances/,/generalLedgerPeriodBalances/,/documentCounters/,/auditLogs/,/payments/],
 "GLF-09":[/confirmOpening/,/1000/,/300/,/500/,/800/,/1300/,/documentCounters/,/generalLedgerPeriodBalances/,/auditLogs/],
 "GLF-10":[/confirmOpening/g,/isZeroOpening/,/journalEntries/,/journalLines/,/generalLedgerAccountBalances/,/generalLedgerPeriodBalances/,/documentCounters/,/retry/],
 "GLF-11":[/retry/g,/openingDate/,/new-request/,/historical manual/,/snapshot/],
 "GLF-12":[/2026-01-10/g,/2026-02-30/,/10\/01\/2026/,/2026-01-09/g,/postManualJournal/,/periodKey/],
 "GLF-13":[/postManualJournal/,/250/g,/generalLedgerAccountBalances/,/generalLedgerPeriodBalances/,/documentCounters/,/auditLogs/],
 "GLF-14":[/100/,/99\.99/,/rejectUnchanged/],
 "GLF-15":[/1\.001/,/negative/,/zero/,/NaN/,/Infinity/,/both-sides/,/one-line/,/rejectUnchanged/],
 "GLF-16":[/100/,/50/,/150/,/db\.patch/,/entryDetails/,/entryForPrint/,/accountCode/,/normalSide/],
 "GLF-17":[/JRN-2026-00001/g,/by_number/,/journal:2026/,/nextValue/,/retry/],
 "GLF-18":[/await ready\(\)/g,/00007/,/00008/,/00009/,/00010/,/Promise\.all/,/2025/,/2026/,/2027/,/documentCounters/],
 "GLF-19":[/normalized-retry/,/retry/,/journalLines/,/generalLedgerAccountBalances/,/generalLedgerPeriodBalances/,/documentCounters/,/auditLogs/],
 "GLF-20":[/debit:101/,/2026-01-02/,/accountId:receivable/,/changed memo/,/changed description/,/rejectUnchanged/],
 "GLF-21":[/closePeriod/,/post\(e,"closed-period"/,/snapshot\(e\)/g,/assert\.rejects/,/assert\.deepEqual/],
 "GLF-22":[/post\(e,"close-100"/,/post\(e,"close-40"/,/closePeriod/g,/generalLedgerPeriodBalances/,/auditLogs/,/assert\.deepEqual/],
 "GLF-23":[/addUser\(e,"accountant","accountant"/,/addUser\(e,"manager","manager"/,/reopenPeriod/g,/postAt/,/rejectUnchanged/,/snapshot/],
 "GLF-24":[/120/g,/reverseJournal/,/JRN-2026-00001/,/JRN-2026-00002/,/generalLedgerDailyBalances/,/payments/],
 "GLF-25":[/reverseJournal/g,/reason:"سبب موحد"/,/reversalDate:"2026-01-03"/,/requestId:"reverse-new"/,/snapshot\(e\)/g,/assert\.deepEqual/],
 "GLF-26":[/closePeriod/,/createOrOpenPeriod/,/reverseJournal/,/trialBalance/g,/periods/,/openingDebit/,/periodCredit/],
 "GLF-27":[/closePeriod/,/reverseJournal/g,/snapshot/,/createOrOpenPeriod/,/originalEntryId/,/status/],
 "GLF-28":[/entryDetails/,/entryForPrint/,/reverseJournal/g,/invalid-empty/,/reverse-reversal/,/snapshot/],
 "GLF-29":[/addBranch/,/addUser\(e,"manager","manager"/,/postAt/g,/entriesPaginated/,/accountLedgerPaginated/,/trialBalance/,/entryDetails/,/entryForPrint/,/snapshot/],
 "GLF-30":[/addBranch/,/addUser\(e,"accountant","accountant"/,/addUser\(e,"second-admin","admin"/,/postAt/g,/entriesPaginated/g,/accountLedgerPaginated/,/trialBalance/,/entryDetails/,/entryForPrint/],
 "GLF-31":[/viewer/,/sales/,/shipping/,/entriesPaginated/,/entryForPrint/,/postManualJournal/,/reverseJournal/,/closePeriod/,/reopenPeriod/,/snapshot/],
 "GLF-32":[/addBranch/,/postAt/g,/numItems:1/,/continueCursor/,/new Set/,/keys\(row\)/,/sort\(\)\.reverse/,/manager/,/adminOther/],
 "GLF-33":[/confirmOpening/,/1000/g,/ledger-plus-100/,/ledger-minus-30/,/ledger-plus-50/,/ledger-backdated-20/,/generalLedgerDailyBalances/,/db\.delete/,/numItems:1/,/openingBalance/,/creditLedger/],
 "GLF-34":[/confirmOpening/,/1000/g,/400/g,/600/g,/200/g,/50/g,/trialBalance/,/trialBalanceForPrint/,/openingDebit/,/periodDebit/,/closingDebit/,/1200/g],
 "GLF-35":[/1110/,/6200/,/2100/,/3200/,/4100/,/4190/,/postManualJournal/g,/accountLedgerPaginated/,/reverseJournal/g,/trialBalance/],
 "GLF-36":[/reverseJournal/,/entryDetails/g,/entryForPrint/g,/reversalEntryNumber/,/originalEntryNumber/,/lineKeys/,/viewer/,/assert\.rejects/],
 "GLF-37":[/accountLedgerPaginated/,/trialBalance/,/trialBalanceForPrint/,/keys\(ledger\)/,/trialKeys/,/snapshot\(e\)/g,/assert\.deepEqual/],
 "GLF-38":[/by_user/,/tokenIdentifier:"admin"/,/raw-missing-profile-id/,/مستخدم غير معروف/,/viewer/,/entryForPrint/g,/assert\.rejects/],
 "GLF-39":[/createAccount/,/reverseJournal/,/closePeriod/,/reopenPeriod/,/financialAccounts/,/customerBalances/,/supplierBalances/,/inventoryMovements/,/purchaseReceipts/,/supplierPayments/,/purchaseReturns/,/salesReturns/,/payments/],
 "GLF-40":[/duplicateSecondAccount/,/accountId:sales/,/failure on second balance/,/generalLedgerDailyBalances/g,/generalLedgerPeriodBalances/g,/generalLedgerAccountBalances/g,/documentCounters/,/auditLogs/,/payments/,/assert\.deepEqual/]
};
test("guard enforces runtime calls and assertions for GLF-05 through GLF-40",()=>{assert.deepEqual(Object.keys(mapping),Array.from({length:36},(_,i)=>`GLF-${String(i+5).padStart(2,"0")}`));for(let n=5;n<=40;n++){const id=`GLF-${String(n).padStart(2,"0")}`,body=glf.get(id)??"",code=executableCode(body);assert.match(code,/api\.generalLedger\.(?:initialize|status|chart|accountPicker|createAccount|deactivateAccount|createOrOpenPeriod|confirmOpening|postManualJournal|closePeriod|reopenPeriod|reverseJournal|periods|entriesPaginated|accountLedgerPaginated|trialBalance|trialBalanceForPrint|entryDetails|entryForPrint)/,`${id} public API`);assert.match(code,/assert\.(?:equal|deepEqual|ok|rejects|notEqual)|rejectUnchanged/,`${id} assertion`);for(const pattern of mapping[id]){if(pattern.global)assert.ok((body.match(pattern)??[]).length>=2,`${id}: ${pattern}`);else assert.match(body,pattern,`${id}: ${pattern}`)}}});
test("guard forbids destructive or operational writes",()=>{assert.doesNotMatch(api+helper,/ctx\.db\.delete/);assert.doesNotMatch(api,/db\.(insert|patch)\("payments"/);assert.doesNotMatch(api,/export const (update|delete)Journal/);assert.doesNotMatch(api,/db\.(insert|patch)\("generalLedger(Account|Period)Balances"/);assert.match(helper,/generalLedgerAccountBalances/)});
test("guard requires indexes history and disabled operational posting",()=>{assert.match(schema,/index\("by_period",\["periodKey"\]\)/);assert.doesNotMatch(helper,/date < "2020-01-01"/);assert.match(helper,/settings\.cutoverDate/);assert.match(api,/operationalPostingEnabled:false/);assert.doesNotMatch(api,/operationalPostingEnabled:true/)});
test("guard restores indexed period and profile lookup protections",()=>{assert.doesNotMatch(api,/by_branch_period[\s\S]{0,180}\.filter\(/);assert.doesNotMatch(api,/query\("userProfiles"\)[\s\S]{0,160}\.(?:collect|filter)\(/);assert.match(api,/userProfiles"\)\.withIndex\("by_user"/);assert.match(api,/userProfiles"\)\.withIndex\("by_token"/)});
test("guard restores historical running and trial balances",()=>{assert.doesNotMatch(api,/let\s+running\s*=\s*0/);assert.doesNotMatch(api,/openingDebit\s*:\s*0|openingCredit\s*:\s*0/);const lookup=api.indexOf('withIndex("by_original"'),status=api.indexOf('original.status');assert.ok(lookup>=0&&lookup<status)});
test("guard requires server cursor indexed account pagination with legacy compatibility",()=>{assert.doesNotMatch(api,/Number\([^)]*cursor|\boffset\b|range\.slice\s*\(/);assert.match(api,/by_account_branch_date_number_line/);assert.match(api,/\.paginate\(args\.paginationOpts\)/);assert.match(schema,/by_account_branch_date_number_line/);assert.match(schema,/by_account_branch_period/);assert.match(api,/generalLedgerPeriodBalances"\)\.withIndex\("by_account_branch_period"/);assert.match(api,/priorPartial/);assert.match(helper,/generalLedgerDailyBalances/);assert.match(glf.get("GLF-33")??"",/generalLedgerDailyBalances[\s\S]*db\.delete[\s\S]*openingBalance/)});
test("guard rejects immutable journal APIs and fake marker assertions",()=>{assert.doesNotMatch(api,/export const (?:updateJournal|deleteJournal|removeJournal)|db\.patch\([^)]*journalLines/);assert.doesNotMatch(integration,/assert\.(?:ok|equal)\(\s*["'`]/);for(const body of glf.values()){const fake=/const\s+([A-Za-z_$][\w$]*)\s*=\s*["'`][^"'`]*["'`]\s*;[\s\S]{0,120}?assert\.ok\(\s*\1\s*\)/.exec(body);assert.equal(fake,null)}});
