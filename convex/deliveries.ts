import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { canTransition, DELIVERY_TRANSITIONS, calculateDeliveryAmounts, roundMoney } from "../shared/businessRules";
import { nextDocumentNumber } from "./lib/documentNumbers";
import { requireActiveBranch, requireActiveCustomer } from "./lib/references";
import { assertBranchAccess, requireModulePermission, filterByBranch, resolveWriteBranch, logAction } from "./lib/auth";
import { requirePermission } from "./lib/auth";
import { deriveInvoiceStatus, isValidIsoDate } from "../shared/businessRules";
import { postCustomerLedgerEntry } from "./lib/customerLedger";
import { calculateAvailableBalance, postFinancialTransaction, requireActiveFinancialAccount, requireFinanceInitialized, reversePostedFinancialTransaction } from "./lib/finance";
import { paginationOptsValidator } from "convex/server";
import { assertMoneyInput } from "../shared/moneyRules.ts";
import type { Doc } from "./_generated/dataModel";

const deliveryDto = (d: Doc<"deliveries">) => ({
  _id:d._id,deliveryNumber:d.deliveryNumber,orderNumber:d.orderNumber,invoiceNumber:d.invoiceNumber,
  customerName:d.customerName,customerPhone:d.customerPhone,city:d.city,address:d.address,items:d.items,
  totalAmount:d.totalAmount,paymentMethod:d.paymentMethod,codAmount:d.codAmount,prepaidAmount:d.prepaidAmount,
  shippingCompany:d.shippingCompany,trackingNumber:d.trackingNumber,shippingCost:d.shippingCost,status:d.status,
  expectedDate:d.expectedDate,deliveredDate:d.deliveredDate,notes:d.notes,branchId:d.branchId,
});

export const list = query({
  args: { status: v.optional(v.string()), city: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_deliveries", "deliveries");
    const rows = args.status
      ? await ctx.db.query("deliveries").withIndex("by_status", q => q.eq("status", args.status!)).order("desc").collect()
      : await ctx.db.query("deliveries").withIndex("by_status").order("desc").collect();
    return filterByBranch(rows, user).filter(d => !args.city || d.city === args.city).map(deliveryDto);
  },
});

export const get = query({
  args: { id: v.id("deliveries") },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_deliveries", "deliveries");
    const delivery = await ctx.db.get(args.id);
    if (!delivery) return null;
    assertBranchAccess(user, delivery);
    return deliveryDto(delivery);
  },
});

