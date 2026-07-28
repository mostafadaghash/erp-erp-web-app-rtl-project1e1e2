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
test("guard enforces the acceptance matrix split",()=>{const rows=matrix.match(/^\| GLF-\d{2} .*$/gm)??[];assert.equal(rows.length,40);assert.equal(rows.filter(x=>/\| EXECUTABLE \|$/.test(x)).length,20);assert.equal(rows.filter(x=>/\| PENDING_HARDENING \|$/.test(x)).length,20);for(let n=21;n<=40;n++)assert.match(rows[n-1],/موجود تقنيًا.*Hardening.*الجولة التالية/)});
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
 "GLF-20":[/debit:101/,/2026-01-02/,/accountId:receivable/,/changed memo/,/changed description/,/rejectUnchanged/]
};
test("guard enforces runtime calls and assertions for GLF-05 through GLF-20",()=>{for(let n=5;n<=20;n++){const id=`GLF-${String(n).padStart(2,"0")}`,body=glf.get(id)??"",code=executableCode(body);assert.match(code,/api\.generalLedger\.(?:createAccount|deactivateAccount|confirmOpening|postManualJournal|entryDetails|entryForPrint)/,`${id} public API`);assert.match(code,/assert\.(?:equal|deepEqual|ok|rejects|notEqual)|rejectUnchanged/,`${id} assertion`);for(const pattern of mapping[id]){if(pattern.global)assert.ok((body.match(pattern)??[]).length>=2,`${id}: ${pattern}`);else assert.match(body,pattern,`${id}: ${pattern}`)}}});
test("guard keeps GLF-21 through GLF-40 present but outside this hardening mapping",()=>{assert.deepEqual(Object.keys(mapping),[...Array.from({length:16},(_,i)=>`GLF-${String(i+5).padStart(2,"0")}`)]);for(let n=21;n<=40;n++)assert.ok(glf.has(`GLF-${n}`))});
test("guard forbids destructive or operational writes",()=>{assert.doesNotMatch(api+helper,/ctx\.db\.delete/);assert.doesNotMatch(api,/db\.(insert|patch)\("payments"/);assert.doesNotMatch(api,/export const (update|delete)Journal/);assert.doesNotMatch(api,/db\.(insert|patch)\("generalLedger(Account|Period)Balances"/);assert.match(helper,/generalLedgerAccountBalances/)});
test("guard requires indexes history and disabled operational posting",()=>{assert.match(schema,/index\("by_period",\["periodKey"\]\)/);assert.doesNotMatch(helper,/date < "2020-01-01"/);assert.match(helper,/settings\.cutoverDate/);assert.match(api,/operationalPostingEnabled:false/);assert.doesNotMatch(api,/operationalPostingEnabled:true/)});
