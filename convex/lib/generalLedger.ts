import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { AuthUser } from "./auth";
import { ConvexError } from "convex/values";
import { nextDocumentNumber } from "./documentNumbers.ts";
import { assertIsoDate, fingerprint, fromCents, normalizeRequestId, normalizeText, periodKeyOf, toCents } from "./generalLedgerRules.ts";
import { logAction } from "./auth.ts";

export interface PostingLine { accountId:Id<"chartOfAccounts">; debit:number; credit:number; description?:string }
export interface PostingRequest {
  branchId:Id<"branches">; date:string; memo:string; lines:PostingLine[]; requestId:string;
  sourceType:"opening"|"manual"|"reversal"|"financial"|"financial_reversal"|"operational"|"operational_reversal";
  originalEntryId?:Id<"journalEntries">; reversalReason?:string;
  operationType?:string; referenceType?:string; referenceId?:string; referenceNumber?:string;
  financialTransactionId?:Id<"financialTransactions">;
}

async function updateBalances(ctx:MutationCtx, entryId:Id<"journalEntries">, branchId:Id<"branches">, entryDate:string, periodKey:string, accountId:Id<"chartOfAccounts">, debit:number, credit:number) {
  const now=Date.now(), accountKey=`${branchId}:${accountId}`;
  const account=await ctx.db.query("generalLedgerAccountBalances").withIndex("by_key",q=>q.eq("key",accountKey)).unique();
  if(account) await ctx.db.patch(account._id,{debitTotal:account.debitTotal+debit,creditTotal:account.creditTotal+credit,netDebitBalance:account.netDebitBalance+debit-credit,updatedAt:now,lastEntryId:entryId});
  else await ctx.db.insert("generalLedgerAccountBalances",{key:accountKey,branchId,accountId,debitTotal:debit,creditTotal:credit,netDebitBalance:debit-credit,updatedAt:now,lastEntryId:entryId});
  const periodBalanceKey=`${branchId}:${accountId}:${periodKey}`;
  const period=await ctx.db.query("generalLedgerPeriodBalances").withIndex("by_key",q=>q.eq("key",periodBalanceKey)).unique();
  if(period) await ctx.db.patch(period._id,{debitTotal:period.debitTotal+debit,creditTotal:period.creditTotal+credit,netDebitMovement:period.netDebitMovement+debit-credit,updatedAt:now,lastEntryId:entryId});
  else await ctx.db.insert("generalLedgerPeriodBalances",{key:periodBalanceKey,branchId,accountId,periodKey,debitTotal:debit,creditTotal:credit,netDebitMovement:debit-credit,updatedAt:now,lastEntryId:entryId});
  const dailyKey=`${branchId}:${accountId}:${entryDate}`;
  const daily=await ctx.db.query("generalLedgerDailyBalances").withIndex("by_key",q=>q.eq("key",dailyKey)).unique();
  if(daily) await ctx.db.patch(daily._id,{debitTotal:daily.debitTotal+debit,creditTotal:daily.creditTotal+credit,updatedAt:now,lastEntryId:entryId});
  else await ctx.db.insert("generalLedgerDailyBalances",{key:dailyKey,branchId,accountId,entryDate,debitTotal:debit,creditTotal:credit,updatedAt:now,lastEntryId:entryId});
}