export const create = mutation({
  args: {
    customerName: v.string(),
    customerPhone: v.string(),
    city: v.string(),
    address: v.string(),
    items: v.array(v.object({
      productName: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
    })),
    totalAmount: v.number(),
    paymentMethod: v.union(v.literal("cod"), v.literal("prepaid"), v.literal("partial")),
    codAmount: v.optional(v.number()),
    prepaidAmount: v.optional(v.number()),
    shippingCompany: v.string(),
    trackingNumber: v.optional(v.string()),
    shippingCost: v.number(),
    expectedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    orderId: v.optional(v.id("orders")),
    orderNumber: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx) => {
    await requireModulePermission(ctx, "create_deliveries", "deliveries");
    throw new ConvexError("تم إغلاق مسار الإنشاء القديم؛ استخدم إنشاء التوصيل من الطلب والفاتورة");
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("deliveries"),
    status: v.union(v.literal("pending"), v.literal("shipped"), v.literal("delivered"), v.literal("returned"), v.literal("cancelled")),
    reason: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_deliveries", "deliveries");
    const delivery = await ctx.db.get(args.id);
    if (!delivery) throw new ConvexError("الشحنة غير موجودة");
    assertBranchAccess(user, delivery);
    if (delivery.status === "delivered" || args.status === "delivered") throw new ConvexError("لا يسمح المسار التشغيلي بالانتقال إلى أو من حالة تم التسليم");
    const allowed = (delivery.status === "pending" && ["shipped", "cancelled"].includes(args.status)) || (delivery.status === "shipped" && args.status === "returned");
    if (!allowed) throw new ConvexError(`لا يمكن تغيير حالة التوصيل من ${delivery.status} إلى ${args.status}`);
    if ((args.status === "cancelled" || args.status === "returned") && !args.reason?.trim()) throw new ConvexError("سبب الإلغاء أو الإرجاع مطلوب");
    const patch: Record<string, unknown> = { status: args.status };
    if (args.status === "cancelled") { patch.cancelledAt = Date.now(); patch.cancelledBy = user.userId; patch.cancellationReason = args.reason?.trim(); }
    if (args.status === "returned") patch.cancellationReason = args.reason?.trim();
    if (args.notes) patch.notes = args.notes;
    await ctx.db.patch(args.id, patch);
    await logAction(ctx, user, {
      action: "update",
      module: "deliveries",
      recordId: args.id,
      recordLabel: delivery.deliveryNumber,
      details: `تحديث حالة التوصيل ${delivery.deliveryNumber} إلى: ${args.status}`,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("deliveries"),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    city: v.optional(v.string()),
    address: v.optional(v.string()),
    shippingCompany: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
    expectedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "edit_deliveries", "deliveries");
    const delivery = await ctx.db.get(args.id);
    if (!delivery) throw new ConvexError("الشحنة غير موجودة");
    assertBranchAccess(user, delivery);
    if (delivery.status !== "pending") throw new ConvexError("لا يمكن تعديل البيانات اللوجستية بعد الشحن");
    const { id, ...rest } = args;
    await ctx.db.patch(id, rest);
    await logAction(ctx, user, {
      action: "update",
      module: "deliveries",
      recordId: args.id,
      recordLabel: delivery.deliveryNumber,
      details: `تعديل بيانات التوصيل ${delivery.deliveryNumber}`,
    });
  },
});

export const remove = mutation({ args: { id: v.id("deliveries") }, handler: async () => { throw new ConvexError("استخدم تحديث الحالة إلى ملغاة مع إدخال السبب"); } });

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "view_deliveries", "deliveries");
    const all = await ctx.db.query("deliveries").collect();
    const d = filterByBranch(all, user);
    const pending   = d.filter(x => x.status === "pending").length;
    const shipped   = d.filter(x => x.status === "shipped").length;
    const delivered = d.filter(x => x.status === "delivered").length;
    const returned  = d.filter(x => x.status === "returned").length;
    const cancelled = d.filter(x => x.status === "cancelled").length;
    const collections = filterByBranch(await ctx.db.query("financialTransactions").withIndex("by_type", q => q.eq("type", "delivery_cod_collection")).collect(), user);
    const settlements = filterByBranch(await ctx.db.query("codSettlements").withIndex("by_status").collect(), user);
    const codWithCarriers = roundMoney(collections.filter(x => x.status === "posted").reduce((sum, x) => sum + x.amount, 0) - settlements.filter(x => x.status === "posted").reduce((sum, x) => sum + x.grossAmount, 0));
    const codSettled = roundMoney(settlements.filter(x => x.status === "posted").reduce((sum, x) => sum + x.grossAmount, 0));
    const codReversed = roundMoney(settlements.filter(x => x.status === "reversed").reduce((sum, x) => sum + x.grossAmount, 0));
    const carrierFees = roundMoney(settlements.filter(x => x.status === "posted").reduce((sum, x) => sum + x.feeAmount, 0));
    return { pending, shipped, delivered, returned, cancelled, totalCOD: codWithCarriers, codWithCarriers, codSettled, codReversed, carrierFees, total: d.length };
  },
});

const normalize = (value: string, label: string) => {
  const result = value.trim();
  if (!result || result.length > 200) throw new ConvexError(`${label} غير صالح`);
  return result;
};
const fingerprint = (value: object) => JSON.stringify(value);
const selectableBranch = (user: { role: string; branchId?: Id<"branches"> }, requested?: Id<"branches">) => {
  if (user.role === "admin" || user.role === "accountant") {
    if (!requested) throw new ConvexError("اختر الفرع");
    return requested;
  }
  if (!user.branchId) throw new ConvexError("الحساب غير مربوط بفرع");
  return user.branchId;
};
import type { Id } from "./_generated/dataModel";

