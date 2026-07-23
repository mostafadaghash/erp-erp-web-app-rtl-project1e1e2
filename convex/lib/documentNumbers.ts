import type { MutationCtx } from "../_generated/server";
import { ConvexError } from "convex/values";

export type DocumentType = "invoice" | "order" | "shipment" | "repair" | "delivery" | "finance" | "creditNote" | "purchaseReceipt" | "purchaseReturn" | "supplierLedger" | "supplierPayment" | "customerLedger";
const config = {
  invoice: { prefix: "INV", table: "invoices", field: "invoiceNumber" },
  order: { prefix: "ORD", table: "orders", field: "orderNumber" },
  shipment: { prefix: "SHP", table: "shipments", field: "shipmentNumber" },
  repair: { prefix: "REP", table: "repairs", field: "repairNumber" },
  delivery: { prefix: "DEL", table: "deliveries", field: "deliveryNumber" },
  finance: { prefix: "FIN", table: "financialTransactions", field: "transactionNumber" },
  creditNote: { prefix: "CRN", table: "salesReturns", field: "creditNoteNumber" },
  purchaseReceipt: { prefix: "PUR", table: "purchaseReceipts", field: "receiptNumber" },
  purchaseReturn: { prefix: "PRN", table: "purchaseReturns", field: "returnNumber" },
  supplierLedger: { prefix: "SUP", table: "supplierLedgerEntries", field: "entryNumber" },
  supplierPayment: { prefix: "SPY", table: "supplierPayments", field: "paymentNumber" },
  customerLedger: { prefix: "CUS", table: "customerLedgerEntries", field: "entryNumber" },
} as const;

export function formatDocumentNumber(type: DocumentType, year: number, value: number): string {
  return `${config[type].prefix}-${year}-${String(value).padStart(5, "0")}`;
}