export async function postJournal(ctx:MutationCtx,user:AuthUser,input:PostingRequest) {
  const requestId=normalizeRequestId(input.requestId), date=assertIsoDate(input.date), periodKey=periodKeyOf(date), memo=normalizeText(input.memo);
  const canonical={branchId:String(input.branchId),date,memo,lines:input.lines.map(l=>({accountId:String(l.accountId),debit:l.debit,credit:l.credit,description:normalizeText(l.description??"")})),sourceType:input.sourceType,originalEntryId:input.originalEntryId?String(input.originalEntryId):undefined,reversalReason:input.reversalReason?normalizeText(input.reversalReason):undefined,operationType:input.operationType,referenceType:input.referenceType,referenceId:input.referenceId,referenceNumber:input.referenceNumber,financialTransactionId:input.financialTransactionId?String(input.financialTransactionId):undefined};
  const requestFingerprint=fingerprint(canonical), idempotencyKey=`gl:${input.sourceType}:${requestId}`;
  const existing=await ctx.db.query("journalEntries").withIndex("by_idempotency",q=>q.eq("idempotencyKey",idempotencyKey)).unique();
  if(existing) { if(existing.requestFingerprint!==requestFingerprint) throw new ConvexError("معرف الطلب مستخدم بحمولة مختلفة"); return existing; }
  const settings=await ctx.db.query("generalLedgerSettings").first();
  if(!settings) throw new ConvexError("لم تتم تهيئة الأستاذ العام");
  if(date < settings.cutoverDate) throw new ConvexError("التاريخ يسبق تاريخ القطع المالي");
  const branch=await ctx.db.get(input.branchId); if(!branch?.isActive) throw new ConvexError("الفرع غير صالح أو غير نشط");
  const period=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",periodKey)).unique();
  if(!period || period.status!=="open") throw new ConvexError("الفترة المالية غير مفتوحة");
  if(input.lines.length<2) throw new ConvexError("القيد يحتاج سطرين على الأقل");
  let debitCents=0,creditCents=0; const prepared=[]; const identities=new Set<string>();
  for(const [index,line] of input.lines.entries()) {
    const debit=toCents(line.debit),credit=toCents(line.credit);
    if((debit>0)===(credit>0)) throw new ConvexError("كل سطر يجب أن يحتوي مدينًا أو دائنًا موجبًا فقط");
    const identity=`${line.accountId}:${debit}:${credit}:${normalizeText(line.description??"")}`; if(identities.has(identity)) throw new ConvexError("سطر مكرر غير منضبط"); identities.add(identity);
    const account=await ctx.db.get(line.accountId); if(!account || !account.isActive || !account.isPosting) throw new ConvexError("الحساب غير صالح للترحيل");
    debitCents+=debit; creditCents+=credit; prepared.push({lineNumber:index+1,account,debit:fromCents(debit),credit:fromCents(credit),description:normalizeText(line.description??"")||undefined});
  }
  if(!debitCents || !creditCents || debitCents!==creditCents) throw new ConvexError("القيد غير متوازن");
  const entryNumber=await nextDocumentNumber(ctx,"journal",new Date(`${date}T00:00:00Z`)), now=Date.now();
  const entryId=await ctx.db.insert("journalEntries",{entryNumber,branchId:input.branchId,entryDate:date,periodKey,sourceType:input.sourceType,status:"posted",memo,totalDebit:fromCents(debitCents),totalCredit:fromCents(creditCents),lineCount:prepared.length,requestId,idempotencyKey,requestFingerprint,originalEntryId:input.originalEntryId,reversalReason:input.reversalReason,operationType:input.operationType,referenceType:input.referenceType,referenceId:input.referenceId,referenceNumber:input.referenceNumber,financialTransactionId:input.financialTransactionId,postedAt:now,postedBy:user.userId});
  for(const line of prepared) { await ctx.db.insert("journalLines",{entryId,entryNumber,lineNumber:line.lineNumber,branchId:input.branchId,entryDate:date,periodKey,accountId:line.account._id,accountCodeSnapshot:line.account.code,accountNameSnapshot:line.account.nameAr,normalSideSnapshot:line.account.normalSide,debit:line.debit,credit:line.credit,description:line.description}); await updateBalances(ctx,entryId,input.branchId,date,periodKey,line.account._id,line.debit,line.credit); }
  await logAction(ctx,user,{
    action: input.sourceType.includes("reversal") || input.sourceType === "reversal" ? "reverse" : "post",
    module:"general_ledger",
    recordId:String(entryId),
    recordLabel:entryNumber,
    details:`${input.sourceType}; debit=${fromCents(debitCents)}; credit=${fromCents(creditCents)}`,
    branchId: input.branchId,
    sourceType: input.referenceType ?? "journal_entry",
    sourceId: input.referenceId ?? String(entryId),
    sourceNumber: input.referenceNumber ?? entryNumber,
    relatedType: input.originalEntryId ? "journal_entry" : undefined,
    relatedId: input.originalEntryId ? String(input.originalEntryId) : undefined,
    financialTransactionId: input.financialTransactionId ? String(input.financialTransactionId) : undefined,
    journalEntryId: String(entryId),
    reversalOfId: input.originalEntryId ? String(input.originalEntryId) : undefined,
    after: {
      sourceType: input.sourceType,
      status: "posted",
      date,
      amount: fromCents(debitCents),
      branchId: String(input.branchId),
      referenceType: input.referenceType ?? null,
      referenceNumber: input.referenceNumber ?? null,
    },
  });
  const entry=await ctx.db.get(entryId); if(!entry) throw new ConvexError("تعذر حفظ القيد"); return entry;
}