export const createFromOrderInvoice = mutation({
  args: { orderId:v.id("orders"), invoiceId:v.id("invoices"), city:v.string(), address:v.string(), shippingCompany:v.string(), trackingNumber:v.optional(v.string()), expectedCarrierFee:v.number(), expectedDate:v.optional(v.string()), notes:v.optional(v.string()), branchId:v.optional(v.id("branches")), date:v.string(), requestId:v.string() },
  handler: async (ctx,args) => {
    const user=await requireModulePermission(ctx,"create_deliveries","deliveries");
    const requestId=normalize(args.requestId,"معرف الطلب"), branchId=selectableBranch(user,args.branchId);
    assertMoneyInput(args.expectedCarrierFee, "رسوم الناقل المتوقعة");
    const normalized={orderId:String(args.orderId),invoiceId:String(args.invoiceId),city:normalize(args.city,"المدينة"),address:normalize(args.address,"العنوان"),shippingCompany:normalize(args.shippingCompany,"شركة الشحن"),trackingNumber:args.trackingNumber?.trim()||undefined,expectedCarrierFee:roundMoney(args.expectedCarrierFee),expectedDate:args.expectedDate,notes:args.notes?.trim()||undefined,branchId:String(branchId),date:args.date};
    const requestFingerprint=fingerprint(normalized), idempotencyKey=`delivery-create:${user.userId}:${requestId}`;
    const prior=await ctx.db.query("deliveries").withIndex("by_idempotency_key",q=>q.eq("idempotencyKey",idempotencyKey)).unique();
    if(prior){if(prior.requestFingerprint!==requestFingerprint)throw new ConvexError("أعيد استخدام requestId ببيانات مختلفة");return prior._id;}
    if(!isValidIsoDate(args.date)||!Number.isFinite(normalized.expectedCarrierFee)||normalized.expectedCarrierFee<0)throw new ConvexError("بيانات التاريخ أو رسوم الناقل غير صالحة");
    await requireFinanceInitialized(ctx,args.date);
    const [order,invoice]=await Promise.all([ctx.db.get(args.orderId),ctx.db.get(args.invoiceId)]);
    if(!order||!invoice)throw new ConvexError("الطلب أو الفاتورة غير موجود");
    if(order.status!=="ready")throw new ConvexError("الطلب ليس جاهزاً");
    if(order.linkedInvoiceId&&order.linkedInvoiceId!==invoice._id)throw new ConvexError("الطلب مرتبط بفاتورة أخرى");
    if(!order.customerId||!invoice.customerId)throw new ConvexError("يجب ربط الطلب والفاتورة بعميل مسجل");
    if(order.customerId!==invoice.customerId)throw new ConvexError("عميل الطلب لا يطابق عميل الفاتورة");
    if(!order.branchId||!invoice.branchId||order.branchId!==branchId||invoice.branchId!==branchId)throw new ConvexError("يجب تطابق فرع الطلب والفاتورة والتوصيل");
    const customer=await ctx.db.get(order.customerId); if(!customer||customer.branchId!==branchId)throw new ConvexError("العميل لا ينتمي إلى الفرع");
    const net=roundMoney(invoice.netTotal??invoice.total);
    if(roundMoney(order.total)!==net)throw new ConvexError("إجمالي الطلب لا يطابق صافي الفاتورة");
    if(invoice.status==="cancelled"||invoice.status.includes("return")||(invoice.creditedTotal??0)>0)throw new ConvexError("الفاتورة غير مؤهلة للتوصيل");
    const [activeOrder,activeInvoice,returns]=await Promise.all([
      ctx.db.query("deliveries").withIndex("by_order_status",q=>q.eq("orderId",order._id)).filter(q=>q.neq(q.field("status"),"returned")).filter(q=>q.neq(q.field("status"),"cancelled")).first(),
      ctx.db.query("deliveries").withIndex("by_invoice_status",q=>q.eq("invoiceId",invoice._id)).filter(q=>q.neq(q.field("status"),"returned")).filter(q=>q.neq(q.field("status"),"cancelled")).first(),
      ctx.db.query("salesReturns").withIndex("by_invoice",q=>q.eq("invoiceId",invoice._id)).first(),
    ]);
    if(activeOrder||activeInvoice)throw new ConvexError("يوجد توصيل نشط للطلب أو الفاتورة"); if(returns)throw new ConvexError("توجد حركة مرتجع تمنع الربط");
    const unapplied=roundMoney(order.deposit-(order.appliedDeposit??0));
    if(unapplied<0||unapplied>invoice.remaining)throw new ConvexError("العربون غير المطبق يتجاوز متبقي الفاتورة");
    let paid=invoice.paid,remaining=invoice.remaining;
    if(unapplied>0){const posted=await postCustomerLedgerEntry(ctx,user,{type:"order_deposit_application",requestId:`${requestId}:deposit`,customerId:customer._id,branchId,date:args.date,receivableDelta:-unapplied,advanceDelta:-unapplied,purchasesDelta:0,description:`تطبيق عربون ${order.orderNumber} على ${invoice.invoiceNumber}`,referenceType:"delivery_deposit",referenceId:String(order._id),referenceNumber:order.orderNumber});paid=roundMoney(paid+unapplied);remaining=roundMoney(remaining-unapplied);await ctx.db.patch(invoice._id,{paid,remaining,status:deriveInvoiceStatus({netTotal:net,creditedTotal:invoice.creditedTotal??0,paid,remaining})});await ctx.db.patch(order._id,{appliedDeposit:roundMoney((order.appliedDeposit??0)+unapplied),linkedInvoiceId:invoice._id});void posted;}
    else await ctx.db.patch(order._id,{appliedDeposit:roundMoney(order.appliedDeposit??0),linkedInvoiceId:invoice._id});
    const deliveryNumber=await nextDocumentNumber(ctx,"delivery");
    const id=await ctx.db.insert("deliveries",{deliveryNumber,orderId:order._id,orderNumber:order.orderNumber,invoiceId:invoice._id,invoiceNumber:invoice.invoiceNumber,customerId:customer._id,customerName:customer.name,customerPhone:customer.phone,city:normalized.city,address:normalized.address,items:invoice.items.map(i=>({productName:i.productName,quantity:i.quantity,unitPrice:i.unitPrice})),totalAmount:net,grandTotal:net,paymentMethod:remaining===0?"prepaid":paid>0?"partial":"cod",codAmount:remaining,prepaidAmount:paid,shippingCompany:normalized.shippingCompany,trackingNumber:normalized.trackingNumber,shippingCost:normalized.expectedCarrierFee,expectedCarrierFee:normalized.expectedCarrierFee,status:"pending",expectedDate:normalized.expectedDate,notes:normalized.notes,branchId,accountingVersion:2,requestId,idempotencyKey,requestFingerprint,createdBy:user.userId});
    await logAction(ctx,user,{action:"create",module:"deliveries",recordId:id,recordLabel:deliveryNumber,details:`ربط ${order.orderNumber} بالفاتورة ${invoice.invoiceNumber}`}); return id;
  }
});

