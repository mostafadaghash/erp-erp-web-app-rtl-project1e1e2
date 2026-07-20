import type { MutationCtx } from "../_generated/server";
import { ConvexError } from "convex/values";

export type DocumentType = "invoice" | "order" | "shipment" | "repair" | "delivery";
const config = {
  invoice: { prefix: "INV", table: "invoices", field: "invoiceNumber" },
  order: { prefix: "ORD", table: "orders", field: "orderNumber" },
  shipment: { prefix: "SHP", table: "shipments", field: "shipmentNumber" },
  repair: { prefix: "REP", table: "repairs", field: "repairNumber" },
  delivery: { prefix: "DEL", table: "deliveries", field: "deliveryNumber" },
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

async function existingNumbers(ctx: MutationCtx, type: DocumentType): Promise<string[]> {
  switch (type) {
    case "invoice": return (await ctx.db.query("invoices").collect()).map(x => x.invoiceNumber);
    case "order": return (await ctx.db.query("orders").collect()).map(x => x.orderNumber);
    case "shipment": return (await ctx.db.query("shipments").collect()).map(x => x.shipmentNumber);
    case "repair": return (await ctx.db.query("repairs").collect()).map(x => x.repairNumber);
    case "delivery": return (await ctx.db.query("deliveries").collect()).map(x => x.deliveryNumber);
  }
}

/** Convex mutations are optimistic serializable transactions; concurrent counter patches conflict and retry. */
export async function nextDocumentNumber(ctx: MutationCtx, type: DocumentType, now = new Date()): Promise<string> {
  const year = now.getUTCFullYear();
  const { prefix } = config[type];
  const key = `${type}:${year}`;
  const counter = await ctx.db.query("documentCounters").withIndex("by_key", q => q.eq("key", key)).unique();
  const numbers = await existingNumbers(ctx, type);
  let value = Math.max(counter?.nextValue ?? 1, nextValueAfterLegacy(type, year, numbers));
  let documentNumber = formatDocumentNumber(type, year, value);
  const occupied = new Set(numbers);
  while (occupied.has(documentNumber)) {
    value += 1;
    documentNumber = formatDocumentNumber(type, year, value);
  }
  if (counter) await ctx.db.patch(counter._id, { nextValue: value + 1, updatedAt: Date.now() });
  else await ctx.db.insert("documentCounters", { key, documentType: type, year, nextValue: value + 1, updatedAt: Date.now() });
  if (occupied.has(documentNumber)) throw new ConvexError("تعذر إنشاء رقم مستند فريد");
  return documentNumber;
}