export function nextValueAfterLegacy(type: DocumentType, year: number, numbers: readonly string[]): number {
  const expression = new RegExp(`^${config[type].prefix}-${year}-(\\d+)$`);
  return numbers.reduce((maximum, number) => {
    const match = expression.exec(number);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0) + 1;
}

async function legacyNumbersForYear(ctx: MutationCtx, type: DocumentType, year: number): Promise<string[]> {
  const lower = `${config[type].prefix}-${year}-`;
  const upper = `${config[type].prefix}-${year}.`;
  switch (type) {
    case "invoice": return (await ctx.db.query("invoices").withIndex("by_invoice_number", q => q.gte("invoiceNumber", lower).lt("invoiceNumber", upper)).collect()).map(x => x.invoiceNumber);
    case "order": return (await ctx.db.query("orders").withIndex("by_order_number", q => q.gte("orderNumber", lower).lt("orderNumber", upper)).collect()).map(x => x.orderNumber);
    case "shipment": return (await ctx.db.query("shipments").withIndex("by_shipment_number", q => q.gte("shipmentNumber", lower).lt("shipmentNumber", upper)).collect()).map(x => x.shipmentNumber);
    case "repair": return (await ctx.db.query("repairs").withIndex("by_repair_number", q => q.gte("repairNumber", lower).lt("repairNumber", upper)).collect()).map(x => x.repairNumber);
    case "delivery": return (await ctx.db.query("deliveries").withIndex("by_delivery_number", q => q.gte("deliveryNumber", lower).lt("deliveryNumber", upper)).collect()).map(x => x.deliveryNumber);
    case "finance": return (await ctx.db.query("financialTransactions").withIndex("by_transaction_number", q => q.gte("transactionNumber", lower).lt("transactionNumber", upper)).collect()).map(x => x.transactionNumber);
    case "creditNote": return (await ctx.db.query("salesReturns").withIndex("by_credit_note_number", q => q.gte("creditNoteNumber", lower).lt("creditNoteNumber", upper)).collect()).map(x => x.creditNoteNumber);
    case "purchaseReceipt": return (await ctx.db.query("purchaseReceipts").withIndex("by_receipt_number", q => q.gte("receiptNumber", lower).lt("receiptNumber", upper)).collect()).map(x => x.receiptNumber);
    case "purchaseReturn": return (await ctx.db.query("purchaseReturns").withIndex("by_return_number", q => q.gte("returnNumber", lower).lt("returnNumber", upper)).collect()).map(x => x.returnNumber);
    case "supplierLedger": return (await ctx.db.query("supplierLedgerEntries").withIndex("by_entry_number", q => q.gte("entryNumber", lower).lt("entryNumber", upper)).collect()).map(x => x.entryNumber);
    case "supplierPayment": return (await ctx.db.query("supplierPayments").withIndex("by_payment_number", q => q.gte("paymentNumber", lower).lt("paymentNumber", upper)).collect()).map(x => x.paymentNumber);
    case "customerLedger": return (await ctx.db.query("customerLedgerEntries").withIndex("by_entry_number", q => q.gte("entryNumber", lower).lt("entryNumber", upper)).collect()).map(x => x.entryNumber);
  }
}

export async function documentNumberExists(ctx: MutationCtx, type: DocumentType, number: string): Promise<boolean> {
  switch (type) {
    case "invoice": return (await ctx.db.query("invoices").withIndex("by_invoice_number", q => q.eq("invoiceNumber", number)).first()) !== null;
    case "order": return (await ctx.db.query("orders").withIndex("by_order_number", q => q.eq("orderNumber", number)).first()) !== null;
    case "shipment": return (await ctx.db.query("shipments").withIndex("by_shipment_number", q => q.eq("shipmentNumber", number)).first()) !== null;
    case "repair": return (await ctx.db.query("repairs").withIndex("by_repair_number", q => q.eq("repairNumber", number)).first()) !== null;
    case "delivery": return (await ctx.db.query("deliveries").withIndex("by_delivery_number", q => q.eq("deliveryNumber", number)).first()) !== null;
    case "finance": return (await ctx.db.query("financialTransactions").withIndex("by_transaction_number", q => q.eq("transactionNumber", number)).first()) !== null;
    case "creditNote": return (await ctx.db.query("salesReturns").withIndex("by_credit_note_number", q => q.eq("creditNoteNumber", number)).first()) !== null;
    case "purchaseReceipt": return (await ctx.db.query("purchaseReceipts").withIndex("by_receipt_number", q => q.eq("receiptNumber", number)).first()) !== null;
    case "purchaseReturn": return (await ctx.db.query("purchaseReturns").withIndex("by_return_number", q => q.eq("returnNumber", number)).first()) !== null;
    case "supplierLedger": return (await ctx.db.query("supplierLedgerEntries").withIndex("by_entry_number", q => q.eq("entryNumber", number)).first()) !== null;
    case "supplierPayment": return (await ctx.db.query("supplierPayments").withIndex("by_payment_number", q => q.eq("paymentNumber", number)).first()) !== null;
    case "customerLedger": return (await ctx.db.query("customerLedgerEntries").withIndex("by_entry_number", q => q.eq("entryNumber", number)).first()) !== null;
  }
}

/** Convex mutations are optimistic serializable transactions; concurrent counter patches conflict and retry. */
export async function nextDocumentNumber(ctx: MutationCtx, type: DocumentType, now = new Date()): Promise<string> {
  const year = now.getUTCFullYear();
  const { prefix } = config[type];
  const key = `${type}:${year}`;
  const counter = await ctx.db.query("documentCounters").withIndex("by_key", q => q.eq("key", key)).unique();
  const numbers = counter ? [] : await legacyNumbersForYear(ctx, type, year);
  let value = counter?.nextValue ?? nextValueAfterLegacy(type, year, numbers);
  let documentNumber = formatDocumentNumber(type, year, value);
  while (await documentNumberExists(ctx, type, documentNumber)) {
    value += 1;
    documentNumber = formatDocumentNumber(type, year, value);
  }
  if (counter) await ctx.db.patch(counter._id, { nextValue: value + 1, updatedAt: Date.now() });
  else await ctx.db.insert("documentCounters", { key, documentType: type, year, nextValue: value + 1, updatedAt: Date.now() });
  if (await documentNumberExists(ctx, type, documentNumber)) throw new ConvexError("تعذر إنشاء رقم مستند فريد");
  return documentNumber;
}