export const confirmDelivered=mutation({args:{deliveryId:v.id("deliveries"),codClearingAccountId:v.optional(v.id("financialAccounts")),date:v.string(),requestId:v.string(),notes:v.optional(v.string())},handler:async(ctx,args)=>{
  const user=await requirePermission(ctx,"confirm_cod_deliveries"),requestId=normalize(args.requestId,"معرف الطلب"),notes=args.notes?.trim()||undefined;
  const fp=fingerprint({deliveryId:String(args.deliveryId),account:args.codClearingAccountId?String(args.codClearingAccountId):undefined,date:args.date,notes});
  const key=`delivery-confirm:${args.deliveryId}:${requestId}`;
  const prior=await ctx.db.query("deliveryConfirmations").withIndex("by_idempotency",q=>q.eq("idempotencyKey",key)).unique();
  if(prior){if(prior.requestFingerprint!==fp)throw new ConvexError("أعيد استخدام requestId ببيانات مختلفة");return prior._id;}
  const delivery=await ctx.db.get(args.deliveryId);if(!delivery||delivery.accountingVersion!==2||!delivery.branchId||!delivery.invoiceId||!delivery.customerId||!delivery.orderId)throw new ConvexError("التوصيل غير مؤهل");
  if(delivery.currentConfirmationId)throw new ConvexError("يوجد تأكيد منشور بالفعل");if(delivery.status!=="shipped")throw new ConvexError("يجب شحن التوصيل أولاً");
  if(user.role!=="admin"&&user.role!=="accountant"&&user.branchId!==delivery.branchId)throw new ConvexError("ليس لديك صلاحية لفرع التوصيل");await requireFinanceInitialized(ctx,args.date);
  const [invoice,order,attempts]=await Promise.all([ctx.db.get(delivery.invoiceId),ctx.db.get(delivery.orderId),ctx.db.query("deliveryConfirmations").withIndex("by_delivery",q=>q.eq("deliveryId",delivery._id)).collect()]);
  if(!invoice||!order||invoice.customerId!==delivery.customerId||invoice.branchId!==delivery.branchId||order.branchId!==delivery.branchId)throw new ConvexError("روابط التوصيل غير متسقة");
  const cod=roundMoney(delivery.codAmount??0),net=roundMoney(invoice.netTotal??invoice.total),credited=roundMoney(invoice.creditedTotal??0);
  if(roundMoney(invoice.paid)!==roundMoney(delivery.prepaidAmount??0)||roundMoney(invoice.remaining)!==cod||net!==roundMoney(delivery.totalAmount)||credited!==0||invoice.status==="cancelled"||invoice.status.includes("return"))throw new ConvexError("تغير Snapshot الفاتورة ولا يمكن تأكيد التسليم");
  let financialTransactionId:Id<"financialTransactions">|undefined,customerLedgerEntryId:Id<"customerLedgerEntries">|undefined;
  if(cod>0){if(!args.codClearingAccountId)throw new ConvexError("اختر حساب COD");const account=await requireActiveFinancialAccount(ctx,args.codClearingAccountId);if(account.type!=="cod_clearing"||account.branchId!==delivery.branchId)throw new ConvexError("حساب COD غير صالح للفرع");const posted=await postFinancialTransaction(ctx,user,{type:"delivery_cod_collection",requestId,date:args.date,amount:cod,description:`تحصيل COD ${delivery.deliveryNumber}`,branchId:delivery.branchId,referenceType:"delivery",referenceId:String(delivery._id),referenceNumber:delivery.deliveryNumber,customerId:delivery.customerId,movements:[{accountId:account._id,signedAmount:cod}]});financialTransactionId=posted.transactionId;const ledger=await postCustomerLedgerEntry(ctx,user,{type:"delivery_cod_collection",requestId:`${requestId}:ledger`,customerId:delivery.customerId,branchId:delivery.branchId,date:args.date,receivableDelta:-cod,advanceDelta:0,purchasesDelta:0,description:`تحصيل COD ${delivery.deliveryNumber}`,referenceType:"delivery",referenceId:String(delivery._id),referenceNumber:delivery.deliveryNumber});customerLedgerEntryId=ledger.entryId;const paid=roundMoney(invoice.paid+cod),remaining=roundMoney(invoice.remaining-cod);await ctx.db.patch(invoice._id,{paid,remaining,status:deriveInvoiceStatus({netTotal:net,creditedTotal:0,paid,remaining})});}
  const confirmationId=await ctx.db.insert("deliveryConfirmations",{deliveryId:delivery._id,deliveryNumber:delivery.deliveryNumber,attemptNumber:attempts.length+1,branchId:delivery.branchId,invoiceId:delivery.invoiceId,orderId:delivery.orderId,customerId:delivery.customerId,codAmount:cod,codClearingAccountId:args.codClearingAccountId,status:"posted",date:args.date,requestId,idempotencyKey:key,requestFingerprint:fp,financialTransactionId,customerLedgerEntryId,createdBy:user.userId,createdAt:Date.now()});
  await ctx.db.patch(delivery._id,{status:"delivered",deliveredDate:args.date,currentConfirmationId:confirmationId,codClearingAccountId:args.codClearingAccountId,codFinancialTransactionId:financialTransactionId,codCustomerLedgerEntryId:customerLedgerEntryId,confirmationRequestId:requestId,confirmationFingerprint:fp,notes:notes??delivery.notes});await ctx.db.patch(order._id,{status:"delivered"});await logAction(ctx,user,{action:"confirm",module:"deliveries",recordId:delivery._id,recordLabel:delivery.deliveryNumber,details:`تأكيد التسليم - المحاولة ${attempts.length+1}`});return confirmationId;
}});

export const accountPicker=query({args:{branchId:v.id("branches"),purpose:v.union(v.literal("cod"),v.literal("destination"))},handler:async(ctx,args)=>{const user=await requirePermission(ctx,args.purpose==="cod"?"confirm_cod_deliveries":"view_cod_settlements");const branchId=selectableBranch(user,args.branchId);const types=args.purpose==="cod"?["cod_clearing"]:["cash","bank"];const rows=await ctx.db.query("financialAccounts").withIndex("by_branch",q=>q.eq("branchId",branchId)).collect();return rows.filter(x=>x.isActive&&types.includes(x.type)).map(x=>({_id:x._id,name:x.name,type:x.type,branchId:x.branchId}));}});

export const creationOptions=query({args:{branchId:v.id("branches")},handler:async(ctx,args)=>{const user=await requireModulePermission(ctx,"create_deliveries","deliveries"),branchId=selectableBranch(user,args.branchId);const orders=await ctx.db.query("orders").withIndex("by_branch_status",q=>q.eq("branchId",branchId).eq("status","ready")).collect();const invoices=await ctx.db.query("invoices").withIndex("by_branch_status",q=>q.eq("branchId",branchId)).collect();return orders.filter(o=>o.customerId).map(o=>({orderId:o._id,orderNumber:o.orderNumber,customerId:o.customerId!,customerName:o.customerName,total:o.total,unappliedDeposit:roundMoney(o.deposit-(o.appliedDeposit??0)),items:o.items.map(i=>({productName:i.productName,quantity:i.quantity,unitPrice:i.unitPrice})),invoices:invoices.filter(i=>i.customerId===o.customerId&&i.status!=="cancelled"&&!i.status.includes("return")&&(i.creditedTotal??0)===0).map(i=>({invoiceId:i._id,invoiceNumber:i.invoiceNumber,netTotal:i.netTotal??i.total,paid:i.paid,remaining:i.remaining}))}));}});

export const confirmationHistory=query({args:{deliveryId:v.id("deliveries")},handler:async(ctx,args)=>{const user=await requireModulePermission(ctx,"view_deliveries","deliveries"),delivery=await ctx.db.get(args.deliveryId);if(!delivery)throw new ConvexError("التوصيل غير موجود");assertBranchAccess(user,delivery);const rows=await ctx.db.query("deliveryConfirmations").withIndex("by_delivery",q=>q.eq("deliveryId",delivery._id)).collect();return rows.map(c=>({attemptNumber:c.attemptNumber,status:c.status,date:c.date,codAmount:c.codAmount,reversalReason:c.reversalReason,reversalDate:c.reversalDate}));}});

export const listPaginated=query({args:{branchId:v.id("branches"),paginationOpts:paginationOptsValidator},handler:async(ctx,args)=>{const user=await requireModulePermission(ctx,"view_deliveries","deliveries"),branchId=selectableBranch(user,args.branchId);const page=await ctx.db.query("deliveries").withIndex("by_branch_status",q=>q.eq("branchId",branchId)).order("desc").paginate(args.paginationOpts);return{...page,page:page.page.map(d=>({_id:d._id,deliveryNumber:d.deliveryNumber,invoiceNumber:d.invoiceNumber,orderNumber:d.orderNumber,customerName:d.customerName,city:d.city,status:d.status,codAmount:d.codAmount,prepaidAmount:d.prepaidAmount,shippingCompany:d.shippingCompany,deliveredDate:d.deliveredDate,branchId:d.branchId,accountingVersion:d.accountingVersion,codSettlementId:d.codSettlementId}))};}});
export const unsettled=query({args:{branchId:v.id("branches"),sourceAccountId:v.id("financialAccounts")},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"view_cod_settlements"),branchId=selectableBranch(user,args.branchId);const account=await requireActiveFinancialAccount(ctx,args.sourceAccountId);if(account.branchId!==branchId||account.type!=="cod_clearing")throw new ConvexError("حساب COD غير صالح");const rows=await ctx.db.query("deliveries").withIndex("by_cod_account_status",q=>q.eq("codClearingAccountId",account._id).eq("status","delivered")).collect();return rows.filter(d=>d.accountingVersion===2&&!d.codSettlementId&&(d.codAmount??0)>0).map(d=>({_id:d._id,deliveryNumber:d.deliveryNumber,invoiceNumber:d.invoiceNumber,codAmount:d.codAmount,deliveredDate:d.deliveredDate,branchId:d.branchId,codClearingAccountId:d.codClearingAccountId}));}});

export const createCodSettlement=mutation({args:{deliveryIds:v.array(v.id("deliveries")),sourceAccountId:v.id("financialAccounts"),destinationAccountId:v.id("financialAccounts"),feeAmount:v.number(),date:v.string(),branchId:v.id("branches"),requestId:v.string(),notes:v.optional(v.string())},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"settle_cod_collections"),branchId=selectableBranch(user,args.branchId),requestId=normalize(args.requestId,"معرف الطلب");const ids=[...args.deliveryIds].sort().map(String);assertMoneyInput(args.feeAmount, "رسوم التسوية");const fp=fingerprint({ids,source:String(args.sourceAccountId),destination:String(args.destinationAccountId),fee:args.feeAmount,date:args.date,branch:String(branchId),notes:args.notes?.trim()||undefined}),key=`cod-settlement:${user.userId}:${requestId}`;const prior=await ctx.db.query("codSettlements").withIndex("by_idempotency_key",q=>q.eq("idempotencyKey",key)).unique();if(prior){if(prior.requestFingerprint!==fp)throw new ConvexError("أعيد استخدام requestId ببيانات مختلفة");return prior._id;}if(args.deliveryIds.length===0||new Set(ids).size!==ids.length)throw new ConvexError("اختر توصيلات فريدة");await requireFinanceInitialized(ctx,args.date);const [source,destination]=await Promise.all([requireActiveFinancialAccount(ctx,args.sourceAccountId),requireActiveFinancialAccount(ctx,args.destinationAccountId)]);if(source.type!=="cod_clearing"||!["cash","bank"].includes(destination.type)||source.branchId!==branchId||destination.branchId!==branchId)throw new ConvexError("حسابات التسوية غير صالحة");const deliveries=await Promise.all(args.deliveryIds.map(id=>ctx.db.get(id)));if(deliveries.some(d=>!d||d.accountingVersion!==2||d.status!=="delivered"||d.branchId!==branchId||d.codClearingAccountId!==source._id||d.codSettlementId||!d.invoiceId||!d.currentConfirmationId||(d.codAmount??0)<=0))throw new ConvexError("أحد التوصيلات غير مؤهل للتسوية");const gross=roundMoney(deliveries.reduce((s,d)=>s+(d?.codAmount??0),0)),fee=roundMoney(args.feeAmount),net=roundMoney(gross-fee);if(!Number.isFinite(fee)||fee<0||fee>gross)throw new ConvexError("رسوم الناقل غير صالحة");const available=await calculateAvailableBalance(ctx,source._id,args.date);if(available<gross)throw new ConvexError("رصيد COD المتاح للتسوية غير كافٍ");const posted=await postFinancialTransaction(ctx,user,{type:"cod_settlement",requestId,date:args.date,amount:gross,feeAmount:fee,description:`تسوية تحصيلات COD`,branchId,referenceType:"cod_settlement",movements:[{accountId:source._id,signedAmount:-gross},{accountId:destination._id,signedAmount:net}]});const settlementNumber=await nextDocumentNumber(ctx,"codSettlement",new Date(`${args.date}T00:00:00Z`));const settlementId=await ctx.db.insert("codSettlements",{settlementNumber,branchId,sourceAccountId:source._id,destinationAccountId:destination._id,grossAmount:gross,feeAmount:fee,netAmount:net,date:args.date,status:"posted",requestId,idempotencyKey:key,requestFingerprint:fp,financialTransactionId:posted.transactionId,createdBy:user.userId,createdAt:Date.now(),notes:args.notes?.trim()||undefined});for(const d of deliveries){if(!d||!d.invoiceId||!d.invoiceNumber)throw new ConvexError("بيانات التوصيل ناقصة");await ctx.db.insert("codSettlementItems",{settlementId,confirmationId:d.currentConfirmationId,deliveryId:d._id,deliveryNumber:d.deliveryNumber,invoiceId:d.invoiceId,invoiceNumber:d.invoiceNumber,codAmount:d.codAmount??0,branchId,date:args.date});await ctx.db.patch(d._id,{codSettlementId:settlementId});}return settlementId;}});

export const reverseCodSettlement=mutation({args:{settlementId:v.id("codSettlements"),reason:v.string(),date:v.string(),requestId:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"reverse_cod_collections"),reason=normalize(args.reason,"سبب العكس"),requestId=normalize(args.requestId,"معرف الطلب"),fp=fingerprint({settlement:String(args.settlementId),reason,date:args.date});const settlement=await ctx.db.get(args.settlementId);if(!settlement)throw new ConvexError("التسوية غير موجودة");if(settlement.reversalRequestId===requestId){if(settlement.reversalFingerprint!==fp)throw new ConvexError("أعيد استخدام requestId ببيانات مختلفة");return settlement.reversalFinancialTransactionId;}if(settlement.status==="reversed")throw new ConvexError("سبق عكس التسوية بطلب مختلف");await requireFinanceInitialized(ctx,args.date);const reversal=await reversePostedFinancialTransaction(ctx,user,{transactionId:settlement.financialTransactionId,reason,date:args.date,requestId,referenceType:"cod_settlement",referenceId:String(settlement._id),referenceNumber:settlement.settlementNumber});const items=await ctx.db.query("codSettlementItems").withIndex("by_settlement",q=>q.eq("settlementId",settlement._id)).collect();for(const item of items)await ctx.db.patch(item.deliveryId,{codSettlementId:undefined});await ctx.db.patch(settlement._id,{status:"reversed",reversedAt:Date.now(),reversedBy:user.userId,reversalReason:reason,reversalDate:args.date,reversalRequestId:requestId,reversalFingerprint:fp,reversalFinancialTransactionId:reversal});return reversal;}});

export const reverseConfirmation=mutation({args:{deliveryId:v.id("deliveries"),reason:v.string(),date:v.string(),requestId:v.string()},handler:async(ctx,args)=>{
 const user=await requirePermission(ctx,"reverse_cod_collections"),reason=normalize(args.reason,"سبب العكس"),requestId=normalize(args.requestId,"معرف الطلب"),fp=fingerprint({delivery:String(args.deliveryId),reason,date:args.date});const d=await ctx.db.get(args.deliveryId);if(!d||d.status!=="delivered"||!d.currentConfirmationId||!d.invoiceId||!d.orderId||!d.customerId||!d.branchId)throw new ConvexError("التوصيل غير مؤهل للعكس");const confirmation=await ctx.db.get(d.currentConfirmationId);if(!confirmation||confirmation.status!=="posted")throw new ConvexError("تأكيد التسليم الحالي غير صالح");if(confirmation.reversalRequestId===requestId){if(confirmation.reversalFingerprint!==fp)throw new ConvexError("أعيد استخدام requestId ببيانات مختلفة");return confirmation.reversalFinancialTransactionId??confirmation._id;}if(confirmation.reversalRequestId)throw new ConvexError("سبق العكس بطلب مختلف");const [settled,invoice,returns]=await Promise.all([ctx.db.query("codSettlementItems").withIndex("by_confirmation",q=>q.eq("confirmationId",confirmation._id)).first(),ctx.db.get(d.invoiceId),ctx.db.query("salesReturns").withIndex("by_invoice",q=>q.eq("invoiceId",d.invoiceId!)).filter(q=>q.eq(q.field("status"),"posted")).first()]);if(settled||returns||!invoice)throw new ConvexError("آثار لاحقة تمنع العكس");const cod=confirmation.codAmount;if(roundMoney(invoice.paid)!==roundMoney((d.prepaidAmount??0)+cod)||roundMoney(invoice.remaining)!==0)throw new ConvexError("تغيرت الفاتورة بعد التحصيل ولا يمكن العكس");await requireFinanceInitialized(ctx,args.date);let financial:Id<"financialTransactions">|undefined,ledger:Id<"customerLedgerEntries">|undefined;if(cod>0){if(!confirmation.financialTransactionId)throw new ConvexError("معاملة COD مفقودة");financial=await reversePostedFinancialTransaction(ctx,user,{transactionId:confirmation.financialTransactionId,reason,date:args.date,requestId,referenceType:"delivery_confirmation",referenceId:String(confirmation._id),referenceNumber:d.deliveryNumber});const entry=await postCustomerLedgerEntry(ctx,user,{type:"delivery_cod_reversal",requestId:`${requestId}:ledger`,customerId:d.customerId,branchId:d.branchId,date:args.date,receivableDelta:cod,advanceDelta:0,purchasesDelta:0,description:`عكس تحصيل ${d.deliveryNumber}: ${reason}`,referenceType:"delivery_confirmation_reversal",referenceId:String(confirmation._id),referenceNumber:d.deliveryNumber,originalEntryId:confirmation.customerLedgerEntryId});ledger=entry.entryId;const paid=roundMoney(invoice.paid-cod),remaining=roundMoney(invoice.remaining+cod);await ctx.db.patch(invoice._id,{paid,remaining,status:deriveInvoiceStatus({netTotal:invoice.netTotal??invoice.total,creditedTotal:invoice.creditedTotal??0,paid,remaining})});}await ctx.db.patch(d.orderId,{status:"ready"});await ctx.db.patch(confirmation._id,{status:"reversed",reversedAt:Date.now(),reversedBy:user.userId,reversalReason:reason,reversalDate:args.date,reversalRequestId:requestId,reversalFingerprint:fp,reversalFinancialTransactionId:financial,reversalCustomerLedgerEntryId:ledger});await ctx.db.patch(d._id,{status:"shipped",deliveredDate:undefined,currentConfirmationId:undefined,reversedAt:Date.now(),reversedBy:user.userId,reversalReason:reason,reversalDate:args.date,reversalRequestId:requestId,reversalFingerprint:fp,reversalFinancialTransactionId:financial,reversalCustomerLedgerEntryId:ledger});await logAction(ctx,user,{action:"reverse",module:"deliveries",recordId:d._id,recordLabel:d.deliveryNumber,details:`عكس محاولة التأكيد ${confirmation.attemptNumber}: ${reason}`});return financial??confirmation._id;
}});

export const listSettlements=query({args:{branchId:v.id("branches"),paginationOpts:paginationOptsValidator},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"view_cod_settlements"),branchId=selectableBranch(user,args.branchId),page=await ctx.db.query("codSettlements").withIndex("by_branch_date",q=>q.eq("branchId",branchId)).order("desc").paginate(args.paginationOpts);return{...page,page:page.page.map(s=>({_id:s._id,settlementNumber:s.settlementNumber,date:s.date,status:s.status,grossAmount:s.grossAmount,feeAmount:s.feeAmount,netAmount:s.netAmount,branchId:s.branchId,reversalReason:s.reversalReason}))};}});
export const legacyReview=query({args:{branchId:v.id("branches")},handler:async(ctx,args)=>{const user=await requireModulePermission(ctx,"view_deliveries","deliveries"),branchId=selectableBranch(user,args.branchId),rows=await ctx.db.query("deliveries").withIndex("by_branch_status",q=>q.eq("branchId",branchId)).collect();return rows.filter(d=>d.accountingVersion!==2).map(d=>({deliveryNumber:d.deliveryNumber,status:d.status,issues:[d.status==="delivered"&&(d.codAmount??0)>0&&!d.codFinancialTransactionId?"COD مسلم بلا حركة مالية":undefined,!d.invoiceId?"بلا فاتورة":undefined,!d.customerId?"بلا عميل مسجل":undefined,!/^DEL-\d{4}-\d{5}$/.test(d.deliveryNumber)?"رقم غير متوافق":undefined].filter((x):x is string=>Boolean(x)),reviewStatus:"تحتاج مراجعة يدوية"}));}});
export const printDelivery=query({args:{deliveryId:v.id("deliveries")},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"print_cod_settlements"),d=await ctx.db.get(args.deliveryId);if(!d)throw new ConvexError("التوصيل غير موجود");if(user.role!=="admin"&&user.role!=="accountant"&&user.branchId!==d.branchId)throw new ConvexError("ليس لديك صلاحية لهذا الفرع");const creator=d.createdBy;const employee=creator?(await ctx.db.query("userProfiles").withIndex("by_user",q=>q.eq("userId",creator)).first()??await ctx.db.query("userProfiles").withIndex("by_token",q=>q.eq("tokenIdentifier",creator)).first()):null;return{deliveryNumber:d.deliveryNumber,orderNumber:d.orderNumber,invoiceNumber:d.invoiceNumber,customerName:d.customerName,customerPhone:d.customerPhone,city:d.city,address:d.address,items:d.items,totalAmount:d.totalAmount,prepaidAmount:d.prepaidAmount,codAmount:d.codAmount,expectedCarrierFee:d.expectedCarrierFee,shippingCompany:d.shippingCompany,trackingNumber:d.trackingNumber,status:d.status,deliveredDate:d.deliveredDate,employeeName:employee?.name??"مستخدم غير معروف",reversalReason:d.reversalReason};}});
export const printCodSettlement=query({args:{settlementId:v.id("codSettlements")},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"print_cod_settlements"),s=await ctx.db.get(args.settlementId);if(!s)throw new ConvexError("التسوية غير موجودة");selectableBranch(user,s.branchId);const [source,destination,items]=await Promise.all([ctx.db.get(s.sourceAccountId),ctx.db.get(s.destinationAccountId),ctx.db.query("codSettlementItems").withIndex("by_settlement",q=>q.eq("settlementId",s._id)).collect()]);return{settlementNumber:s.settlementNumber,date:s.date,status:s.status,sourceAccountName:source?.name??"—",destinationAccountName:destination?.name??"—",grossAmount:s.grossAmount,feeAmount:s.feeAmount,netAmount:s.netAmount,notes:s.notes,reversalReason:s.reversalReason,items:items.map(i=>({deliveryNumber:i.deliveryNumber,invoiceNumber:i.invoiceNumber,codAmount:i.codAmount}))};}});
