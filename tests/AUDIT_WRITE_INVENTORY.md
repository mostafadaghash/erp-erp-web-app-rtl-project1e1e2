# Audit Write Inventory

Generated from the full repository checkout.

## convex/branches.ts

- Mutations: 5
- logAction calls: 4

### Mutation exports
- L22: `create`
- L51: `update`
- L75: `setActive`
- L79: `remove`
- L130: `assignLegacyData`

### logAction call sites
#### Call 1 at L40
```ts
0037:       phone: args.phone,
0038:       isActive: args.isActive ?? true,
0039:     });
0040:     await logAction(ctx, user, {
0041:       action: "create",
0042:       module: "branches",
0043:       recordId: id,
0044:       recordLabel: args.name,
0045:       details: `إضافة فرع جديد: ${args.name} - ${args.address}`,
0046:     });
0047:     return id;
0048:   },
0049: });
0050: 
0051: export const update = mutation({
0052:   args: {
```

#### Call 2 at L65
```ts
0062:     const branch = await ctx.db.get(id);
0063:     if (!branch) throw new ConvexError("الفرع غير موجود");
0064:     await ctx.db.patch(id, data);
0065:     await logAction(ctx, user, {
0066:       action: "update",
0067:       module: "branches",
0068:       recordId: id,
0069:       recordLabel: args.name,
0070:       details: `تحديث بيانات الفرع: ${args.name}`,
0071:     });
0072:   },
0073: });
0074: 
0075: export const setActive = mutation({
0076:   args: { id: v.id("branches"), isActive: v.boolean() },
0077:   handler: async (ctx, args) => { const user = await requireModulePermission(ctx, "manage_branches", "branches"); const branch = await ctx.db.get(args.id); if (!branch) throw new ConvexError("الفرع غير موجود"); if (!args.isActive) { const employees = (await ctx.db.query("userProfiles").collect()).filter(profile => profile.branchId === args.id && profile.isActive); if (employees.length) throw new ConvexError("لا يمكن تعطيل فرع يحتوي على موظفين نشطين"); } await ctx.db.patch(args.id, { isActive: args.isActive }); await logAction(ctx, user, { action: args.isActive ? "activate" : "deactivate", module: "branches", recordId: args.id, recordLabel: branch.name, details: `${args.isActive ? "تفعيل" : "تعطيل"} الفرع ${branch.name}` }); },
```

#### Call 3 at L77
```ts
0074: 
0075: export const setActive = mutation({
0076:   args: { id: v.id("branches"), isActive: v.boolean() },
0077:   handler: async (ctx, args) => { const user = await requireModulePermission(ctx, "manage_branches", "branches"); const branch = await ctx.db.get(args.id); if (!branch) throw new ConvexError("الفرع غير موجود"); if (!args.isActive) { const employees = (await ctx.db.query("userProfiles").collect()).filter(profile => profile.branchId === args.id && profile.isActive); if (employees.length) throw new ConvexError("لا يمكن تعطيل فرع يحتوي على موظفين نشطين"); } await ctx.db.patch(args.id, { isActive: args.isActive }); await logAction(ctx, user, { action: args.isActive ? "activate" : "deactivate", module: "branches", recordId: args.id, recordLabel: branch.name, details: `${args.isActive ? "تفعيل" : "تعطيل"} الفرع ${branch.name}` }); },
0078: });
0079: export const remove = mutation({ args: { id: v.id("branches") }, handler: async () => { throw new ConvexError("استخدم تعطيل الفرع بدلاً من الحذف"); } });
0080: 
0081: export const stats = query({
0082:   args: {},
0083:   handler: async (ctx) => {
0084:     const user = await requireModulePermission(ctx, "view_branches", "branches");
0085:     const branches = await ctx.db.query("branches").collect();
0086:     const totalEmployees = hasPermission(user, "view_employees")
0087:       ? (await ctx.db.query("userProfiles").collect()).length
0088:       : undefined;
0089:     return {
```

#### Call 4 at L149
```ts
0146:     for (const item of await ctx.db.query("leads").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; }
0147:     for (const item of await ctx.db.query("deliveries").collect()) if (!item.branchId) { await ctx.db.patch(item._id, { branchId: args.branchId }); assigned++; }
0148: 
0149:     await logAction(ctx, user, {
0150:       action: "migrate",
0151:       module: "branches",
0152:       recordId: args.branchId,
0153:       recordLabel: branch.name,
0154:       details: `إسناد ${assigned} سجل قديم بدون فرع إلى ${branch.name}`,
0155:     });
0156:     return assigned;
0157:   },
0158: });
```

## convex/categories.ts

- Mutations: 2
- logAction calls: 2

### Mutation exports
- L13: `create`
- L32: `remove`

### logAction call sites
#### Call 1 at L21
```ts
0018:   handler: async (ctx, args) => {
0019:     const user = await requirePermission(ctx, "create_products");
0020:     const id = await ctx.db.insert("categories", args);
0021:     await logAction(ctx, user, {
0022:       action: "create",
0023:       module: "categories",
0024:       recordId: id,
0025:       recordLabel: args.name,
0026:       details: `إضافة فئة جديدة: ${args.name}`,
0027:     });
0028:     return id;
0029:   },
0030: });
0031: 
0032: export const remove = mutation({
0033:   args: { id: v.id("categories") },
```

#### Call 2 at L41
```ts
0038:     const linkedProduct = await ctx.db.query("products").withIndex("by_category", (q) => q.eq("categoryId", args.id)).first();
0039:     if (linkedProduct) throw new ConvexError("لا يمكن حذف فئة مرتبطة بمنتج");
0040:     await ctx.db.delete(args.id);
0041:     await logAction(ctx, user, {
0042:       action: "delete",
0043:       module: "categories",
0044:       recordId: args.id,
0045:       recordLabel: category.name,
0046:       details: `حذف الفئة: ${category.name}`,
0047:     });
0048:   },
0049: });
```

## convex/customerLedger.ts

- Mutations: 1
- logAction calls: 0

### Mutation exports
- L20: `initializeOpeningBalance`

## convex/customers.ts

- Mutations: 4
- logAction calls: 3

### Mutation exports
- L133: `create`
- L167: `update`
- L213: `setActive`
- L225: `remove`

### logAction call sites
#### Call 1 at L156
```ts
0153:     });
0154:     const financeSettings = await ctx.db.query("financeSettings").first();
0155:     if (financeSettings?.isInitialized && branchId) await initializeCustomerBalance(ctx, user, { customerId: id, branchId, receivableBalance: 0, advanceBalance: 0, totalPurchases: 0, date: financeSettings.cutoverDate, requestId: `new-customer:${id}`, notes: "تهيئة دفتر عميل جديد" });
0156:     await logAction(ctx, user, {
0157:       action: "create",
0158:       module: "customers",
0159:       recordId: id,
0160:       recordLabel: normalized.name,
0161:       details: `إضافة عميل جديد: ${normalized.name} - ${normalized.phone}`,
0162:     });
0163:     return id;
0164:   },
0165: });
0166: 
0167: export const update = mutation({
0168:   args: {
```

#### Call 2 at L203
```ts
0200:       normalized.notes === customer.notes;
0201:     if (customerUnchanged) return;
0202:     await ctx.db.patch(id, normalized);
0203:     await logAction(ctx, user, {
0204:       action: "update",
0205:       module: "customers",
0206:       recordId: id,
0207:       recordLabel: normalized.name,
0208:       details: `تحديث بيانات العميل: ${customer.name} ← ${normalized.name}`,
0209:     });
0210:   },
0211: });
0212: 
0213: export const setActive = mutation({
0214:   args: { id: v.id("customers"), isActive: v.boolean() },
0215:   handler: async (ctx, args) => {
```

#### Call 3 at L222
```ts
0219:     assertBranchAccess(user, customer);
0220:     if (customer.isActive === args.isActive) return;
0221:     await ctx.db.patch(args.id, { isActive: args.isActive });
0222:     await logAction(ctx, user, { action: args.isActive ? "activate" : "deactivate", module: "customers", recordId: args.id, recordLabel: customer.name, details: `${args.isActive ? "تفعيل" : "تعطيل"} العميل ${customer.name}` });
0223:   },
0224: });
0225: export const remove = mutation({ args: { id: v.id("customers") }, handler: async () => { throw new ConvexError("استخدم تعطيل العميل بدلاً من الحذف"); } });
```

## convex/deliveries.ts

- Mutations: 9
- logAction calls: 5

### Mutation exports
- L47: `create`
- L78: `updateStatus`
- L109: `update`
- L139: `remove`
- L180: `createFromOrderInvoice`
- L220: `confirmDelivered`
- L248: `createCodSettlement`
- L250: `reverseCodSettlement`
- L252: `reverseConfirmation`

### logAction call sites
#### Call 1 at L99
```ts
0096:     if (args.status === "returned") patch.cancellationReason = args.reason?.trim();
0097:     if (args.notes) patch.notes = args.notes;
0098:     await ctx.db.patch(args.id, patch);
0099:     await logAction(ctx, user, {
0100:       action: "update",
0101:       module: "deliveries",
0102:       recordId: args.id,
0103:       recordLabel: delivery.deliveryNumber,
0104:       details: `تحديث حالة التوصيل ${delivery.deliveryNumber} إلى: ${args.status}`,
0105:     });
0106:   },
0107: });
0108: 
0109: export const update = mutation({
0110:   args: {
0111:     id: v.id("deliveries"),
```

#### Call 2 at L129
```ts
0126:     if (delivery.status !== "pending") throw new ConvexError("لا يمكن تعديل البيانات اللوجستية بعد الشحن");
0127:     const { id, ...rest } = args;
0128:     await ctx.db.patch(id, rest);
0129:     await logAction(ctx, user, {
0130:       action: "update",
0131:       module: "deliveries",
0132:       recordId: args.id,
0133:       recordLabel: delivery.deliveryNumber,
0134:       details: `تعديل بيانات التوصيل ${delivery.deliveryNumber}`,
0135:     });
0136:   },
0137: });
0138: 
0139: export const remove = mutation({ args: { id: v.id("deliveries") }, handler: async () => { throw new ConvexError("استخدم تحديث الحالة إلى ملغاة مع إدخال السبب"); } });
0140: 
0141: export const getStats = query({
```

#### Call 3 at L216
```ts
0213:     else await ctx.db.patch(order._id,{appliedDeposit:roundMoney(order.appliedDeposit??0),linkedInvoiceId:invoice._id});
0214:     const deliveryNumber=await nextDocumentNumber(ctx,"delivery");
0215:     const id=await ctx.db.insert("deliveries",{deliveryNumber,orderId:order._id,orderNumber:order.orderNumber,invoiceId:invoice._id,invoiceNumber:invoice.invoiceNumber,customerId:customer._id,customerName:customer.name,customerPhone:customer.phone,city:normalized.city,address:normalized.address,items:invoice.items.map(i=>({productName:i.productName,quantity:i.quantity,unitPrice:i.unitPrice})),totalAmount:net,grandTotal:net,paymentMethod:remaining===0?"prepaid":paid>0?"partial":"cod",codAmount:remaining,prepaidAmount:paid,shippingCompany:normalized.shippingCompany,trackingNumber:normalized.trackingNumber,shippingCost:normalized.expectedCarrierFee,expectedCarrierFee:normalized.expectedCarrierFee,status:"pending",expectedDate:normalized.expectedDate,notes:normalized.notes,branchId,accountingVersion:2,requestId,idempotencyKey,requestFingerprint,createdBy:user.userId});
0216:     await logAction(ctx,user,{action:"create",module:"deliveries",recordId:id,recordLabel:deliveryNumber,details:`ربط ${order.orderNumber} بالفاتورة ${invoice.invoiceNumber}`}); return id;
0217:   }
0218: });
0219: 
0220: export const confirmDelivered=mutation({args:{deliveryId:v.id("deliveries"),codClearingAccountId:v.optional(v.id("financialAccounts")),date:v.string(),requestId:v.string(),notes:v.optional(v.string())},handler:async(ctx,args)=>{
0221:   const user=await requirePermission(ctx,"confirm_cod_deliveries"),requestId=normalize(args.requestId,"معرف الطلب"),notes=args.notes?.trim()||undefined;
0222:   const fp=fingerprint({deliveryId:String(args.deliveryId),account:args.codClearingAccountId?String(args.codClearingAccountId):undefined,date:args.date,notes});
0223:   const key=`delivery-confirm:${args.deliveryId}:${requestId}`;
0224:   const prior=await ctx.db.query("deliveryConfirmations").withIndex("by_idempotency",q=>q.eq("idempotencyKey",key)).unique();
0225:   if(prior){if(prior.requestFingerprint!==fp)throw new ConvexError("أعيد استخدام requestId ببيانات مختلفة");return prior._id;}
0226:   const delivery=await ctx.db.get(args.deliveryId);if(!delivery||delivery.accountingVersion!==2||!delivery.branchId||!delivery.invoiceId||!delivery.customerId||!delivery.orderId)throw new ConvexError("التوصيل غير مؤهل");
0227:   if(delivery.currentConfirmationId)throw new ConvexError("يوجد تأكيد منشور بالفعل");if(delivery.status!=="shipped")throw new ConvexError("يجب شحن التوصيل أولاً");
0228:   if(user.role!=="admin"&&user.role!=="accountant"&&user.branchId!==delivery.branchId)throw new ConvexError("ليس لديك صلاحية لفرع التوصيل");await requireFinanceInitialized(ctx,args.date);
```

#### Call 4 at L236
```ts
0233:   let financialTransactionId:Id<"financialTransactions">|undefined,customerLedgerEntryId:Id<"customerLedgerEntries">|undefined;
0234:   if(cod>0){if(!args.codClearingAccountId)throw new ConvexError("اختر حساب COD");const account=await requireActiveFinancialAccount(ctx,args.codClearingAccountId);if(account.type!=="cod_clearing"||account.branchId!==delivery.branchId)throw new ConvexError("حساب COD غير صالح للفرع");const posted=await postFinancialTransaction(ctx,user,{type:"delivery_cod_collection",requestId,date:args.date,amount:cod,description:`تحصيل COD ${delivery.deliveryNumber}`,branchId:delivery.branchId,referenceType:"delivery",referenceId:String(delivery._id),referenceNumber:delivery.deliveryNumber,customerId:delivery.customerId,movements:[{accountId:account._id,signedAmount:cod}]});financialTransactionId=posted.transactionId;const ledger=await postCustomerLedgerEntry(ctx,user,{type:"delivery_cod_collection",requestId:`${requestId}:ledger`,customerId:delivery.customerId,branchId:delivery.branchId,date:args.date,receivableDelta:-cod,advanceDelta:0,purchasesDelta:0,description:`تحصيل COD ${delivery.deliveryNumber}`,referenceType:"delivery",referenceId:String(delivery._id),referenceNumber:delivery.deliveryNumber});customerLedgerEntryId=ledger.entryId;const paid=roundMoney(invoice.paid+cod),remaining=roundMoney(invoice.remaining-cod);await ctx.db.patch(invoice._id,{paid,remaining,status:deriveInvoiceStatus({netTotal:net,creditedTotal:0,paid,remaining})});}
0235:   const confirmationId=await ctx.db.insert("deliveryConfirmations",{deliveryId:delivery._id,deliveryNumber:delivery.deliveryNumber,attemptNumber:attempts.length+1,branchId:delivery.branchId,invoiceId:delivery.invoiceId,orderId:delivery.orderId,customerId:delivery.customerId,codAmount:cod,codClearingAccountId:args.codClearingAccountId,status:"posted",date:args.date,requestId,idempotencyKey:key,requestFingerprint:fp,financialTransactionId,customerLedgerEntryId,createdBy:user.userId,createdAt:Date.now()});
0236:   await ctx.db.patch(delivery._id,{status:"delivered",deliveredDate:args.date,currentConfirmationId:confirmationId,codClearingAccountId:args.codClearingAccountId,codFinancialTransactionId:financialTransactionId,codCustomerLedgerEntryId:customerLedgerEntryId,confirmationRequestId:requestId,confirmationFingerprint:fp,reversedAt:undefined,reversedBy:undefined,reversalReason:undefined,reversalDate:undefined,reversalRequestId:undefined,reversalFingerprint:undefined,reversalFinancialTransactionId:undefined,reversalCustomerLedgerEntryId:undefined,notes:notes??delivery.notes});await ctx.db.patch(order._id,{status:"delivered"});await applyOrderStatsChange(ctx,order,{...order,status:"delivered"});await logAction(ctx,user,{action:"confirm",module:"deliveries",recordId:delivery._id,recordLabel:delivery.deliveryNumber,details:`تأكيد التسليم - المحاولة ${attempts.length+1}`});return confirmationId;
0237: }});
0238: 
0239: export const accountPicker=query({args:{branchId:v.id("branches"),purpose:v.union(v.literal("confirmation_cod"),v.literal("settlement_source"),v.literal("settlement_destination"))},handler:async(ctx,args)=>{const permission=args.purpose==="confirmation_cod"?"confirm_cod_deliveries":"settle_cod_collections";const user=await requirePermission(ctx,permission);const branchId=selectableBranch(user,args.branchId);const types=args.purpose==="settlement_destination"?["cash","bank"]:["cod_clearing"];const rows=await ctx.db.query("financialAccounts").withIndex("by_branch",q=>q.eq("branchId",branchId)).collect();return rows.filter(x=>x.isActive&&types.includes(x.type)).map(x=>({_id:x._id,name:x.name,type:x.type,branchId:x.branchId}));}});
0240: 
0241: export const creationOptions=query({args:{branchId:v.id("branches")},handler:async(ctx,args)=>{const user=await requireModulePermission(ctx,"create_deliveries","deliveries"),branchId=selectableBranch(user,args.branchId);const orders=await ctx.db.query("orders").withIndex("by_branch_status",q=>q.eq("branchId",branchId).eq("status","ready")).collect();const invoices=await ctx.db.query("invoices").withIndex("by_branch_status",q=>q.eq("branchId",branchId)).collect();return orders.filter(o=>o.customerId).map(o=>({orderId:o._id,orderNumber:o.orderNumber,customerId:o.customerId!,customerName:o.customerName,total:o.total,unappliedDeposit:roundMoney(o.deposit-(o.appliedDeposit??0)),items:o.items.map(i=>({productName:i.productName,quantity:i.quantity,unitPrice:i.unitPrice})),invoices:invoices.filter(i=>i.customerId===o.customerId&&i.status!=="cancelled"&&!i.status.includes("return")&&(i.creditedTotal??0)===0).map(i=>({invoiceId:i._id,invoiceNumber:i.invoiceNumber,netTotal:i.netTotal??i.total,paid:i.paid,remaining:i.remaining}))}));}});
0242: 
0243: export const confirmationHistory=query({args:{deliveryId:v.id("deliveries")},handler:async(ctx,args)=>{const user=await requireModulePermission(ctx,"view_deliveries","deliveries"),delivery=await ctx.db.get(args.deliveryId);if(!delivery)throw new ConvexError("التوصيل غير موجود");assertBranchAccess(user,delivery);const rows=await ctx.db.query("deliveryConfirmations").withIndex("by_delivery",q=>q.eq("deliveryId",delivery._id)).collect();return rows.map(c=>({attemptNumber:c.attemptNumber,status:c.status,date:c.date,codAmount:c.codAmount,reversalReason:c.reversalReason,reversalDate:c.reversalDate}));}});
0244: 
0245: export const listPaginated=query({args:{branchId:v.id("branches"),paginationOpts:paginationOptsValidator},handler:async(ctx,args)=>{const user=await requireModulePermission(ctx,"view_deliveries","deliveries"),branchId=selectableBranch(user,args.branchId);const page=await ctx.db.query("deliveries").withIndex("by_branch_status",q=>q.eq("branchId",branchId)).order("desc").paginate(args.paginationOpts);return{...page,page:page.page.map(d=>({_id:d._id,deliveryNumber:d.deliveryNumber,invoiceNumber:d.invoiceNumber,orderNumber:d.orderNumber,customerName:d.customerName,city:d.city,status:d.status,codAmount:d.codAmount,prepaidAmount:d.prepaidAmount,shippingCompany:d.shippingCompany,deliveredDate:d.deliveredDate,branchId:d.branchId,accountingVersion:d.accountingVersion,codSettlementId:d.codSettlementId}))};}});
0246: export const unsettled=query({args:{branchId:v.id("branches"),sourceAccountId:v.id("financialAccounts")},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"view_cod_settlements"),branchId=selectableBranch(user,args.branchId);const account=await requireActiveFinancialAccount(ctx,args.sourceAccountId);if(account.branchId!==branchId||account.type!=="cod_clearing")throw new ConvexError("حساب COD غير صالح");const rows=await ctx.db.query("deliveries").withIndex("by_cod_account_status",q=>q.eq("codClearingAccountId",account._id).eq("status","delivered")).collect();return rows.filter(d=>d.accountingVersion===2&&!d.codSettlementId&&(d.codAmount??0)>0).map(d=>({_id:d._id,deliveryNumber:d.deliveryNumber,invoiceNumber:d.invoiceNumber,codAmount:d.codAmount,deliveredDate:d.deliveredDate,branchId:d.branchId,codClearingAccountId:d.codClearingAccountId}));}});
0247: 
0248: export const createCodSettlement=mutation({args:{deliveryIds:v.array(v.id("deliveries")),sourceAccountId:v.id("financialAccounts"),destinationAccountId:v.id("financialAccounts"),feeAmount:v.number(),date:v.string(),branchId:v.id("branches"),requestId:v.string(),notes:v.optional(v.string())},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"settle_cod_collections"),branchId=selectableBranch(user,args.branchId),requestId=normalize(args.requestId,"معرف الطلب");const ids=[...args.deliveryIds].sort().map(String);assertMoneyInput(args.feeAmount, "رسوم التسوية");const fp=fingerprint({ids,source:String(args.sourceAccountId),destination:String(args.destinationAccountId),fee:args.feeAmount,date:args.date,branch:String(branchId),notes:args.notes?.trim()||undefined}),key=`cod-settlement:${user.userId}:${requestId}`;const prior=await ctx.db.query("codSettlements").withIndex("by_idempotency_key",q=>q.eq("idempotencyKey",key)).unique();if(prior){if(prior.requestFingerprint!==fp)throw new ConvexError("أعيد استخدام requestId ببيانات مختلفة");return prior._id;}if(args.deliveryIds.length===0||new Set(ids).size!==ids.length)throw new ConvexError("اختر توصيلات فريدة");await requireFinanceInitialized(ctx,args.date);const [source,destination]=await Promise.all([requireActiveFinancialAccount(ctx,args.sourceAccountId),requireActiveFinancialAccount(ctx,args.destinationAccountId)]);if(source.type!=="cod_clearing"||!["cash","bank"].includes(destination.type)||source.branchId!==branchId||destination.branchId!==branchId)throw new ConvexError("حسابات التسوية غير صالحة");const deliveries=await Promise.all(args.deliveryIds.map(id=>ctx.db.get(id)));if(deliveries.some(d=>!d||d.accountingVersion!==2||d.status!=="delivered"||d.branchId!==branchId||d.codClearingAccountId!==source._id||d.codSettlementId||!d.invoiceId||!d.currentConfirmationId||(d.codAmount??0)<=0))throw new ConvexError("أحد التوصيلات غير مؤهل للتسوية");const gross=roundMoney(deliveries.reduce((s,d)=>s+(d?.codAmount??0),0)),fee=roundMoney(args.feeAmount),net=roundMoney(gross-fee);if(!Number.isFinite(fee)||fee<0||fee>gross)throw new ConvexError("رسوم الناقل غير صالحة");const available=await calculateAvailableBalance(ctx,source._id,args.date);if(available<gross)throw new ConvexError("رصيد COD المتاح للتسوية غير كافٍ");const posted=await postFinancialTransaction(ctx,user,{type:"cod_settlement",requestId,date:args.date,amount:gross,feeAmount:fee,description:`تسوية تحصيلات COD`,branchId,referenceType:"cod_settlement",movements:[{accountId:source._id,signedAmount:-gross},{accountId:destination._id,signedAmount:net}]});const settlementNumber=await nextDocumentNumber(ctx,"codSettlement",new Date(`${args.date}T00:00:00Z`));const settlementId=await ctx.db.insert("codSettlements",{settlementNumber,branchId,sourceAccountId:source._id,destinationAccountId:destination._id,grossAmount:gross,feeAmount:fee,netAmount:net,date:args.date,status:"posted",requestId,idempotencyKey:key,requestFingerprint:fp,financialTransactionId:posted.transactionId,createdBy:user.userId,createdAt:Date.now(),notes:args.notes?.trim()||undefined});for(const d of deliveries){if(!d||!d.invoiceId||!d.invoiceNumber)throw new ConvexError("بيانات التوصيل ناقصة");await ctx.db.insert("codSettlementItems",{settlementId,confirmationId:d.currentConfirmationId,deliveryId:d._id,deliveryNumber:d.deliveryNumber,invoiceId:d.invoiceId,invoiceNumber:d.invoiceNumber,codAmount:d.codAmount??0,branchId,date:args.date});await ctx.db.patch(d._id,{codSettlementId:settlementId});}return settlementId;}});
```

#### Call 5 at L253
```ts
0250: export const reverseCodSettlement=mutation({args:{settlementId:v.id("codSettlements"),reason:v.string(),date:v.string(),requestId:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"reverse_cod_collections"),reason=normalize(args.reason,"سبب العكس"),requestId=normalize(args.requestId,"معرف الطلب"),fp=fingerprint({settlement:String(args.settlementId),reason,date:args.date});const settlement=await ctx.db.get(args.settlementId);if(!settlement)throw new ConvexError("التسوية غير موجودة");if(settlement.reversalRequestId===requestId){if(settlement.reversalFingerprint!==fp)throw new ConvexError("أعيد استخدام requestId ببيانات مختلفة");return settlement.reversalFinancialTransactionId;}if(settlement.status==="reversed")throw new ConvexError("سبق عكس التسوية بطلب مختلف");await requireFinanceInitialized(ctx,args.date);const reversal=await reversePostedFinancialTransaction(ctx,user,{transactionId:settlement.financialTransactionId,reason,date:args.date,requestId,referenceType:"cod_settlement",referenceId:String(settlement._id),referenceNumber:settlement.settlementNumber});const items=await ctx.db.query("codSettlementItems").withIndex("by_settlement",q=>q.eq("settlementId",settlement._id)).collect();for(const item of items)await ctx.db.patch(item.deliveryId,{codSettlementId:undefined});await ctx.db.patch(settlement._id,{status:"reversed",reversedAt:Date.now(),reversedBy:user.userId,reversalReason:reason,reversalDate:args.date,reversalRequestId:requestId,reversalFingerprint:fp,reversalFinancialTransactionId:reversal});return reversal;}});
0251: 
0252: export const reverseConfirmation=mutation({args:{deliveryId:v.id("deliveries"),reason:v.string(),date:v.string(),requestId:v.string()},handler:async(ctx,args)=>{
0253:  const user=await requirePermission(ctx,"reverse_cod_collections"),reason=normalize(args.reason,"سبب العكس"),requestId=normalize(args.requestId,"معرف الطلب"),fp=fingerprint({delivery:String(args.deliveryId),reason,date:args.date});const d=await ctx.db.get(args.deliveryId);if(!d||d.status!=="delivered"||!d.currentConfirmationId||!d.invoiceId||!d.orderId||!d.customerId||!d.branchId)throw new ConvexError("التوصيل غير مؤهل للعكس");const confirmation=await ctx.db.get(d.currentConfirmationId);if(!confirmation||confirmation.status!=="posted")throw new ConvexError("تأكيد التسليم الحالي غير صالح");if(confirmation.reversalRequestId===requestId){if(confirmation.reversalFingerprint!==fp)throw new ConvexError("أعيد استخدام requestId ببيانات مختلفة");return confirmation.reversalFinancialTransactionId??confirmation._id;}if(confirmation.reversalRequestId)throw new ConvexError("سبق العكس بطلب مختلف");const [settled,invoice,returns]=await Promise.all([ctx.db.query("codSettlementItems").withIndex("by_confirmation",q=>q.eq("confirmationId",confirmation._id)).first(),ctx.db.get(d.invoiceId),ctx.db.query("salesReturns").withIndex("by_invoice",q=>q.eq("invoiceId",d.invoiceId!)).filter(q=>q.eq(q.field("status"),"posted")).first()]);if(settled||returns||!invoice)throw new ConvexError("آثار لاحقة تمنع العكس");const cod=confirmation.codAmount;if(roundMoney(invoice.paid)!==roundMoney((d.prepaidAmount??0)+cod)||roundMoney(invoice.remaining)!==0)throw new ConvexError("تغيرت الفاتورة بعد التحصيل ولا يمكن العكس");await requireFinanceInitialized(ctx,args.date);let financial:Id<"financialTransactions">|undefined,ledger:Id<"customerLedgerEntries">|undefined;if(cod>0){if(!confirmation.financialTransactionId)throw new ConvexError("معاملة COD مفقودة");financial=await reversePostedFinancialTransaction(ctx,user,{transactionId:confirmation.financialTransactionId,reason,date:args.date,requestId,referenceType:"delivery_confirmation",referenceId:String(confirmation._id),referenceNumber:d.deliveryNumber});const entry=await postCustomerLedgerEntry(ctx,user,{type:"delivery_cod_reversal",requestId:`${requestId}:ledger`,customerId:d.customerId,branchId:d.branchId,date:args.date,receivableDelta:cod,advanceDelta:0,purchasesDelta:0,description:`عكس تحصيل ${d.deliveryNumber}: ${reason}`,referenceType:"delivery_confirmation_reversal",referenceId:String(confirmation._id),referenceNumber:d.deliveryNumber,originalEntryId:confirmation.customerLedgerEntryId});ledger=entry.entryId;const paid=roundMoney(invoice.paid-cod),remaining=roundMoney(invoice.remaining+cod);await ctx.db.patch(invoice._id,{paid,remaining,status:deriveInvoiceStatus({netTotal:invoice.netTotal??invoice.total,creditedTotal:invoice.creditedTotal??0,paid,remaining})});}const order=await ctx.db.get(d.orderId);if(!order)throw new ConvexError("الطلب المرتبط بالتوصيل غير موجود");await ctx.db.patch(d.orderId,{status:"ready"});await applyOrderStatsChange(ctx,order,{...order,status:"ready"});await ctx.db.patch(confirmation._id,{status:"reversed",reversedAt:Date.now(),reversedBy:user.userId,reversalReason:reason,reversalDate:args.date,reversalRequestId:requestId,reversalFingerprint:fp,reversalFinancialTransactionId:financial,reversalCustomerLedgerEntryId:ledger});await ctx.db.patch(d._id,{status:"shipped",deliveredDate:undefined,currentConfirmationId:undefined,reversedAt:Date.now(),reversedBy:user.userId,reversalReason:reason,reversalDate:args.date,reversalRequestId:requestId,reversalFingerprint:fp,reversalFinancialTransactionId:financial,reversalCustomerLedgerEntryId:ledger});await logAction(ctx,user,{action:"reverse",module:"deliveries",recordId:d._id,recordLabel:d.deliveryNumber,details:`عكس محاولة التأكيد ${confirmation.attemptNumber}: ${reason}`});return financial??confirmation._id;
0254: }});
0255: 
0256: export const listSettlements=query({args:{branchId:v.id("branches"),paginationOpts:paginationOptsValidator},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"view_cod_settlements"),branchId=selectableBranch(user,args.branchId),page=await ctx.db.query("codSettlements").withIndex("by_branch_date",q=>q.eq("branchId",branchId)).order("desc").paginate(args.paginationOpts);return{...page,page:page.page.map(s=>({_id:s._id,settlementNumber:s.settlementNumber,date:s.date,status:s.status,grossAmount:s.grossAmount,feeAmount:s.feeAmount,netAmount:s.netAmount,branchId:s.branchId,reversalReason:s.reversalReason}))};}});
0257: export const legacyReview=query({args:{branchId:v.id("branches")},handler:async(ctx,args)=>{const user=await requireModulePermission(ctx,"view_deliveries","deliveries"),branchId=selectableBranch(user,args.branchId),rows=await ctx.db.query("deliveries").withIndex("by_branch_status",q=>q.eq("branchId",branchId)).collect();return rows.filter(d=>d.accountingVersion!==2).map(d=>({deliveryNumber:d.deliveryNumber,status:d.status,issues:[d.status==="delivered"&&(d.codAmount??0)>0&&!d.codFinancialTransactionId?"COD مسلم بلا حركة مالية":undefined,!d.invoiceId?"بلا فاتورة":undefined,!d.customerId?"بلا عميل مسجل":undefined,!/^DEL-\d{4}-\d{5}$/.test(d.deliveryNumber)?"رقم غير متوافق":undefined].filter((x):x is string=>Boolean(x)),reviewStatus:"تحتاج مراجعة يدوية"}));}});
0258: export const printDelivery=query({args:{deliveryId:v.id("deliveries")},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"print_cod_settlements"),d=await ctx.db.get(args.deliveryId);if(!d)throw new ConvexError("التوصيل غير موجود");if(user.role!=="admin"&&user.role!=="accountant"&&user.branchId!==d.branchId)throw new ConvexError("ليس لديك صلاحية لهذا الفرع");const creator=d.createdBy;const employee=creator?(await ctx.db.query("userProfiles").withIndex("by_user",q=>q.eq("userId",creator)).first()??await ctx.db.query("userProfiles").withIndex("by_token",q=>q.eq("tokenIdentifier",creator)).first()):null;return{deliveryNumber:d.deliveryNumber,orderNumber:d.orderNumber,invoiceNumber:d.invoiceNumber,customerName:d.customerName,customerPhone:d.customerPhone,city:d.city,address:d.address,items:d.items,totalAmount:d.totalAmount,prepaidAmount:d.prepaidAmount,codAmount:d.codAmount,expectedCarrierFee:d.expectedCarrierFee,shippingCompany:d.shippingCompany,trackingNumber:d.trackingNumber,status:d.status,deliveredDate:d.deliveredDate,employeeName:employee?.name??"مستخدم غير معروف",reversalReason:d.reversalReason};}});
0259: export const printCodSettlement=query({args:{settlementId:v.id("codSettlements")},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"print_cod_settlements"),s=await ctx.db.get(args.settlementId);if(!s)throw new ConvexError("التسوية غير موجودة");selectableBranch(user,s.branchId);const [source,destination,items]=await Promise.all([ctx.db.get(s.sourceAccountId),ctx.db.get(s.destinationAccountId),ctx.db.query("codSettlementItems").withIndex("by_settlement",q=>q.eq("settlementId",s._id)).collect()]);return{settlementNumber:s.settlementNumber,date:s.date,status:s.status,sourceAccountName:source?.name??"—",destinationAccountName:destination?.name??"—",grossAmount:s.grossAmount,feeAmount:s.feeAmount,netAmount:s.netAmount,notes:s.notes,reversalReason:s.reversalReason,items:items.map(i=>({deliveryNumber:i.deliveryNumber,invoiceNumber:i.invoiceNumber,codAmount:i.codAmount}))};}});
```

## convex/employees.ts

- Mutations: 8
- logAction calls: 7

### Mutation exports
- L26: `createFirstAdmin`
- L195: `setWorkingBranch`
- L217: `create`
- L274: `update`
- L351: `toggleActive`
- L385: `remove`
- L422: `renewInvitation`
- L450: `updatePermissions`

### logAction call sites
#### Call 1 at L207
```ts
0204:       throw new ConvexError("الفرع غير موجود أو غير نشط");
0205:     }
0206:     await ctx.db.patch(user.employeeId, { branchId: args.branchId });
0207:     await logAction(ctx, { ...user, branchId: args.branchId }, {
0208:       action: "select_branch",
0209:       module: "branches",
0210:       recordId: args.branchId,
0211:       recordLabel: branch.name,
0212:       details: `اختيار فرع العمل: ${branch.name}`,
0213:     });
0214:   },
0215: });
0216: 
0217: export const create = mutation({
0218:   args: {
0219:     name: v.string(),
```

#### Call 2 at L263
```ts
0260:       isActive: args.isActive ?? true,
0261:       inviteExpiresAt: Date.now() + INVITE_TTL_MS,
0262:     });
0263:     await logAction(ctx, user, {
0264:       action: "create",
0265:       module: "employees",
0266:       recordId: id,
0267:       recordLabel: args.name,
0268:       details: `إضافة موظف جديد: ${args.name} (${args.role})`,
0269:     });
0270:     return { id, inviteCode: String(id), email };
0271:   },
0272: });
0273: 
0274: export const update = mutation({
0275:   args: {
```

#### Call 3 at L341
```ts
0338:       permissions,
0339:       isActive: args.isActive,
0340:     });
0341:     await logAction(ctx, user, {
0342:       action: "update",
0343:       module: "employees",
0344:       recordId: id,
0345:       recordLabel: args.name,
0346:       details: `تعديل بيانات الموظف: ${args.name}`,
0347:     });
0348:   },
0349: });
0350: 
0351: export const toggleActive = mutation({
0352:   args: { id: v.id("userProfiles") },
0353:   handler: async (ctx, args) => {
```

#### Call 4 at L375
```ts
0372:     }
0373: 
0374:     await ctx.db.patch(args.id, { isActive: !emp.isActive });
0375:     await logAction(ctx, user, {
0376:       action: "update",
0377:       module: "employees",
0378:       recordId: args.id,
0379:       recordLabel: emp.name,
0380:       details: `${emp.isActive ? "إيقاف" : "تفعيل"} الموظف: ${emp.name}`,
0381:     });
0382:   },
0383: });
0384: 
0385: export const remove = mutation({
0386:   args: { id: v.id("userProfiles") },
0387:   handler: async (ctx, args) => {
```

#### Call 5 at L412
```ts
0409:       isActive: false,
0410:       inviteExpiresAt: undefined,
0411:     });
0412:     await logAction(ctx, user, {
0413:       action: "deactivate",
0414:       module: "employees",
0415:       recordId: args.id,
0416:       recordLabel: emp.name,
0417:       details: `إلغاء تنشيط الموظف مع الاحتفاظ بسجل الحساب: ${emp.name}`,
0418:     });
0419:   },
0420: });
0421: 
0422: export const renewInvitation = mutation({
0423:   args: { id: v.id("userProfiles") },
0424:   handler: async (ctx, args) => {
```

#### Call 6 at L439
```ts
0436:       isActive: true,
0437:       inviteExpiresAt: Date.now() + INVITE_TTL_MS,
0438:     });
0439:     await logAction(ctx, user, {
0440:       action: "renew_invitation",
0441:       module: "employees",
0442:       recordId: args.id,
0443:       recordLabel: employee.name,
0444:       details: `تجديد دعوة الموظف: ${employee.name}`,
0445:     });
0446:     return { inviteCode: String(args.id), email: employee.email };
0447:   },
0448: });
0449: 
0450: export const updatePermissions = mutation({
0451:   args: {
```

#### Call 7 at L471
```ts
0468:       throw new ConvexError("لا يمكنك منح صلاحيات أعلى من صلاحياتك");
0469:     }
0470:     await ctx.db.patch(args.id, { permissions });
0471:     await logAction(ctx, user, {
0472:       action: "update",
0473:       module: "employees",
0474:       recordId: args.id,
0475:       recordLabel: emp.name,
0476:       details: `تحديث صلاحيات الموظف: ${emp.name}`,
0477:     });
0478:   },
0479: });
```

## convex/expenses.ts

- Mutations: 3
- logAction calls: 2

### Mutation exports
- L17: `create`
- L55: `voidExpense`
- L82: `remove`

### logAction call sites
#### Call 1 at L44
```ts
0041:     });
0042:     const posted = await postFinancialTransaction(ctx, user, { type: "expense_payment", requestId: args.requestId, date: args.date, amount: args.amount, description: `مصروف: ${title}`, branchId, referenceType: "expense", referenceId: String(id), movements: [{ accountId: account._id, signedAmount: -args.amount }] });
0043:     await ctx.db.patch(id, { financialTransactionId: posted.transactionId });
0044:     await logAction(ctx, user, {
0045:       action: "create",
0046:       module: "expenses",
0047:       recordId: id,
0048:       recordLabel: args.title,
0049:       details: `تسجيل مصروف: ${args.title} - ${args.amount} (${args.category})`,
0050:     });
0051:     return id;
0052:   },
0053: });
0054: 
0055: export const voidExpense = mutation({
0056:   args: { id: v.id("expenses"), reason: v.string(), date: v.string(), requestId: v.string() },
```

#### Call 2 at L77
```ts
0074:       if (!settings || expense.date >= settings.cutoverDate) throw new ConvexError("المصروف التشغيلي لا يحتوي على معاملة مالية");
0075:     }
0076:     await ctx.db.patch(args.id, { status: "voided", voidedAt: Date.now(), voidedBy: user.userId, voidReason: reason });
0077:     await logAction(ctx, user, { action: "void", module: "expenses", recordId: args.id, recordLabel: expense.title, details: `إبطال المصروف ${expense.title}: ${reason}` });
0078:     return expense.financialTransactionId ?? null;
0079:   },
0080: });
0081: export { voidExpense as void };
0082: export const remove = mutation({ args: { id: v.id("expenses") }, handler: async () => { throw new ConvexError("استخدم مسار إبطال المصروف مع إدخال السبب"); } });
0083: 
0084: export const getStats = query({
0085:   args: {},
0086:   handler: async (ctx) => {
0087:     const user = await requireModulePermission(ctx, "view_expenses", "expenses");
0088:     const all = await ctx.db.query("expenses").collect();
0089:     const expenses = filterByBranch(all, user);
```

## convex/finance.ts

- Mutations: 8
- logAction calls: 0

### Mutation exports
- L11: `createAccount`
- L25: `updateAccount`
- L33: `configureInitialization`
- L40: `postOpeningBalance`
- L53: `confirmInitialization`
- L58: `transferFunds`
- L64: `settleClearingAccount`
- L73: `reverseTransaction`

## convex/generalLedger.ts

- Mutations: 10
- logAction calls: 7

### Mutation exports
- L17: `initialize`
- L30: `enableFinancialPosting`
- L33: `createAccount`
- L34: `deactivateAccount`
- L35: `createOrOpenPeriod`
- L36: `closePeriod`
- L37: `reopenPeriod`
- L40: `confirmOpening`
- L41: `postManualJournal`
- L42: `reverseJournal`

### logAction call sites
#### Call 1 at L25
```ts
0022:  const ids=new Map<string,Id<"chartOfAccounts">>(); const now=Date.now();
0023:  for(const item of DEFAULT_CHART){const parentId=item.parentCode?ids.get(item.parentCode):undefined;if(item.parentCode&&!parentId)throw new ConvexError("قالب الدليل غير مرتب");const id=await ctx.db.insert("chartOfAccounts",{code:item.code,normalizedCode:item.code,nameAr:item.nameAr,parentId,accountClass:item.accountClass,normalSide:item.normalSide,isContra:item.isContra??false,isPosting:item.isPosting,isSystem:true,systemKey:item.systemKey,isActive:true,createdAt:now,createdBy:user.userId});ids.set(item.code,id);}
0024:  const id=await ctx.db.insert("generalLedgerSettings",{baseCurrency:"EGP",chartVersion:GENERAL_LEDGER_CHART_VERSION,status:"foundation_ready",operationalPostingEnabled:false,financialPostingEnabled:false,cutoverDate,initializedAt:now,initializedBy:user.userId,initializationRequestId:requestId,initializationFingerprint:fp});
0025:  await logAction(ctx,user,{action:"initialize",module:"general_ledger",recordId:String(id),details:"Foundation only; operational posting disabled"}); return {_id:id,status:"foundation_ready" as const,chartVersion:GENERAL_LEDGER_CHART_VERSION};
0026: }});
0027: export const availableBranches=query({args:{},handler:async ctx=>{const user=await requirePermission(ctx,"view_general_ledger");if(user.role==="admin"||user.role==="accountant"){return (await ctx.db.query("branches").collect()).filter(branch=>branch.isActive).map(branch=>({_id:branch._id,name:branch.name}));}if(!user.branchId)throw new ConvexError("المستخدم غير مربوط بفرع");const branch=await ctx.db.get(user.branchId);return branch&&branch.isActive?[{_id:branch._id,name:branch.name}]:[];}});
0028: export const status=query({args:{},handler:async ctx=>{await requirePermission(ctx,"view_general_ledger");const s=await ctx.db.query("generalLedgerSettings").first();return s?{initialized:true,baseCurrency:s.baseCurrency,chartVersion:s.chartVersion,status:s.status,operationalPostingEnabled:s.operationalPostingEnabled,financialPostingEnabled:s.financialPostingEnabled??false,financialPostingCutoverDate:s.financialPostingCutoverDate,financialPostingActivatedAt:s.financialPostingActivatedAt,cutoverDate:s.cutoverDate,initializedAt:s.initializedAt}:{initialized:false,operationalPostingEnabled:false,financialPostingEnabled:false};}});
0029: export const financialPostingReadinessStatus=query({args:{cutoverDate:v.string()},handler:async(ctx,args)=>{await requirePermission(ctx,"initialize_general_ledger");return financialPostingReadiness(ctx,args.cutoverDate);}});
0030: export const enableFinancialPosting=mutation({args:{cutoverDate:v.string(),requestId:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"initialize_general_ledger"),before=await ctx.db.query("generalLedgerSettings").first(),settings=await activateFinancialPosting(ctx,user,args);if(!before?.financialPostingEnabled)await logAction(ctx,user,{action:"activate_financial_posting",module:"general_ledger",recordId:String(settings._id),details:`Financial bridge cutover ${args.cutoverDate}`});return {enabled:settings.financialPostingEnabled??false,cutoverDate:settings.financialPostingCutoverDate};}});
0031: export const chart=query({args:{activeOnly:v.optional(v.boolean())},handler:async(ctx,args)=>{await requirePermission(ctx,"view_general_ledger");const rows=args.activeOnly===false?await ctx.db.query("chartOfAccounts").withIndex("by_active").collect():await ctx.db.query("chartOfAccounts").withIndex("by_active",q=>q.eq("isActive",true)).collect();return rows.map(a=>({_id:a._id,code:a.code,nameAr:a.nameAr,nameEn:a.nameEn,parentId:a.parentId,accountClass:a.accountClass,normalSide:a.normalSide,isContra:a.isContra,isPosting:a.isPosting,isSystem:a.isSystem,systemKey:a.systemKey,isActive:a.isActive}));}});
0032: export const accountPicker=query({args:{},handler:async ctx=>{await requirePermission(ctx,"view_general_ledger");const rows=await ctx.db.query("chartOfAccounts").withIndex("by_active",q=>q.eq("isActive",true)).collect();return rows.filter(a=>a.isPosting).map(a=>({_id:a._id,code:a.code,nameAr:a.nameAr,normalSide:a.normalSide}));}});
0033: export const createAccount=mutation({args:{code:v.string(),nameAr:v.string(),nameEn:v.optional(v.string()),parentId:v.id("chartOfAccounts"),normalSide:v.union(v.literal("debit"),v.literal("credit")),isContra:v.boolean()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"manage_chart_of_accounts"),code=args.code.replace(/\s+/g,"").toUpperCase(),nameAr=normalizeText(args.nameAr);if(!code)throw new ConvexError("الكود مطلوب");if(!nameAr)throw new ConvexError("اسم الحساب مطلوب");if(await ctx.db.query("chartOfAccounts").withIndex("by_code",q=>q.eq("normalizedCode",code)).unique())throw new ConvexError("كود الحساب مكرر");const parent=await ctx.db.get(args.parentId);if(!parent||parent.isPosting||!parent.isActive)throw new ConvexError("الحساب الأب غير صالح");const classSide=parent.accountClass==="asset"||parent.accountClass==="expense"?"debit":"credit",expected=args.isContra?(classSide==="debit"?"credit":"debit"):classSide;if(args.normalSide!==expected)throw new ConvexError("الطبيعة المحاسبية لا تطابق فئة الحساب");const id=await ctx.db.insert("chartOfAccounts",{code,normalizedCode:code,nameAr,nameEn:args.nameEn?normalizeText(args.nameEn):undefined,parentId:parent._id,accountClass:parent.accountClass,normalSide:args.normalSide,isContra:args.isContra,isPosting:true,isSystem:false,isActive:true,createdAt:Date.now(),createdBy:user.userId});await logAction(ctx,user,{action:"create",module:"general_ledger",recordId:String(id),recordLabel:code,details:`account ${nameAr}`});return id;}});
0034: export const deactivateAccount=mutation({args:{accountId:v.id("chartOfAccounts")},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"manage_chart_of_accounts"),a=await ctx.db.get(args.accountId);if(!a||a.isSystem)throw new ConvexError("لا يمكن تعطيل حساب نظام");await ctx.db.patch(a._id,{isActive:false,deactivatedAt:Date.now(),deactivatedBy:user.userId});await logAction(ctx,user,{action:"deactivate",module:"general_ledger",recordId:String(a._id),recordLabel:a.code});return {accountId:a._id,isActive:false};}});
0035: export const createOrOpenPeriod=mutation({args:{periodKey:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"close_accounting_periods");if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.periodKey))throw new ConvexError("مفتاح الفترة غير صالح");const existing=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",args.periodKey)).unique();if(existing){if(existing.status==="closed")throw new ConvexError("استخدم إعادة الفتح للفترة المغلقة");return existing._id;}const startDate=`${args.periodKey}-01`,d=new Date(`${startDate}T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);const endDate=d.toISOString().slice(0,10);const id=await ctx.db.insert("accountingPeriods",{periodKey:args.periodKey,startDate,endDate,status:"open"});await logAction(ctx,user,{action:"open_period",module:"general_ledger",recordId:String(id),recordLabel:args.periodKey});return id;}});
0036: export const closePeriod=mutation({args:{periodKey:v.string(),reason:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"close_accounting_periods"),p=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",args.periodKey)).unique(),reason=normalizeText(args.reason);if(!p||p.status!=="open"||!reason)throw new ConvexError("الفترة أو السبب غير صالح");const balances=await ctx.db.query("generalLedgerPeriodBalances").withIndex("by_period",q=>q.eq("periodKey",args.periodKey)).collect();const d=balances.reduce((s,x)=>s+x.debitTotal,0),c=balances.reduce((s,x)=>s+x.creditTotal,0);if(Math.round(d*100)!==Math.round(c*100))throw new ConvexError("الفترة غير متوازنة");await ctx.db.patch(p._id,{status:"closed",closedAt:Date.now(),closedBy:user.userId,closeReason:reason});await logAction(ctx,user,{action:"close_period",module:"general_ledger",recordId:String(p._id),details:reason});return p._id;}});
0037: export const reopenPeriod=mutation({args:{periodKey:v.string(),reason:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"reopen_accounting_periods"),p=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",args.periodKey)).unique(),reason=normalizeText(args.reason);if(!p||p.status!=="closed"||!reason)throw new ConvexError("الفترة أو السبب غير صالح");await ctx.db.patch(p._id,{status:"open",reopenedAt:Date.now(),reopenedBy:user.userId,reopenReason:reason});await logAction(ctx,user,{action:"reopen_period",module:"general_ledger",recordId:String(p._id),details:reason});return p._id;}});
```

#### Call 2 at L30
```ts
0027: export const availableBranches=query({args:{},handler:async ctx=>{const user=await requirePermission(ctx,"view_general_ledger");if(user.role==="admin"||user.role==="accountant"){return (await ctx.db.query("branches").collect()).filter(branch=>branch.isActive).map(branch=>({_id:branch._id,name:branch.name}));}if(!user.branchId)throw new ConvexError("المستخدم غير مربوط بفرع");const branch=await ctx.db.get(user.branchId);return branch&&branch.isActive?[{_id:branch._id,name:branch.name}]:[];}});
0028: export const status=query({args:{},handler:async ctx=>{await requirePermission(ctx,"view_general_ledger");const s=await ctx.db.query("generalLedgerSettings").first();return s?{initialized:true,baseCurrency:s.baseCurrency,chartVersion:s.chartVersion,status:s.status,operationalPostingEnabled:s.operationalPostingEnabled,financialPostingEnabled:s.financialPostingEnabled??false,financialPostingCutoverDate:s.financialPostingCutoverDate,financialPostingActivatedAt:s.financialPostingActivatedAt,cutoverDate:s.cutoverDate,initializedAt:s.initializedAt}:{initialized:false,operationalPostingEnabled:false,financialPostingEnabled:false};}});
0029: export const financialPostingReadinessStatus=query({args:{cutoverDate:v.string()},handler:async(ctx,args)=>{await requirePermission(ctx,"initialize_general_ledger");return financialPostingReadiness(ctx,args.cutoverDate);}});
0030: export const enableFinancialPosting=mutation({args:{cutoverDate:v.string(),requestId:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"initialize_general_ledger"),before=await ctx.db.query("generalLedgerSettings").first(),settings=await activateFinancialPosting(ctx,user,args);if(!before?.financialPostingEnabled)await logAction(ctx,user,{action:"activate_financial_posting",module:"general_ledger",recordId:String(settings._id),details:`Financial bridge cutover ${args.cutoverDate}`});return {enabled:settings.financialPostingEnabled??false,cutoverDate:settings.financialPostingCutoverDate};}});
0031: export const chart=query({args:{activeOnly:v.optional(v.boolean())},handler:async(ctx,args)=>{await requirePermission(ctx,"view_general_ledger");const rows=args.activeOnly===false?await ctx.db.query("chartOfAccounts").withIndex("by_active").collect():await ctx.db.query("chartOfAccounts").withIndex("by_active",q=>q.eq("isActive",true)).collect();return rows.map(a=>({_id:a._id,code:a.code,nameAr:a.nameAr,nameEn:a.nameEn,parentId:a.parentId,accountClass:a.accountClass,normalSide:a.normalSide,isContra:a.isContra,isPosting:a.isPosting,isSystem:a.isSystem,systemKey:a.systemKey,isActive:a.isActive}));}});
0032: export const accountPicker=query({args:{},handler:async ctx=>{await requirePermission(ctx,"view_general_ledger");const rows=await ctx.db.query("chartOfAccounts").withIndex("by_active",q=>q.eq("isActive",true)).collect();return rows.filter(a=>a.isPosting).map(a=>({_id:a._id,code:a.code,nameAr:a.nameAr,normalSide:a.normalSide}));}});
0033: export const createAccount=mutation({args:{code:v.string(),nameAr:v.string(),nameEn:v.optional(v.string()),parentId:v.id("chartOfAccounts"),normalSide:v.union(v.literal("debit"),v.literal("credit")),isContra:v.boolean()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"manage_chart_of_accounts"),code=args.code.replace(/\s+/g,"").toUpperCase(),nameAr=normalizeText(args.nameAr);if(!code)throw new ConvexError("الكود مطلوب");if(!nameAr)throw new ConvexError("اسم الحساب مطلوب");if(await ctx.db.query("chartOfAccounts").withIndex("by_code",q=>q.eq("normalizedCode",code)).unique())throw new ConvexError("كود الحساب مكرر");const parent=await ctx.db.get(args.parentId);if(!parent||parent.isPosting||!parent.isActive)throw new ConvexError("الحساب الأب غير صالح");const classSide=parent.accountClass==="asset"||parent.accountClass==="expense"?"debit":"credit",expected=args.isContra?(classSide==="debit"?"credit":"debit"):classSide;if(args.normalSide!==expected)throw new ConvexError("الطبيعة المحاسبية لا تطابق فئة الحساب");const id=await ctx.db.insert("chartOfAccounts",{code,normalizedCode:code,nameAr,nameEn:args.nameEn?normalizeText(args.nameEn):undefined,parentId:parent._id,accountClass:parent.accountClass,normalSide:args.normalSide,isContra:args.isContra,isPosting:true,isSystem:false,isActive:true,createdAt:Date.now(),createdBy:user.userId});await logAction(ctx,user,{action:"create",module:"general_ledger",recordId:String(id),recordLabel:code,details:`account ${nameAr}`});return id;}});
0034: export const deactivateAccount=mutation({args:{accountId:v.id("chartOfAccounts")},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"manage_chart_of_accounts"),a=await ctx.db.get(args.accountId);if(!a||a.isSystem)throw new ConvexError("لا يمكن تعطيل حساب نظام");await ctx.db.patch(a._id,{isActive:false,deactivatedAt:Date.now(),deactivatedBy:user.userId});await logAction(ctx,user,{action:"deactivate",module:"general_ledger",recordId:String(a._id),recordLabel:a.code});return {accountId:a._id,isActive:false};}});
0035: export const createOrOpenPeriod=mutation({args:{periodKey:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"close_accounting_periods");if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.periodKey))throw new ConvexError("مفتاح الفترة غير صالح");const existing=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",args.periodKey)).unique();if(existing){if(existing.status==="closed")throw new ConvexError("استخدم إعادة الفتح للفترة المغلقة");return existing._id;}const startDate=`${args.periodKey}-01`,d=new Date(`${startDate}T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);const endDate=d.toISOString().slice(0,10);const id=await ctx.db.insert("accountingPeriods",{periodKey:args.periodKey,startDate,endDate,status:"open"});await logAction(ctx,user,{action:"open_period",module:"general_ledger",recordId:String(id),recordLabel:args.periodKey});return id;}});
0036: export const closePeriod=mutation({args:{periodKey:v.string(),reason:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"close_accounting_periods"),p=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",args.periodKey)).unique(),reason=normalizeText(args.reason);if(!p||p.status!=="open"||!reason)throw new ConvexError("الفترة أو السبب غير صالح");const balances=await ctx.db.query("generalLedgerPeriodBalances").withIndex("by_period",q=>q.eq("periodKey",args.periodKey)).collect();const d=balances.reduce((s,x)=>s+x.debitTotal,0),c=balances.reduce((s,x)=>s+x.creditTotal,0);if(Math.round(d*100)!==Math.round(c*100))throw new ConvexError("الفترة غير متوازنة");await ctx.db.patch(p._id,{status:"closed",closedAt:Date.now(),closedBy:user.userId,closeReason:reason});await logAction(ctx,user,{action:"close_period",module:"general_ledger",recordId:String(p._id),details:reason});return p._id;}});
0037: export const reopenPeriod=mutation({args:{periodKey:v.string(),reason:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"reopen_accounting_periods"),p=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",args.periodKey)).unique(),reason=normalizeText(args.reason);if(!p||p.status!=="closed"||!reason)throw new ConvexError("الفترة أو السبب غير صالح");await ctx.db.patch(p._id,{status:"open",reopenedAt:Date.now(),reopenedBy:user.userId,reopenReason:reason});await logAction(ctx,user,{action:"reopen_period",module:"general_ledger",recordId:String(p._id),details:reason});return p._id;}});
0038: export const periods=query({args:{},handler:async ctx=>{await requirePermission(ctx,"view_general_ledger");return (await ctx.db.query("accountingPeriods").withIndex("by_start").order("desc").collect()).map(p=>({periodKey:p.periodKey,startDate:p.startDate,endDate:p.endDate,status:p.status,closeReason:p.closeReason,reopenReason:p.reopenReason}));}});
0039: export const openingStatus=query({args:{branchId:v.optional(v.id("branches"))},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"view_general_ledger"),branchId=scopedBranch(user,args.branchId),opening=await ctx.db.query("generalLedgerOpenings").withIndex("by_branch",q=>q.eq("branchId",branchId)).unique();if(!opening)return {confirmed:false as const};const entry=opening.openingEntryId?await ctx.db.get(opening.openingEntryId):null;return {confirmed:true as const,openingDate:opening.openingDate,isZeroOpening:opening.isZeroOpening,entryNumber:entry?.entryNumber};}});
0040: export const confirmOpening=mutation({args:{branchId:v.id("branches"),openingDate:v.string(),isZeroOpening:v.boolean(),lines:v.array(lineValidator),requestId:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"initialize_general_ledger"),branchId=scopedBranch(user,args.branchId),requestId=normalizeRequestId(args.requestId),openingDate=assertIsoDate(args.openingDate),fp=fingerprint({branchId:String(branchId),openingDate,isZeroOpening:args.isZeroOpening,lines:args.lines});const retry=await ctx.db.query("generalLedgerOpenings").withIndex("by_request",q=>q.eq("requestId",requestId)).unique();if(retry){if(retry.fingerprint!==fp)throw new ConvexError("معرف الطلب مستخدم بحمولة مختلفة");return retry;}if(await ctx.db.query("generalLedgerOpenings").withIndex("by_branch",q=>q.eq("branchId",branchId)).unique())throw new ConvexError("تم اعتماد افتتاح الفرع");if(await ctx.db.query("journalEntries").withIndex("by_branch_date",q=>q.eq("branchId",branchId)).filter(q=>q.eq(q.field("sourceType"),"manual")).first())throw new ConvexError("لا يمكن الافتتاح بعد حركة يدوية");const settings=await ctx.db.query("generalLedgerSettings").first();if(!settings||openingDate<settings.cutoverDate)throw new ConvexError("تاريخ الافتتاح يسبق القطع");if(args.isZeroOpening&&args.lines.length)throw new ConvexError("الافتتاح الصفري لا يحتوي سطورًا");const entry=args.isZeroOpening?undefined:await postJournal(ctx,user,{branchId,date:openingDate,memo:"الأرصدة الافتتاحية",lines:args.lines,requestId,sourceType:"opening"});const id=await ctx.db.insert("generalLedgerOpenings",{branchId,openingDate,status:"confirmed",isZeroOpening:args.isZeroOpening,openingEntryId:entry?._id,requestId,fingerprint:fp,confirmedAt:Date.now(),confirmedBy:user.userId});return (await ctx.db.get(id))!;}});
0041: export const postManualJournal=mutation({args:{branchId:v.id("branches"),date:v.string(),memo:v.string(),lines:v.array(lineValidator),requestId:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"post_manual_journals"),branchId=scopedBranch(user,args.branchId);if(!await ctx.db.query("generalLedgerOpenings").withIndex("by_branch",q=>q.eq("branchId",branchId)).unique())throw new ConvexError("يجب اعتماد افتتاح الفرع أولًا");return postJournal(ctx,user,{branchId,date:args.date,memo:args.memo,lines:args.lines,requestId:args.requestId,sourceType:"manual"});}});
0042: export const reverseJournal=mutation({args:{entryId:v.id("journalEntries"),reversalDate:v.string(),reason:v.string(),requestId:v.string()},handler:async(ctx,args)=>{
```

#### Call 3 at L33
```ts
0030: export const enableFinancialPosting=mutation({args:{cutoverDate:v.string(),requestId:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"initialize_general_ledger"),before=await ctx.db.query("generalLedgerSettings").first(),settings=await activateFinancialPosting(ctx,user,args);if(!before?.financialPostingEnabled)await logAction(ctx,user,{action:"activate_financial_posting",module:"general_ledger",recordId:String(settings._id),details:`Financial bridge cutover ${args.cutoverDate}`});return {enabled:settings.financialPostingEnabled??false,cutoverDate:settings.financialPostingCutoverDate};}});
0031: export const chart=query({args:{activeOnly:v.optional(v.boolean())},handler:async(ctx,args)=>{await requirePermission(ctx,"view_general_ledger");const rows=args.activeOnly===false?await ctx.db.query("chartOfAccounts").withIndex("by_active").collect():await ctx.db.query("chartOfAccounts").withIndex("by_active",q=>q.eq("isActive",true)).collect();return rows.map(a=>({_id:a._id,code:a.code,nameAr:a.nameAr,nameEn:a.nameEn,parentId:a.parentId,accountClass:a.accountClass,normalSide:a.normalSide,isContra:a.isContra,isPosting:a.isPosting,isSystem:a.isSystem,systemKey:a.systemKey,isActive:a.isActive}));}});
0032: export const accountPicker=query({args:{},handler:async ctx=>{await requirePermission(ctx,"view_general_ledger");const rows=await ctx.db.query("chartOfAccounts").withIndex("by_active",q=>q.eq("isActive",true)).collect();return rows.filter(a=>a.isPosting).map(a=>({_id:a._id,code:a.code,nameAr:a.nameAr,normalSide:a.normalSide}));}});
0033: export const createAccount=mutation({args:{code:v.string(),nameAr:v.string(),nameEn:v.optional(v.string()),parentId:v.id("chartOfAccounts"),normalSide:v.union(v.literal("debit"),v.literal("credit")),isContra:v.boolean()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"manage_chart_of_accounts"),code=args.code.replace(/\s+/g,"").toUpperCase(),nameAr=normalizeText(args.nameAr);if(!code)throw new ConvexError("الكود مطلوب");if(!nameAr)throw new ConvexError("اسم الحساب مطلوب");if(await ctx.db.query("chartOfAccounts").withIndex("by_code",q=>q.eq("normalizedCode",code)).unique())throw new ConvexError("كود الحساب مكرر");const parent=await ctx.db.get(args.parentId);if(!parent||parent.isPosting||!parent.isActive)throw new ConvexError("الحساب الأب غير صالح");const classSide=parent.accountClass==="asset"||parent.accountClass==="expense"?"debit":"credit",expected=args.isContra?(classSide==="debit"?"credit":"debit"):classSide;if(args.normalSide!==expected)throw new ConvexError("الطبيعة المحاسبية لا تطابق فئة الحساب");const id=await ctx.db.insert("chartOfAccounts",{code,normalizedCode:code,nameAr,nameEn:args.nameEn?normalizeText(args.nameEn):undefined,parentId:parent._id,accountClass:parent.accountClass,normalSide:args.normalSide,isContra:args.isContra,isPosting:true,isSystem:false,isActive:true,createdAt:Date.now(),createdBy:user.userId});await logAction(ctx,user,{action:"create",module:"general_ledger",recordId:String(id),recordLabel:code,details:`account ${nameAr}`});return id;}});
0034: export const deactivateAccount=mutation({args:{accountId:v.id("chartOfAccounts")},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"manage_chart_of_accounts"),a=await ctx.db.get(args.accountId);if(!a||a.isSystem)throw new ConvexError("لا يمكن تعطيل حساب نظام");await ctx.db.patch(a._id,{isActive:false,deactivatedAt:Date.now(),deactivatedBy:user.userId});await logAction(ctx,user,{action:"deactivate",module:"general_ledger",recordId:String(a._id),recordLabel:a.code});return {accountId:a._id,isActive:false};}});
0035: export const createOrOpenPeriod=mutation({args:{periodKey:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"close_accounting_periods");if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.periodKey))throw new ConvexError("مفتاح الفترة غير صالح");const existing=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",args.periodKey)).unique();if(existing){if(existing.status==="closed")throw new ConvexError("استخدم إعادة الفتح للفترة المغلقة");return existing._id;}const startDate=`${args.periodKey}-01`,d=new Date(`${startDate}T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);const endDate=d.toISOString().slice(0,10);const id=await ctx.db.insert("accountingPeriods",{periodKey:args.periodKey,startDate,endDate,status:"open"});await logAction(ctx,user,{action:"open_period",module:"general_ledger",recordId:String(id),recordLabel:args.periodKey});return id;}});
0036: export const closePeriod=mutation({args:{periodKey:v.string(),reason:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"close_accounting_periods"),p=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",args.periodKey)).unique(),reason=normalizeText(args.reason);if(!p||p.status!=="open"||!reason)throw new ConvexError("الفترة أو السبب غير صالح");const balances=await ctx.db.query("generalLedgerPeriodBalances").withIndex("by_period",q=>q.eq("periodKey",args.periodKey)).collect();const d=balances.reduce((s,x)=>s+x.debitTotal,0),c=balances.reduce((s,x)=>s+x.creditTotal,0);if(Math.round(d*100)!==Math.round(c*100))throw new ConvexError("الفترة غير متوازنة");await ctx.db.patch(p._id,{status:"closed",closedAt:Date.now(),closedBy:user.userId,closeReason:reason});await logAction(ctx,user,{action:"close_period",module:"general_ledger",recordId:String(p._id),details:reason});return p._id;}});
0037: export const reopenPeriod=mutation({args:{periodKey:v.string(),reason:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"reopen_accounting_periods"),p=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",args.periodKey)).unique(),reason=normalizeText(args.reason);if(!p||p.status!=="closed"||!reason)throw new ConvexError("الفترة أو السبب غير صالح");await ctx.db.patch(p._id,{status:"open",reopenedAt:Date.now(),reopenedBy:user.userId,reopenReason:reason});await logAction(ctx,user,{action:"reopen_period",module:"general_ledger",recordId:String(p._id),details:reason});return p._id;}});
0038: export const periods=query({args:{},handler:async ctx=>{await requirePermission(ctx,"view_general_ledger");return (await ctx.db.query("accountingPeriods").withIndex("by_start").order("desc").collect()).map(p=>({periodKey:p.periodKey,startDate:p.startDate,endDate:p.endDate,status:p.status,closeReason:p.closeReason,reopenReason:p.reopenReason}));}});
0039: export const openingStatus=query({args:{branchId:v.optional(v.id("branches"))},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"view_general_ledger"),branchId=scopedBranch(user,args.branchId),opening=await ctx.db.query("generalLedgerOpenings").withIndex("by_branch",q=>q.eq("branchId",branchId)).unique();if(!opening)return {confirmed:false as const};const entry=opening.openingEntryId?await ctx.db.get(opening.openingEntryId):null;return {confirmed:true as const,openingDate:opening.openingDate,isZeroOpening:opening.isZeroOpening,entryNumber:entry?.entryNumber};}});
0040: export const confirmOpening=mutation({args:{branchId:v.id("branches"),openingDate:v.string(),isZeroOpening:v.boolean(),lines:v.array(lineValidator),requestId:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"initialize_general_ledger"),branchId=scopedBranch(user,args.branchId),requestId=normalizeRequestId(args.requestId),openingDate=assertIsoDate(args.openingDate),fp=fingerprint({branchId:String(branchId),openingDate,isZeroOpening:args.isZeroOpening,lines:args.lines});const retry=await ctx.db.query("generalLedgerOpenings").withIndex("by_request",q=>q.eq("requestId",requestId)).unique();if(retry){if(retry.fingerprint!==fp)throw new ConvexError("معرف الطلب مستخدم بحمولة مختلفة");return retry;}if(await ctx.db.query("generalLedgerOpenings").withIndex("by_branch",q=>q.eq("branchId",branchId)).unique())throw new ConvexError("تم اعتماد افتتاح الفرع");if(await ctx.db.query("journalEntries").withIndex("by_branch_date",q=>q.eq("branchId",branchId)).filter(q=>q.eq(q.field("sourceType"),"manual")).first())throw new ConvexError("لا يمكن الافتتاح بعد حركة يدوية");const settings=await ctx.db.query("generalLedgerSettings").first();if(!settings||openingDate<settings.cutoverDate)throw new ConvexError("تاريخ الافتتاح يسبق القطع");if(args.isZeroOpening&&args.lines.length)throw new ConvexError("الافتتاح الصفري لا يحتوي سطورًا");const entry=args.isZeroOpening?undefined:await postJournal(ctx,user,{branchId,date:openingDate,memo:"الأرصدة الافتتاحية",lines:args.lines,requestId,sourceType:"opening"});const id=await ctx.db.insert("generalLedgerOpenings",{branchId,openingDate,status:"confirmed",isZeroOpening:args.isZeroOpening,openingEntryId:entry?._id,requestId,fingerprint:fp,confirmedAt:Date.now(),confirmedBy:user.userId});return (await ctx.db.get(id))!;}});
0041: export const postManualJournal=mutation({args:{branchId:v.id("branches"),date:v.string(),memo:v.string(),lines:v.array(lineValidator),requestId:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"post_manual_journals"),branchId=scopedBranch(user,args.branchId);if(!await ctx.db.query("generalLedgerOpenings").withIndex("by_branch",q=>q.eq("branchId",branchId)).unique())throw new ConvexError("يجب اعتماد افتتاح الفرع أولًا");return postJournal(ctx,user,{branchId,date:args.date,memo:args.memo,lines:args.lines,requestId:args.requestId,sourceType:"manual"});}});
0042: export const reverseJournal=mutation({args:{entryId:v.id("journalEntries"),reversalDate:v.string(),reason:v.string(),requestId:v.string()},handler:async(ctx,args)=>{
0043:  const user=await requirePermission(ctx,"reverse_journal_entries"),original=await ctx.db.get(args.entryId),reason=normalizeText(args.reason),reversalDate=assertIsoDate(args.reversalDate),requestId=normalizeRequestId(args.requestId);
0044:  if(!original||!["opening","manual"].includes(original.sourceType)||!reason)throw new ConvexError("القيد التشغيلي يُعكس من مسار المستند الأصلي فقط"); scopedBranch(user,original.branchId);
0045:  const lines=await ctx.db.query("journalLines").withIndex("by_entry",q=>q.eq("entryId",original._id)).collect();
```

#### Call 4 at L34
```ts
0031: export const chart=query({args:{activeOnly:v.optional(v.boolean())},handler:async(ctx,args)=>{await requirePermission(ctx,"view_general_ledger");const rows=args.activeOnly===false?await ctx.db.query("chartOfAccounts").withIndex("by_active").collect():await ctx.db.query("chartOfAccounts").withIndex("by_active",q=>q.eq("isActive",true)).collect();return rows.map(a=>({_id:a._id,code:a.code,nameAr:a.nameAr,nameEn:a.nameEn,parentId:a.parentId,accountClass:a.accountClass,normalSide:a.normalSide,isContra:a.isContra,isPosting:a.isPosting,isSystem:a.isSystem,systemKey:a.systemKey,isActive:a.isActive}));}});
0032: export const accountPicker=query({args:{},handler:async ctx=>{await requirePermission(ctx,"view_general_ledger");const rows=await ctx.db.query("chartOfAccounts").withIndex("by_active",q=>q.eq("isActive",true)).collect();return rows.filter(a=>a.isPosting).map(a=>({_id:a._id,code:a.code,nameAr:a.nameAr,normalSide:a.normalSide}));}});
0033: export const createAccount=mutation({args:{code:v.string(),nameAr:v.string(),nameEn:v.optional(v.string()),parentId:v.id("chartOfAccounts"),normalSide:v.union(v.literal("debit"),v.literal("credit")),isContra:v.boolean()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"manage_chart_of_accounts"),code=args.code.replace(/\s+/g,"").toUpperCase(),nameAr=normalizeText(args.nameAr);if(!code)throw new ConvexError("الكود مطلوب");if(!nameAr)throw new ConvexError("اسم الحساب مطلوب");if(await ctx.db.query("chartOfAccounts").withIndex("by_code",q=>q.eq("normalizedCode",code)).unique())throw new ConvexError("كود الحساب مكرر");const parent=await ctx.db.get(args.parentId);if(!parent||parent.isPosting||!parent.isActive)throw new ConvexError("الحساب الأب غير صالح");const classSide=parent.accountClass==="asset"||parent.accountClass==="expense"?"debit":"credit",expected=args.isContra?(classSide==="debit"?"credit":"debit"):classSide;if(args.normalSide!==expected)throw new ConvexError("الطبيعة المحاسبية لا تطابق فئة الحساب");const id=await ctx.db.insert("chartOfAccounts",{code,normalizedCode:code,nameAr,nameEn:args.nameEn?normalizeText(args.nameEn):undefined,parentId:parent._id,accountClass:parent.accountClass,normalSide:args.normalSide,isContra:args.isContra,isPosting:true,isSystem:false,isActive:true,createdAt:Date.now(),createdBy:user.userId});await logAction(ctx,user,{action:"create",module:"general_ledger",recordId:String(id),recordLabel:code,details:`account ${nameAr}`});return id;}});
0034: export const deactivateAccount=mutation({args:{accountId:v.id("chartOfAccounts")},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"manage_chart_of_accounts"),a=await ctx.db.get(args.accountId);if(!a||a.isSystem)throw new ConvexError("لا يمكن تعطيل حساب نظام");await ctx.db.patch(a._id,{isActive:false,deactivatedAt:Date.now(),deactivatedBy:user.userId});await logAction(ctx,user,{action:"deactivate",module:"general_ledger",recordId:String(a._id),recordLabel:a.code});return {accountId:a._id,isActive:false};}});
0035: export const createOrOpenPeriod=mutation({args:{periodKey:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"close_accounting_periods");if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.periodKey))throw new ConvexError("مفتاح الفترة غير صالح");const existing=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",args.periodKey)).unique();if(existing){if(existing.status==="closed")throw new ConvexError("استخدم إعادة الفتح للفترة المغلقة");return existing._id;}const startDate=`${args.periodKey}-01`,d=new Date(`${startDate}T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);const endDate=d.toISOString().slice(0,10);const id=await ctx.db.insert("accountingPeriods",{periodKey:args.periodKey,startDate,endDate,status:"open"});await logAction(ctx,user,{action:"open_period",module:"general_ledger",recordId:String(id),recordLabel:args.periodKey});return id;}});
0036: export const closePeriod=mutation({args:{periodKey:v.string(),reason:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"close_accounting_periods"),p=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",args.periodKey)).unique(),reason=normalizeText(args.reason);if(!p||p.status!=="open"||!reason)throw new ConvexError("الفترة أو السبب غير صالح");const balances=await ctx.db.query("generalLedgerPeriodBalances").withIndex("by_period",q=>q.eq("periodKey",args.periodKey)).collect();const d=balances.reduce((s,x)=>s+x.debitTotal,0),c=balances.reduce((s,x)=>s+x.creditTotal,0);if(Math.round(d*100)!==Math.round(c*100))throw new ConvexError("الفترة غير متوازنة");await ctx.db.patch(p._id,{status:"closed",closedAt:Date.now(),closedBy:user.userId,closeReason:reason});await logAction(ctx,user,{action:"close_period",module:"general_ledger",recordId:String(p._id),details:reason});return p._id;}});
0037: export const reopenPeriod=mutation({args:{periodKey:v.string(),reason:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"reopen_accounting_periods"),p=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",args.periodKey)).unique(),reason=normalizeText(args.reason);if(!p||p.status!=="closed"||!reason)throw new ConvexError("الفترة أو السبب غير صالح");await ctx.db.patch(p._id,{status:"open",reopenedAt:Date.now(),reopenedBy:user.userId,reopenReason:reason});await logAction(ctx,user,{action:"reopen_period",module:"general_ledger",recordId:String(p._id),details:reason});return p._id;}});
0038: export const periods=query({args:{},handler:async ctx=>{await requirePermission(ctx,"view_general_ledger");return (await ctx.db.query("accountingPeriods").withIndex("by_start").order("desc").collect()).map(p=>({periodKey:p.periodKey,startDate:p.startDate,endDate:p.endDate,status:p.status,closeReason:p.closeReason,reopenReason:p.reopenReason}));}});
0039: export const openingStatus=query({args:{branchId:v.optional(v.id("branches"))},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"view_general_ledger"),branchId=scopedBranch(user,args.branchId),opening=await ctx.db.query("generalLedgerOpenings").withIndex("by_branch",q=>q.eq("branchId",branchId)).unique();if(!opening)return {confirmed:false as const};const entry=opening.openingEntryId?await ctx.db.get(opening.openingEntryId):null;return {confirmed:true as const,openingDate:opening.openingDate,isZeroOpening:opening.isZeroOpening,entryNumber:entry?.entryNumber};}});
0040: export const confirmOpening=mutation({args:{branchId:v.id("branches"),openingDate:v.string(),isZeroOpening:v.boolean(),lines:v.array(lineValidator),requestId:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"initialize_general_ledger"),branchId=scopedBranch(user,args.branchId),requestId=normalizeRequestId(args.requestId),openingDate=assertIsoDate(args.openingDate),fp=fingerprint({branchId:String(branchId),openingDate,isZeroOpening:args.isZeroOpening,lines:args.lines});const retry=await ctx.db.query("generalLedgerOpenings").withIndex("by_request",q=>q.eq("requestId",requestId)).unique();if(retry){if(retry.fingerprint!==fp)throw new ConvexError("معرف الطلب مستخدم بحمولة مختلفة");return retry;}if(await ctx.db.query("generalLedgerOpenings").withIndex("by_branch",q=>q.eq("branchId",branchId)).unique())throw new ConvexError("تم اعتماد افتتاح الفرع");if(await ctx.db.query("journalEntries").withIndex("by_branch_date",q=>q.eq("branchId",branchId)).filter(q=>q.eq(q.field("sourceType"),"manual")).first())throw new ConvexError("لا يمكن الافتتاح بعد حركة يدوية");const settings=await ctx.db.query("generalLedgerSettings").first();if(!settings||openingDate<settings.cutoverDate)throw new ConvexError("تاريخ الافتتاح يسبق القطع");if(args.isZeroOpening&&args.lines.length)throw new ConvexError("الافتتاح الصفري لا يحتوي سطورًا");const entry=args.isZeroOpening?undefined:await postJournal(ctx,user,{branchId,date:openingDate,memo:"الأرصدة الافتتاحية",lines:args.lines,requestId,sourceType:"opening"});const id=await ctx.db.insert("generalLedgerOpenings",{branchId,openingDate,status:"confirmed",isZeroOpening:args.isZeroOpening,openingEntryId:entry?._id,requestId,fingerprint:fp,confirmedAt:Date.now(),confirmedBy:user.userId});return (await ctx.db.get(id))!;}});
0041: export const postManualJournal=mutation({args:{branchId:v.id("branches"),date:v.string(),memo:v.string(),lines:v.array(lineValidator),requestId:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"post_manual_journals"),branchId=scopedBranch(user,args.branchId);if(!await ctx.db.query("generalLedgerOpenings").withIndex("by_branch",q=>q.eq("branchId",branchId)).unique())throw new ConvexError("يجب اعتماد افتتاح الفرع أولًا");return postJournal(ctx,user,{branchId,date:args.date,memo:args.memo,lines:args.lines,requestId:args.requestId,sourceType:"manual"});}});
0042: export const reverseJournal=mutation({args:{entryId:v.id("journalEntries"),reversalDate:v.string(),reason:v.string(),requestId:v.string()},handler:async(ctx,args)=>{
0043:  const user=await requirePermission(ctx,"reverse_journal_entries"),original=await ctx.db.get(args.entryId),reason=normalizeText(args.reason),reversalDate=assertIsoDate(args.reversalDate),requestId=normalizeRequestId(args.requestId);
0044:  if(!original||!["opening","manual"].includes(original.sourceType)||!reason)throw new ConvexError("القيد التشغيلي يُعكس من مسار المستند الأصلي فقط"); scopedBranch(user,original.branchId);
0045:  const lines=await ctx.db.query("journalLines").withIndex("by_entry",q=>q.eq("entryId",original._id)).collect();
0046:  const request={branchId:original.branchId,date:reversalDate,memo:`عكس ${original.entryNumber}: ${reason}`,lines:lines.map(l=>({accountId:l.accountId,debit:l.credit,credit:l.debit,description:`عكس: ${l.description??original.memo}`})),requestId,sourceType:"reversal" as const,originalEntryId:original._id,reversalReason:reason};
```

#### Call 5 at L35
```ts
0032: export const accountPicker=query({args:{},handler:async ctx=>{await requirePermission(ctx,"view_general_ledger");const rows=await ctx.db.query("chartOfAccounts").withIndex("by_active",q=>q.eq("isActive",true)).collect();return rows.filter(a=>a.isPosting).map(a=>({_id:a._id,code:a.code,nameAr:a.nameAr,normalSide:a.normalSide}));}});
0033: export const createAccount=mutation({args:{code:v.string(),nameAr:v.string(),nameEn:v.optional(v.string()),parentId:v.id("chartOfAccounts"),normalSide:v.union(v.literal("debit"),v.literal("credit")),isContra:v.boolean()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"manage_chart_of_accounts"),code=args.code.replace(/\s+/g,"").toUpperCase(),nameAr=normalizeText(args.nameAr);if(!code)throw new ConvexError("الكود مطلوب");if(!nameAr)throw new ConvexError("اسم الحساب مطلوب");if(await ctx.db.query("chartOfAccounts").withIndex("by_code",q=>q.eq("normalizedCode",code)).unique())throw new ConvexError("كود الحساب مكرر");const parent=await ctx.db.get(args.parentId);if(!parent||parent.isPosting||!parent.isActive)throw new ConvexError("الحساب الأب غير صالح");const classSide=parent.accountClass==="asset"||parent.accountClass==="expense"?"debit":"credit",expected=args.isContra?(classSide==="debit"?"credit":"debit"):classSide;if(args.normalSide!==expected)throw new ConvexError("الطبيعة المحاسبية لا تطابق فئة الحساب");const id=await ctx.db.insert("chartOfAccounts",{code,normalizedCode:code,nameAr,nameEn:args.nameEn?normalizeText(args.nameEn):undefined,parentId:parent._id,accountClass:parent.accountClass,normalSide:args.normalSide,isContra:args.isContra,isPosting:true,isSystem:false,isActive:true,createdAt:Date.now(),createdBy:user.userId});await logAction(ctx,user,{action:"create",module:"general_ledger",recordId:String(id),recordLabel:code,details:`account ${nameAr}`});return id;}});
0034: export const deactivateAccount=mutation({args:{accountId:v.id("chartOfAccounts")},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"manage_chart_of_accounts"),a=await ctx.db.get(args.accountId);if(!a||a.isSystem)throw new ConvexError("لا يمكن تعطيل حساب نظام");await ctx.db.patch(a._id,{isActive:false,deactivatedAt:Date.now(),deactivatedBy:user.userId});await logAction(ctx,user,{action:"deactivate",module:"general_ledger",recordId:String(a._id),recordLabel:a.code});return {accountId:a._id,isActive:false};}});
0035: export const createOrOpenPeriod=mutation({args:{periodKey:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"close_accounting_periods");if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.periodKey))throw new ConvexError("مفتاح الفترة غير صالح");const existing=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",args.periodKey)).unique();if(existing){if(existing.status==="closed")throw new ConvexError("استخدم إعادة الفتح للفترة المغلقة");return existing._id;}const startDate=`${args.periodKey}-01`,d=new Date(`${startDate}T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);const endDate=d.toISOString().slice(0,10);const id=await ctx.db.insert("accountingPeriods",{periodKey:args.periodKey,startDate,endDate,status:"open"});await logAction(ctx,user,{action:"open_period",module:"general_ledger",recordId:String(id),recordLabel:args.periodKey});return id;}});
0036: export const closePeriod=mutation({args:{periodKey:v.string(),reason:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"close_accounting_periods"),p=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",args.periodKey)).unique(),reason=normalizeText(args.reason);if(!p||p.status!=="open"||!reason)throw new ConvexError("الفترة أو السبب غير صالح");const balances=await ctx.db.query("generalLedgerPeriodBalances").withIndex("by_period",q=>q.eq("periodKey",args.periodKey)).collect();const d=balances.reduce((s,x)=>s+x.debitTotal,0),c=balances.reduce((s,x)=>s+x.creditTotal,0);if(Math.round(d*100)!==Math.round(c*100))throw new ConvexError("الفترة غير متوازنة");await ctx.db.patch(p._id,{status:"closed",closedAt:Date.now(),closedBy:user.userId,closeReason:reason});await logAction(ctx,user,{action:"close_period",module:"general_ledger",recordId:String(p._id),details:reason});return p._id;}});
0037: export const reopenPeriod=mutation({args:{periodKey:v.string(),reason:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"reopen_accounting_periods"),p=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",args.periodKey)).unique(),reason=normalizeText(args.reason);if(!p||p.status!=="closed"||!reason)throw new ConvexError("الفترة أو السبب غير صالح");await ctx.db.patch(p._id,{status:"open",reopenedAt:Date.now(),reopenedBy:user.userId,reopenReason:reason});await logAction(ctx,user,{action:"reopen_period",module:"general_ledger",recordId:String(p._id),details:reason});return p._id;}});
0038: export const periods=query({args:{},handler:async ctx=>{await requirePermission(ctx,"view_general_ledger");return (await ctx.db.query("accountingPeriods").withIndex("by_start").order("desc").collect()).map(p=>({periodKey:p.periodKey,startDate:p.startDate,endDate:p.endDate,status:p.status,closeReason:p.closeReason,reopenReason:p.reopenReason}));}});
0039: export const openingStatus=query({args:{branchId:v.optional(v.id("branches"))},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"view_general_ledger"),branchId=scopedBranch(user,args.branchId),opening=await ctx.db.query("generalLedgerOpenings").withIndex("by_branch",q=>q.eq("branchId",branchId)).unique();if(!opening)return {confirmed:false as const};const entry=opening.openingEntryId?await ctx.db.get(opening.openingEntryId):null;return {confirmed:true as const,openingDate:opening.openingDate,isZeroOpening:opening.isZeroOpening,entryNumber:entry?.entryNumber};}});
0040: export const confirmOpening=mutation({args:{branchId:v.id("branches"),openingDate:v.string(),isZeroOpening:v.boolean(),lines:v.array(lineValidator),requestId:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"initialize_general_ledger"),branchId=scopedBranch(user,args.branchId),requestId=normalizeRequestId(args.requestId),openingDate=assertIsoDate(args.openingDate),fp=fingerprint({branchId:String(branchId),openingDate,isZeroOpening:args.isZeroOpening,lines:args.lines});const retry=await ctx.db.query("generalLedgerOpenings").withIndex("by_request",q=>q.eq("requestId",requestId)).unique();if(retry){if(retry.fingerprint!==fp)throw new ConvexError("معرف الطلب مستخدم بحمولة مختلفة");return retry;}if(await ctx.db.query("generalLedgerOpenings").withIndex("by_branch",q=>q.eq("branchId",branchId)).unique())throw new ConvexError("تم اعتماد افتتاح الفرع");if(await ctx.db.query("journalEntries").withIndex("by_branch_date",q=>q.eq("branchId",branchId)).filter(q=>q.eq(q.field("sourceType"),"manual")).first())throw new ConvexError("لا يمكن الافتتاح بعد حركة يدوية");const settings=await ctx.db.query("generalLedgerSettings").first();if(!settings||openingDate<settings.cutoverDate)throw new ConvexError("تاريخ الافتتاح يسبق القطع");if(args.isZeroOpening&&args.lines.length)throw new ConvexError("الافتتاح الصفري لا يحتوي سطورًا");const entry=args.isZeroOpening?undefined:await postJournal(ctx,user,{branchId,date:openingDate,memo:"الأرصدة الافتتاحية",lines:args.lines,requestId,sourceType:"opening"});const id=await ctx.db.insert("generalLedgerOpenings",{branchId,openingDate,status:"confirmed",isZeroOpening:args.isZeroOpening,openingEntryId:entry?._id,requestId,fingerprint:fp,confirmedAt:Date.now(),confirmedBy:user.userId});return (await ctx.db.get(id))!;}});
0041: export const postManualJournal=mutation({args:{branchId:v.id("branches"),date:v.string(),memo:v.string(),lines:v.array(lineValidator),requestId:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"post_manual_journals"),branchId=scopedBranch(user,args.branchId);if(!await ctx.db.query("generalLedgerOpenings").withIndex("by_branch",q=>q.eq("branchId",branchId)).unique())throw new ConvexError("يجب اعتماد افتتاح الفرع أولًا");return postJournal(ctx,user,{branchId,date:args.date,memo:args.memo,lines:args.lines,requestId:args.requestId,sourceType:"manual"});}});
0042: export const reverseJournal=mutation({args:{entryId:v.id("journalEntries"),reversalDate:v.string(),reason:v.string(),requestId:v.string()},handler:async(ctx,args)=>{
0043:  const user=await requirePermission(ctx,"reverse_journal_entries"),original=await ctx.db.get(args.entryId),reason=normalizeText(args.reason),reversalDate=assertIsoDate(args.reversalDate),requestId=normalizeRequestId(args.requestId);
0044:  if(!original||!["opening","manual"].includes(original.sourceType)||!reason)throw new ConvexError("القيد التشغيلي يُعكس من مسار المستند الأصلي فقط"); scopedBranch(user,original.branchId);
0045:  const lines=await ctx.db.query("journalLines").withIndex("by_entry",q=>q.eq("entryId",original._id)).collect();
0046:  const request={branchId:original.branchId,date:reversalDate,memo:`عكس ${original.entryNumber}: ${reason}`,lines:lines.map(l=>({accountId:l.accountId,debit:l.credit,credit:l.debit,description:`عكس: ${l.description??original.memo}`})),requestId,sourceType:"reversal" as const,originalEntryId:original._id,reversalReason:reason};
0047:  const existing=await ctx.db.query("journalEntries").withIndex("by_original",q=>q.eq("originalEntryId",original._id)).unique();
```

#### Call 6 at L36
```ts
0033: export const createAccount=mutation({args:{code:v.string(),nameAr:v.string(),nameEn:v.optional(v.string()),parentId:v.id("chartOfAccounts"),normalSide:v.union(v.literal("debit"),v.literal("credit")),isContra:v.boolean()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"manage_chart_of_accounts"),code=args.code.replace(/\s+/g,"").toUpperCase(),nameAr=normalizeText(args.nameAr);if(!code)throw new ConvexError("الكود مطلوب");if(!nameAr)throw new ConvexError("اسم الحساب مطلوب");if(await ctx.db.query("chartOfAccounts").withIndex("by_code",q=>q.eq("normalizedCode",code)).unique())throw new ConvexError("كود الحساب مكرر");const parent=await ctx.db.get(args.parentId);if(!parent||parent.isPosting||!parent.isActive)throw new ConvexError("الحساب الأب غير صالح");const classSide=parent.accountClass==="asset"||parent.accountClass==="expense"?"debit":"credit",expected=args.isContra?(classSide==="debit"?"credit":"debit"):classSide;if(args.normalSide!==expected)throw new ConvexError("الطبيعة المحاسبية لا تطابق فئة الحساب");const id=await ctx.db.insert("chartOfAccounts",{code,normalizedCode:code,nameAr,nameEn:args.nameEn?normalizeText(args.nameEn):undefined,parentId:parent._id,accountClass:parent.accountClass,normalSide:args.normalSide,isContra:args.isContra,isPosting:true,isSystem:false,isActive:true,createdAt:Date.now(),createdBy:user.userId});await logAction(ctx,user,{action:"create",module:"general_ledger",recordId:String(id),recordLabel:code,details:`account ${nameAr}`});return id;}});
0034: export const deactivateAccount=mutation({args:{accountId:v.id("chartOfAccounts")},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"manage_chart_of_accounts"),a=await ctx.db.get(args.accountId);if(!a||a.isSystem)throw new ConvexError("لا يمكن تعطيل حساب نظام");await ctx.db.patch(a._id,{isActive:false,deactivatedAt:Date.now(),deactivatedBy:user.userId});await logAction(ctx,user,{action:"deactivate",module:"general_ledger",recordId:String(a._id),recordLabel:a.code});return {accountId:a._id,isActive:false};}});
0035: export const createOrOpenPeriod=mutation({args:{periodKey:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"close_accounting_periods");if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.periodKey))throw new ConvexError("مفتاح الفترة غير صالح");const existing=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",args.periodKey)).unique();if(existing){if(existing.status==="closed")throw new ConvexError("استخدم إعادة الفتح للفترة المغلقة");return existing._id;}const startDate=`${args.periodKey}-01`,d=new Date(`${startDate}T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);const endDate=d.toISOString().slice(0,10);const id=await ctx.db.insert("accountingPeriods",{periodKey:args.periodKey,startDate,endDate,status:"open"});await logAction(ctx,user,{action:"open_period",module:"general_ledger",recordId:String(id),recordLabel:args.periodKey});return id;}});
0036: export const closePeriod=mutation({args:{periodKey:v.string(),reason:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"close_accounting_periods"),p=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",args.periodKey)).unique(),reason=normalizeText(args.reason);if(!p||p.status!=="open"||!reason)throw new ConvexError("الفترة أو السبب غير صالح");const balances=await ctx.db.query("generalLedgerPeriodBalances").withIndex("by_period",q=>q.eq("periodKey",args.periodKey)).collect();const d=balances.reduce((s,x)=>s+x.debitTotal,0),c=balances.reduce((s,x)=>s+x.creditTotal,0);if(Math.round(d*100)!==Math.round(c*100))throw new ConvexError("الفترة غير متوازنة");await ctx.db.patch(p._id,{status:"closed",closedAt:Date.now(),closedBy:user.userId,closeReason:reason});await logAction(ctx,user,{action:"close_period",module:"general_ledger",recordId:String(p._id),details:reason});return p._id;}});
0037: export const reopenPeriod=mutation({args:{periodKey:v.string(),reason:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"reopen_accounting_periods"),p=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",args.periodKey)).unique(),reason=normalizeText(args.reason);if(!p||p.status!=="closed"||!reason)throw new ConvexError("الفترة أو السبب غير صالح");await ctx.db.patch(p._id,{status:"open",reopenedAt:Date.now(),reopenedBy:user.userId,reopenReason:reason});await logAction(ctx,user,{action:"reopen_period",module:"general_ledger",recordId:String(p._id),details:reason});return p._id;}});
0038: export const periods=query({args:{},handler:async ctx=>{await requirePermission(ctx,"view_general_ledger");return (await ctx.db.query("accountingPeriods").withIndex("by_start").order("desc").collect()).map(p=>({periodKey:p.periodKey,startDate:p.startDate,endDate:p.endDate,status:p.status,closeReason:p.closeReason,reopenReason:p.reopenReason}));}});
0039: export const openingStatus=query({args:{branchId:v.optional(v.id("branches"))},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"view_general_ledger"),branchId=scopedBranch(user,args.branchId),opening=await ctx.db.query("generalLedgerOpenings").withIndex("by_branch",q=>q.eq("branchId",branchId)).unique();if(!opening)return {confirmed:false as const};const entry=opening.openingEntryId?await ctx.db.get(opening.openingEntryId):null;return {confirmed:true as const,openingDate:opening.openingDate,isZeroOpening:opening.isZeroOpening,entryNumber:entry?.entryNumber};}});
0040: export const confirmOpening=mutation({args:{branchId:v.id("branches"),openingDate:v.string(),isZeroOpening:v.boolean(),lines:v.array(lineValidator),requestId:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"initialize_general_ledger"),branchId=scopedBranch(user,args.branchId),requestId=normalizeRequestId(args.requestId),openingDate=assertIsoDate(args.openingDate),fp=fingerprint({branchId:String(branchId),openingDate,isZeroOpening:args.isZeroOpening,lines:args.lines});const retry=await ctx.db.query("generalLedgerOpenings").withIndex("by_request",q=>q.eq("requestId",requestId)).unique();if(retry){if(retry.fingerprint!==fp)throw new ConvexError("معرف الطلب مستخدم بحمولة مختلفة");return retry;}if(await ctx.db.query("generalLedgerOpenings").withIndex("by_branch",q=>q.eq("branchId",branchId)).unique())throw new ConvexError("تم اعتماد افتتاح الفرع");if(await ctx.db.query("journalEntries").withIndex("by_branch_date",q=>q.eq("branchId",branchId)).filter(q=>q.eq(q.field("sourceType"),"manual")).first())throw new ConvexError("لا يمكن الافتتاح بعد حركة يدوية");const settings=await ctx.db.query("generalLedgerSettings").first();if(!settings||openingDate<settings.cutoverDate)throw new ConvexError("تاريخ الافتتاح يسبق القطع");if(args.isZeroOpening&&args.lines.length)throw new ConvexError("الافتتاح الصفري لا يحتوي سطورًا");const entry=args.isZeroOpening?undefined:await postJournal(ctx,user,{branchId,date:openingDate,memo:"الأرصدة الافتتاحية",lines:args.lines,requestId,sourceType:"opening"});const id=await ctx.db.insert("generalLedgerOpenings",{branchId,openingDate,status:"confirmed",isZeroOpening:args.isZeroOpening,openingEntryId:entry?._id,requestId,fingerprint:fp,confirmedAt:Date.now(),confirmedBy:user.userId});return (await ctx.db.get(id))!;}});
0041: export const postManualJournal=mutation({args:{branchId:v.id("branches"),date:v.string(),memo:v.string(),lines:v.array(lineValidator),requestId:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"post_manual_journals"),branchId=scopedBranch(user,args.branchId);if(!await ctx.db.query("generalLedgerOpenings").withIndex("by_branch",q=>q.eq("branchId",branchId)).unique())throw new ConvexError("يجب اعتماد افتتاح الفرع أولًا");return postJournal(ctx,user,{branchId,date:args.date,memo:args.memo,lines:args.lines,requestId:args.requestId,sourceType:"manual"});}});
0042: export const reverseJournal=mutation({args:{entryId:v.id("journalEntries"),reversalDate:v.string(),reason:v.string(),requestId:v.string()},handler:async(ctx,args)=>{
0043:  const user=await requirePermission(ctx,"reverse_journal_entries"),original=await ctx.db.get(args.entryId),reason=normalizeText(args.reason),reversalDate=assertIsoDate(args.reversalDate),requestId=normalizeRequestId(args.requestId);
0044:  if(!original||!["opening","manual"].includes(original.sourceType)||!reason)throw new ConvexError("القيد التشغيلي يُعكس من مسار المستند الأصلي فقط"); scopedBranch(user,original.branchId);
0045:  const lines=await ctx.db.query("journalLines").withIndex("by_entry",q=>q.eq("entryId",original._id)).collect();
0046:  const request={branchId:original.branchId,date:reversalDate,memo:`عكس ${original.entryNumber}: ${reason}`,lines:lines.map(l=>({accountId:l.accountId,debit:l.credit,credit:l.debit,description:`عكس: ${l.description??original.memo}`})),requestId,sourceType:"reversal" as const,originalEntryId:original._id,reversalReason:reason};
0047:  const existing=await ctx.db.query("journalEntries").withIndex("by_original",q=>q.eq("originalEntryId",original._id)).unique();
0048:  if(existing){const expected=fingerprint({branchId:String(request.branchId),date:request.date,memo:normalizeText(request.memo),lines:request.lines.map(l=>({accountId:String(l.accountId),debit:l.debit,credit:l.credit,description:normalizeText(l.description)})),sourceType:request.sourceType,originalEntryId:String(original._id),reversalReason:reason});if(existing.requestId!==requestId||existing.requestFingerprint!==expected)throw new ConvexError("بيانات العكس مختلفة");return existing;}
```

#### Call 7 at L37
```ts
0034: export const deactivateAccount=mutation({args:{accountId:v.id("chartOfAccounts")},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"manage_chart_of_accounts"),a=await ctx.db.get(args.accountId);if(!a||a.isSystem)throw new ConvexError("لا يمكن تعطيل حساب نظام");await ctx.db.patch(a._id,{isActive:false,deactivatedAt:Date.now(),deactivatedBy:user.userId});await logAction(ctx,user,{action:"deactivate",module:"general_ledger",recordId:String(a._id),recordLabel:a.code});return {accountId:a._id,isActive:false};}});
0035: export const createOrOpenPeriod=mutation({args:{periodKey:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"close_accounting_periods");if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.periodKey))throw new ConvexError("مفتاح الفترة غير صالح");const existing=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",args.periodKey)).unique();if(existing){if(existing.status==="closed")throw new ConvexError("استخدم إعادة الفتح للفترة المغلقة");return existing._id;}const startDate=`${args.periodKey}-01`,d=new Date(`${startDate}T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);const endDate=d.toISOString().slice(0,10);const id=await ctx.db.insert("accountingPeriods",{periodKey:args.periodKey,startDate,endDate,status:"open"});await logAction(ctx,user,{action:"open_period",module:"general_ledger",recordId:String(id),recordLabel:args.periodKey});return id;}});
0036: export const closePeriod=mutation({args:{periodKey:v.string(),reason:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"close_accounting_periods"),p=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",args.periodKey)).unique(),reason=normalizeText(args.reason);if(!p||p.status!=="open"||!reason)throw new ConvexError("الفترة أو السبب غير صالح");const balances=await ctx.db.query("generalLedgerPeriodBalances").withIndex("by_period",q=>q.eq("periodKey",args.periodKey)).collect();const d=balances.reduce((s,x)=>s+x.debitTotal,0),c=balances.reduce((s,x)=>s+x.creditTotal,0);if(Math.round(d*100)!==Math.round(c*100))throw new ConvexError("الفترة غير متوازنة");await ctx.db.patch(p._id,{status:"closed",closedAt:Date.now(),closedBy:user.userId,closeReason:reason});await logAction(ctx,user,{action:"close_period",module:"general_ledger",recordId:String(p._id),details:reason});return p._id;}});
0037: export const reopenPeriod=mutation({args:{periodKey:v.string(),reason:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"reopen_accounting_periods"),p=await ctx.db.query("accountingPeriods").withIndex("by_key",q=>q.eq("periodKey",args.periodKey)).unique(),reason=normalizeText(args.reason);if(!p||p.status!=="closed"||!reason)throw new ConvexError("الفترة أو السبب غير صالح");await ctx.db.patch(p._id,{status:"open",reopenedAt:Date.now(),reopenedBy:user.userId,reopenReason:reason});await logAction(ctx,user,{action:"reopen_period",module:"general_ledger",recordId:String(p._id),details:reason});return p._id;}});
0038: export const periods=query({args:{},handler:async ctx=>{await requirePermission(ctx,"view_general_ledger");return (await ctx.db.query("accountingPeriods").withIndex("by_start").order("desc").collect()).map(p=>({periodKey:p.periodKey,startDate:p.startDate,endDate:p.endDate,status:p.status,closeReason:p.closeReason,reopenReason:p.reopenReason}));}});
0039: export const openingStatus=query({args:{branchId:v.optional(v.id("branches"))},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"view_general_ledger"),branchId=scopedBranch(user,args.branchId),opening=await ctx.db.query("generalLedgerOpenings").withIndex("by_branch",q=>q.eq("branchId",branchId)).unique();if(!opening)return {confirmed:false as const};const entry=opening.openingEntryId?await ctx.db.get(opening.openingEntryId):null;return {confirmed:true as const,openingDate:opening.openingDate,isZeroOpening:opening.isZeroOpening,entryNumber:entry?.entryNumber};}});
0040: export const confirmOpening=mutation({args:{branchId:v.id("branches"),openingDate:v.string(),isZeroOpening:v.boolean(),lines:v.array(lineValidator),requestId:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"initialize_general_ledger"),branchId=scopedBranch(user,args.branchId),requestId=normalizeRequestId(args.requestId),openingDate=assertIsoDate(args.openingDate),fp=fingerprint({branchId:String(branchId),openingDate,isZeroOpening:args.isZeroOpening,lines:args.lines});const retry=await ctx.db.query("generalLedgerOpenings").withIndex("by_request",q=>q.eq("requestId",requestId)).unique();if(retry){if(retry.fingerprint!==fp)throw new ConvexError("معرف الطلب مستخدم بحمولة مختلفة");return retry;}if(await ctx.db.query("generalLedgerOpenings").withIndex("by_branch",q=>q.eq("branchId",branchId)).unique())throw new ConvexError("تم اعتماد افتتاح الفرع");if(await ctx.db.query("journalEntries").withIndex("by_branch_date",q=>q.eq("branchId",branchId)).filter(q=>q.eq(q.field("sourceType"),"manual")).first())throw new ConvexError("لا يمكن الافتتاح بعد حركة يدوية");const settings=await ctx.db.query("generalLedgerSettings").first();if(!settings||openingDate<settings.cutoverDate)throw new ConvexError("تاريخ الافتتاح يسبق القطع");if(args.isZeroOpening&&args.lines.length)throw new ConvexError("الافتتاح الصفري لا يحتوي سطورًا");const entry=args.isZeroOpening?undefined:await postJournal(ctx,user,{branchId,date:openingDate,memo:"الأرصدة الافتتاحية",lines:args.lines,requestId,sourceType:"opening"});const id=await ctx.db.insert("generalLedgerOpenings",{branchId,openingDate,status:"confirmed",isZeroOpening:args.isZeroOpening,openingEntryId:entry?._id,requestId,fingerprint:fp,confirmedAt:Date.now(),confirmedBy:user.userId});return (await ctx.db.get(id))!;}});
0041: export const postManualJournal=mutation({args:{branchId:v.id("branches"),date:v.string(),memo:v.string(),lines:v.array(lineValidator),requestId:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"post_manual_journals"),branchId=scopedBranch(user,args.branchId);if(!await ctx.db.query("generalLedgerOpenings").withIndex("by_branch",q=>q.eq("branchId",branchId)).unique())throw new ConvexError("يجب اعتماد افتتاح الفرع أولًا");return postJournal(ctx,user,{branchId,date:args.date,memo:args.memo,lines:args.lines,requestId:args.requestId,sourceType:"manual"});}});
0042: export const reverseJournal=mutation({args:{entryId:v.id("journalEntries"),reversalDate:v.string(),reason:v.string(),requestId:v.string()},handler:async(ctx,args)=>{
0043:  const user=await requirePermission(ctx,"reverse_journal_entries"),original=await ctx.db.get(args.entryId),reason=normalizeText(args.reason),reversalDate=assertIsoDate(args.reversalDate),requestId=normalizeRequestId(args.requestId);
0044:  if(!original||!["opening","manual"].includes(original.sourceType)||!reason)throw new ConvexError("القيد التشغيلي يُعكس من مسار المستند الأصلي فقط"); scopedBranch(user,original.branchId);
0045:  const lines=await ctx.db.query("journalLines").withIndex("by_entry",q=>q.eq("entryId",original._id)).collect();
0046:  const request={branchId:original.branchId,date:reversalDate,memo:`عكس ${original.entryNumber}: ${reason}`,lines:lines.map(l=>({accountId:l.accountId,debit:l.credit,credit:l.debit,description:`عكس: ${l.description??original.memo}`})),requestId,sourceType:"reversal" as const,originalEntryId:original._id,reversalReason:reason};
0047:  const existing=await ctx.db.query("journalEntries").withIndex("by_original",q=>q.eq("originalEntryId",original._id)).unique();
0048:  if(existing){const expected=fingerprint({branchId:String(request.branchId),date:request.date,memo:normalizeText(request.memo),lines:request.lines.map(l=>({accountId:String(l.accountId),debit:l.debit,credit:l.credit,description:normalizeText(l.description)})),sourceType:request.sourceType,originalEntryId:String(original._id),reversalReason:reason});if(existing.requestId!==requestId||existing.requestFingerprint!==expected)throw new ConvexError("بيانات العكس مختلفة");return existing;}
0049:  if(original.status!=="posted")throw new ConvexError("القيد غير قابل للعكس");
```

## convex/invoices.ts

- Mutations: 7
- logAction calls: 4

### Mutation exports
- L138: `create`
- L242: `recordPayment`
- L244: `refundPayment`
- L246: `update`
- L339: `updateStatus`
- L364: `cancel`
- L402: `remove`

### logAction call sites
#### Call 1 at L230
```ts
0227:       await postFinancialTransaction(ctx, user, { type: "invoice_payment", requestId: args.initialPayment.requestId, date: args.initialPayment.paymentDate, amount: args.initialPayment.amount, description: args.initialPayment.notes?.trim() || `تحصيل أولي للفاتورة ${invoiceNumber}`, branchId: branchId!, referenceType: "invoice", referenceId: String(id), referenceNumber: invoiceNumber, customerId: args.customerId, movements: [{ accountId: paymentAccount._id, signedAmount: args.initialPayment.amount }] });
0228:     }
0229: 
0230:     await logAction(ctx, user, {
0231:       action: "create",
0232:       module: "invoices",
0233:       recordId: id,
0234:       recordLabel: invoiceNumber,
0235:       details: `إنشاء فاتورة ${invoiceNumber} بقيمة ${prepared.total} للعميل ${customerName}`,
0236:     });
0237: 
0238:     return id;
0239:   },
0240: });
0241: 
0242: export const recordPayment = mutation({ args: { invoiceId: v.id("invoices"), amount: v.number(), accountId: v.id("financialAccounts"), paymentDate: v.string(), requestId: v.string(), notes: v.optional(v.string()) }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "record_collections"); const invoice = await ctx.db.get(args.invoiceId); if (!invoice || !invoice.branchId) throw new ConvexError("الفاتورة غير موجودة"); assertBranchAccess(user, invoice); await assertInvoiceNotLockedByActiveDelivery(ctx, invoice._id); if (invoice.status === "cancelled") throw new ConvexError("الفاتورة ملغاة"); if (!Number.isFinite(args.amount) || args.amount <= 0 || args.amount > invoice.remaining) throw new ConvexError("مبلغ التحصيل غير صالح"); const account = await requireActiveFinancialAccount(ctx, args.accountId); assertFinancialAccountBranch(account, invoice.branchId); const posted = await postFinancialTransaction(ctx, user, { type: "invoice_payment", requestId: args.requestId, date: args.paymentDate, amount: args.amount, description: args.notes?.trim() || `تحصيل الفاتورة ${invoice.invoiceNumber}`, branchId: invoice.branchId, referenceType: "invoice", referenceId: String(invoice._id), referenceNumber: invoice.invoiceNumber, customerId: invoice.customerId, movements: [{ accountId: account._id, signedAmount: args.amount }] }); if (!posted.duplicate) { const paid = roundMoney(invoice.paid + args.amount), remaining = roundMoney(invoice.remaining - args.amount); const creditedTotal = invoice.creditedTotal ?? 0, netTotal = invoice.netTotal ?? invoice.total; await ctx.db.patch(invoice._id, { paid, remaining, status: deriveInvoiceStatus({ netTotal, creditedTotal, paid, remaining }), paymentMethod: account.type }); if (invoice.customerId) await postCustomerLedgerEntry(ctx, user, { type: "invoice_payment", requestId: `${args.requestId}:ledger`, customerId: invoice.customerId, branchId: invoice.branchId, date: args.paymentDate, receivableDelta: -args.amount, advanceDelta: 0, purchasesDelta: 0, description: `تحصيل الفاتورة ${invoice.invoiceNumber}`, referenceType: "invoice", referenceId: String(invoice._id), referenceNumber: invoice.invoiceNumber }); } return posted.transactionId; } });
```

#### Call 2 at L329
```ts
0326:       if (inv.customerId) await postCustomerLedgerEntry(ctx, user, { type: "invoice_adjustment", requestId: `${requestId}:old`, customerId: inv.customerId, branchId: inv.branchId!, date, receivableDelta: -inv.remaining, advanceDelta: 0, purchasesDelta: -(inv.netTotal ?? inv.total), description: `نقل الفاتورة ${inv.invoiceNumber} من العميل`, referenceType: "invoice", referenceId: String(id), referenceNumber: inv.invoiceNumber });
0327:       if (data.customerId) await postCustomerLedgerEntry(ctx, user, { type: "invoice_adjustment", requestId: `${requestId}:new`, customerId: data.customerId, branchId: branchId!, date, receivableDelta: prepared.remaining, advanceDelta: 0, purchasesDelta: prepared.total, description: `نقل الفاتورة ${inv.invoiceNumber} إلى العميل`, referenceType: "invoice", referenceId: String(id), referenceNumber: inv.invoiceNumber });
0328:     }
0329:     await logAction(ctx, user, {
0330:       action: "update",
0331:       module: "invoices",
0332:       recordId: id,
0333:       recordLabel: inv.invoiceNumber,
0334:       details: `تعديل الفاتورة ${inv.invoiceNumber}`,
0335:     });
0336:   },
0337: });
0338: 
0339: export const updateStatus = mutation({
0340:   args: {
0341:     id: v.id("invoices"),
```

#### Call 3 at L354
```ts
0351:       throw new ConvexError("حالة الفاتورة تُحتسب من المدفوع والمتبقي ولا يمكن تغييرها يدوياً");
0352:     }
0353:     await ctx.db.patch(args.id, { status: args.status });
0354:     await logAction(ctx, user, {
0355:       action: "update",
0356:       module: "invoices",
0357:       recordId: args.id,
0358:       recordLabel: inv.invoiceNumber,
0359:       details: `تغيير حالة الفاتورة ${inv.invoiceNumber} إلى ${args.status}`,
0360:     });
0361:   },
0362: });
0363: 
0364: export const cancel = mutation({
0365:   args: { id: v.id("invoices"), reason: v.string(), date: v.string(), requestId: v.string() },
0366:   handler: async (ctx, args) => {
```

#### Call 4 at L392
```ts
0389:       await postCustomerLedgerEntry(ctx, user, { type: "invoice_cancel", requestId: args.requestId, customerId: inv.customerId, branchId: inv.branchId!, date: args.date, receivableDelta: -inv.remaining, advanceDelta: 0, purchasesDelta: -(inv.netTotal ?? inv.total), description: `إلغاء الفاتورة ${inv.invoiceNumber}`, referenceType: "invoice", referenceId: String(inv._id), referenceNumber: inv.invoiceNumber });
0390:     }
0391:     await ctx.db.patch(args.id, { status: "cancelled", cancelledAt: Date.now(), cancelledBy: user.userId, cancellationReason: reason });
0392:     await logAction(ctx, user, {
0393:       action: "cancel",
0394:       module: "invoices",
0395:       recordId: args.id,
0396:       recordLabel: inv.invoiceNumber,
0397:       details: `إلغاء الفاتورة ${inv.invoiceNumber}: ${reason}`,
0398:     });
0399:   },
0400: });
0401: 
0402: export const remove = mutation({ args: { id: v.id("invoices") }, handler: async () => { throw new ConvexError("استخدم مسار إلغاء الفاتورة مع إدخال السبب"); } });
0403: 
0404: export const stats = query({
```

## convex/leads.ts

- Mutations: 7
- logAction calls: 7

### Mutation exports
- L83: `create`
- L117: `update`
- L151: `updateStatus`
- L177: `convertToCustomer`
- L215: `remove`
- L253: `addActivity`
- L285: `deleteActivity`

### logAction call sites
#### Call 1 at L106
```ts
0103:       status: args.status ?? "new",
0104:       lastContactDate: new Date().toISOString().split("T")[0],
0105:     });
0106:     await logAction(ctx, user, {
0107:       action: "create",
0108:       module: "leads",
0109:       recordId: id,
0110:       recordLabel: args.name,
0111:       details: `إضافة عميل محتمل: ${args.name} - ${args.phone}`,
0112:     });
0113:     return id;
0114:   },
0115: });
0116: 
0117: export const update = mutation({
0118:   args: {
```

#### Call 2 at L141
```ts
0138:     assertBranchAccess(user, lead);
0139:     const branchId = resolveWriteBranch(user, data.branchId ?? lead.branchId);
0140:     await ctx.db.patch(id, { ...data, branchId });
0141:     await logAction(ctx, user, {
0142:       action: "update",
0143:       module: "leads",
0144:       recordId: id,
0145:       recordLabel: args.name,
0146:       details: `تحديث بيانات العميل المحتمل: ${args.name}`,
0147:     });
0148:   },
0149: });
0150: 
0151: export const updateStatus = mutation({
0152:   args: {
0153:     id: v.id("leads"),
```

#### Call 3 at L167
```ts
0164:       lostReason: args.lostReason,
0165:       lastContactDate: new Date().toISOString().split("T")[0],
0166:     });
0167:     await logAction(ctx, user, {
0168:       action: "update",
0169:       module: "leads",
0170:       recordId: args.id,
0171:       recordLabel: lead.name,
0172:       details: `تحديث حالة العميل ${lead.name} إلى: ${args.status}`,
0173:     });
0174:   },
0175: });
0176: 
0177: export const convertToCustomer = mutation({
0178:   args: {
0179:     id: v.id("leads"),
```

#### Call 4 at L204
```ts
0201:       convertedToCustomerId: customerId,
0202:       lastContactDate: new Date().toISOString().split("T")[0],
0203:     });
0204:     await logAction(ctx, user, {
0205:       action: "convert",
0206:       module: "leads",
0207:       recordId: args.id,
0208:       recordLabel: lead.name,
0209:       details: `تحويل العميل المحتمل ${lead.name} إلى عميل فعلي`,
0210:     });
0211:     return customerId;
0212:   },
0213: });
0214: 
0215: export const remove = mutation({
0216:   args: { id: v.id("leads") },
```

#### Call 5 at L228
```ts
0225:       .collect();
0226:     for (const a of activities) await ctx.db.delete(a._id);
0227:     await ctx.db.delete(args.id);
0228:     await logAction(ctx, user, {
0229:       action: "delete",
0230:       module: "leads",
0231:       recordId: args.id,
0232:       recordLabel: lead.name,
0233:       details: `حذف العميل المحتمل: ${lead.name}`,
0234:     });
0235:   },
0236: });
0237: 
0238: export const listActivities = query({
0239:   args: { leadId: v.id("leads") },
0240:   handler: async (ctx, args) => {
```

#### Call 6 at L274
```ts
0271:       ...args,
0272:       createdBy: user.name,
0273:     });
0274:     await logAction(ctx, user, {
0275:       action: "create",
0276:       module: "leads",
0277:       recordId: id,
0278:       recordLabel: lead.name,
0279:       details: `إضافة نشاط للعميل ${lead.name}: ${args.type}`,
0280:     });
0281:     return id;
0282:   },
0283: });
0284: 
0285: export const deleteActivity = mutation({
0286:   args: { id: v.id("leadActivities") },
```

#### Call 7 at L295
```ts
0292:     if (!lead) throw new ConvexError("العميل المحتمل غير موجود");
0293:     assertBranchAccess(user, lead);
0294:     await ctx.db.delete(args.id);
0295:     await logAction(ctx, user, {
0296:       action: "delete",
0297:       module: "leads",
0298:       recordId: args.id,
0299:       recordLabel: undefined,
0300:       details: `حذف نشاط`,
0301:     });
0302:   },
0303: });
```

## convex/lib/auth.ts

- Mutations: 0
- logAction calls: 2

### logAction call sites
#### Call 1 at L177
```ts
0174: // ──────────────────────────────────────────────
0175: // logAction — centralized audit logging
0176: // Matches the call signature used by all modules:
0177: //   logAction(ctx, user, { action, module, recordId, recordLabel, details })
0178: // ──────────────────────────────────────────────
0179: export async function logAction(
0180:   ctx: MutationCtx,
0181:   user: AuthUser,
0182:   params: {
0183:     action: string;
0184:     module: string;
0185:     recordId?: string;
0186:     recordLabel?: string;
0187:     details?: string;
0188:   }
0189: ) {
```

#### Call 2 at L179
```ts
0176: // Matches the call signature used by all modules:
0177: //   logAction(ctx, user, { action, module, recordId, recordLabel, details })
0178: // ──────────────────────────────────────────────
0179: export async function logAction(
0180:   ctx: MutationCtx,
0181:   user: AuthUser,
0182:   params: {
0183:     action: string;
0184:     module: string;
0185:     recordId?: string;
0186:     recordLabel?: string;
0187:     details?: string;
0188:   }
0189: ) {
0190:   await ctx.db.insert("auditLogs", {
0191:     userId: user.userId,
```

## convex/lib/customerLedger.ts

- Mutations: 0
- logAction calls: 1

### logAction call sites
#### Call 1 at L104
```ts
0101:   const values = { receivableBalance: receivableAfter, advanceBalance: advanceAfter, totalPurchases: totalPurchasesAfter, updatedAt: now, ...(input.openingBalance ? { openingBalancePostedAt: now } : {}) };
0102:   if (snapshot) await ctx.db.patch(snapshot._id, values);
0103:   else await ctx.db.insert("customerBalances", { key, customerId: input.customerId, branchId: input.branchId, ...values });
0104:   await logAction(ctx, user, { action: "post", module: "customer_ledger", recordId: entryId, recordLabel: entryNumber, details: `${input.description} (${customer.name})` });
0105:   return { entryId, duplicate: false, entry: await ctx.db.get(entryId) };
0106: }
0107: 
0108: export async function initializeCustomerBalance(ctx: MutationCtx, user: AuthUser, input: { customerId: Id<"customers">; branchId: Id<"branches">; receivableBalance: number; advanceBalance: number; totalPurchases: number; date: string; requestId: string; notes?: string }) {
0109:   for (const value of [input.receivableBalance, input.advanceBalance, input.totalPurchases]) if (!precise(value) || value < 0) throw new ConvexError("الأرصدة الافتتاحية يجب أن تكون غير سالبة ودقيقة ماليًا");
0110:   return postCustomerLedgerEntry(ctx, user, { type: "opening_balance", requestId: input.requestId, customerId: input.customerId, branchId: input.branchId, date: input.date, receivableDelta: input.receivableBalance, advanceDelta: input.advanceBalance, purchasesDelta: input.totalPurchases, description: input.notes?.trim() || "الرصيد الافتتاحي للعميل", referenceType: "customer", referenceId: String(input.customerId), referenceNumber: "OPENING", openingBalance: true });
0111: }
```

## convex/lib/generalLedger.ts

- Mutations: 0
- logAction calls: 1

### logAction call sites
#### Call 1 at L58
```ts
0055:   const entryNumber=await nextDocumentNumber(ctx,"journal",new Date(`${date}T00:00:00Z`)), now=Date.now();
0056:   const entryId=await ctx.db.insert("journalEntries",{entryNumber,branchId:input.branchId,entryDate:date,periodKey,sourceType:input.sourceType,status:"posted",memo,totalDebit:fromCents(debitCents),totalCredit:fromCents(creditCents),lineCount:prepared.length,requestId,idempotencyKey,requestFingerprint,originalEntryId:input.originalEntryId,reversalReason:input.reversalReason,operationType:input.operationType,referenceType:input.referenceType,referenceId:input.referenceId,referenceNumber:input.referenceNumber,financialTransactionId:input.financialTransactionId,postedAt:now,postedBy:user.userId});
0057:   for(const line of prepared) { await ctx.db.insert("journalLines",{entryId,entryNumber,lineNumber:line.lineNumber,branchId:input.branchId,entryDate:date,periodKey,accountId:line.account._id,accountCodeSnapshot:line.account.code,accountNameSnapshot:line.account.nameAr,normalSideSnapshot:line.account.normalSide,debit:line.debit,credit:line.credit,description:line.description}); await updateBalances(ctx,entryId,input.branchId,date,periodKey,line.account._id,line.debit,line.credit); }
0058:   await logAction(ctx,user,{action:"post",module:"general_ledger",recordId:String(entryId),recordLabel:entryNumber,details:`${input.sourceType}; debit=${fromCents(debitCents)}; credit=${fromCents(creditCents)}`});
0059:   const entry=await ctx.db.get(entryId); if(!entry) throw new ConvexError("تعذر حفظ القيد"); return entry;
0060: }
```

## convex/lib/supplierLedger.ts

- Mutations: 0
- logAction calls: 1

### logAction call sites
#### Call 1 at L49
```ts
0046:     referenceId: input.referenceId, referenceNumber: input.referenceNumber, externalInvoiceNumber: input.externalInvoiceNumber, dueDate: input.dueDate,
0047:     description: input.description, userId: user.userId, createdAt: now, originalEntryId: input.originalEntryId });
0048:   if (input.originalEntryId) await ctx.db.patch(input.originalEntryId, { status: "reversed", reversedAt: now, reversedBy: user.userId, reversalReason: input.reversalReason, reversalDate: input.reversalDate, reversalEntryId: id });
0049:   await logAction(ctx, user, { action: input.type === "reversal" ? "reverse" : "post", module: "supplier_ledger", recordId: id, recordLabel: entryNumber, details: JSON.stringify({ type: input.type, amountDelta, balanceBefore, balanceAfter, branchId: input.branchId }) });
0050:   const entry = await ctx.db.get(id);
0051:   if (!entry) throw new ConvexError("تعذر إنشاء حركة المورد");
0052:   return entry;
0053: }
0054: 
0055: export async function postSupplierLedgerEntry(ctx: MutationCtx, user: AuthUser, input: {
0056:   requestId: string; supplierId: Id<"suppliers">; branchId: Id<"branches">; date: string; amount: number;
0057:   referenceId: string; referenceNumber: string; externalInvoiceNumber?: string; dueDate?: string;
0058: }) {
0059:   return await postSupplierBalanceMovement(ctx, user, { ...input, type: "purchase_receipt", amountDelta: input.amount,
0060:     referenceType: "purchase_receipt", description: `استلام شراء ${input.referenceNumber}` });
0061: }
```

## convex/orders.ts

- Mutations: 8
- logAction calls: 6

### Mutation exports
- L154: `rebuildStats`
- L170: `create`
- L236: `update`
- L294: `updateStatus`
- L311: `addPayment`
- L336: `refundDeposit`
- L363: `cancel`
- L383: `remove`

### logAction call sites
#### Call 1 at L231
```ts
0228:     await applyOrderStatsChange(ctx, undefined, { status: "pending", total, remaining, branchId });
0229:     if (args.initialDeposit && args.customerId) await postCustomerLedgerEntry(ctx, user, { type: "order_deposit", requestId: `${args.initialDeposit.requestId}:ledger`, customerId: args.customerId, branchId: branchId!, date: args.initialDeposit.paymentDate, receivableDelta: 0, advanceDelta: deposit, purchasesDelta: 0, description: `عربون الطلب ${orderNumber}`, referenceType: "order", referenceId: String(id), referenceNumber: orderNumber });
0230:     if (args.initialDeposit && account) await postFinancialTransaction(ctx, user, { type: "order_deposit", requestId: args.initialDeposit.requestId, date: args.initialDeposit.paymentDate, amount: deposit, description: args.initialDeposit.notes?.trim() || `عربون الطلب ${orderNumber}`, branchId: branchId!, referenceType: "order", referenceId: String(id), referenceNumber: orderNumber, customerId: args.customerId, movements: [{ accountId: account._id, signedAmount: deposit }] });
0231:     await logAction(ctx, user, { action: "create", module: "orders", recordId: id, recordLabel: orderNumber, details: `إنشاء طلب جديد: ${orderNumber} للعميل ${customerName}` });
0232:     return id;
0233:   },
0234: });
0235: 
0236: export const update = mutation({
0237:   args: {
0238:     id: v.id("orders"),
0239:     customerId: v.optional(v.id("customers")),
0240:     customerName: v.string(),
0241:     customerPhone: v.optional(v.string()),
0242:     items: v.array(v.object({ productName: v.string(), quantity: v.number(), unitPrice: v.number(), notes: v.optional(v.string()) })),
0243:     expectedDate: v.optional(v.string()),
```

#### Call 2 at L290
```ts
0287:       notes: args.notes?.trim() || undefined,
0288:     });
0289:     await applyOrderStatsChange(ctx, order, { ...order, total, remaining });
0290:     await logAction(ctx, user, { action: "update", module: "orders", recordId: order._id, recordLabel: order.orderNumber, details: `تعديل بيانات وبنود الطلب ${order.orderNumber}` });
0291:   },
0292: });
0293: 
0294: export const updateStatus = mutation({
0295:   args: { id: v.id("orders"), status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("ready"), v.literal("delivered"), v.literal("cancelled")), reason: v.optional(v.string()) },
0296:   handler: async (ctx, args) => {
0297:     const user = await requireModulePermission(ctx, "edit_orders", "orders");
0298:     const order = await ctx.db.get(args.id);
0299:     if (!order) throw new ConvexError("الطلب غير موجود");
0300:     assertBranchAccess(user, order);
0301:     if (args.status === "cancelled") throw new ConvexError("استخدم مسار إلغاء الطلب المخصص");
0302:     if (args.status === "delivered" && order.linkedInvoiceId) throw new ConvexError("يجب تأكيد التسليم من مسار التوصيل");
```

#### Call 3 at L307
```ts
0304:     if (!canTransition(ORDER_TRANSITIONS, order.status, args.status)) throw new ConvexError(`لا يمكن تغيير حالة الطلب من ${order.status} إلى ${args.status}`);
0305:     await ctx.db.patch(args.id, { status: args.status });
0306:     await applyOrderStatsChange(ctx, order, { ...order, status: args.status });
0307:     await logAction(ctx, user, { action: "update", module: "orders", recordId: args.id, recordLabel: order.orderNumber, details: `تحديث حالة الطلب ${order.orderNumber} إلى: ${args.status}` });
0308:   },
0309: });
0310: 
0311: export const addPayment = mutation({
0312:   args: { id: v.id("orders"), amount: v.number(), accountId: v.id("financialAccounts"), paymentDate: v.string(), requestId: v.string(), notes: v.optional(v.string()) },
0313:   handler: async (ctx, args) => {
0314:     const user = await requireModulePermission(ctx, "record_collections", "orders");
0315:     const order = await ctx.db.get(args.id);
0316:     if (!order) throw new ConvexError("الطلب غير موجود");
0317:     assertBranchAccess(user, order);
0318:     if (order.linkedInvoiceId) throw new ConvexError("لا يمكن إضافة عربون بعد ربط الطلب بالفاتورة");
0319:     if (order.status === "cancelled" || order.status === "delivered") throw new ConvexError("لا يمكن تسجيل دفعة لطلب ملغي أو مسلم");
```

#### Call 4 at L331
```ts
0328:     await postCustomerLedgerEntry(ctx, user, { type: "order_deposit", requestId: `${args.requestId}:ledger`, customerId: order.customerId, branchId: order.branchId, date: args.paymentDate, receivableDelta: 0, advanceDelta: args.amount, purchasesDelta: 0, description: `دفعة الطلب ${order.orderNumber}`, referenceType: "order", referenceId: String(order._id), referenceNumber: order.orderNumber });
0329:     await ctx.db.patch(args.id, { deposit: newDeposit, remaining: newRemaining, status: order.status });
0330:     await applyOrderStatsChange(ctx, order, { ...order, remaining: newRemaining });
0331:     await logAction(ctx, user, { action: "update", module: "orders", recordId: args.id, recordLabel: order.orderNumber, details: `دفعة جديدة بقيمة ${args.amount} للطلب ${order.orderNumber}` });
0332:     return posted.transactionId;
0333:   },
0334: });
0335: 
0336: export const refundDeposit = mutation({
0337:   args: { id: v.id("orders"), amount: v.number(), accountId: v.id("financialAccounts"), date: v.string(), reason: v.string(), requestId: v.string() },
0338:   handler: async (ctx, args) => {
0339:     const user = await requirePermission(ctx, "refund_collections");
0340:     const order = await ctx.db.get(args.id);
0341:     if (!order || !order.branchId) throw new ConvexError("الطلب غير موجود");
0342:     assertBranchAccess(user, order);
0343:     if (order.linkedInvoiceId) throw new ConvexError("لا يمكن استرداد عربون بعد ربط الطلب بالفاتورة");
```

#### Call 5 at L358
```ts
0355:     const nextRemaining = roundMoney(order.remaining + args.amount);
0356:     await ctx.db.patch(order._id, { deposit: roundMoney(order.deposit - args.amount), remaining: nextRemaining });
0357:     await applyOrderStatsChange(ctx, order, { ...order, remaining: nextRemaining });
0358:     await logAction(ctx, user, { action: "refund", module: "orders", recordId: order._id, recordLabel: order.orderNumber, details: `استرداد عربون بقيمة ${args.amount}: ${reason}` });
0359:     return posted.transactionId;
0360:   },
0361: });
0362: 
0363: export const cancel = mutation({
0364:   args: { id: v.id("orders"), reason: v.string() },
0365:   handler: async (ctx, args) => {
0366:     const user = await requireModulePermission(ctx, "delete_orders", "orders");
0367:     const order = await ctx.db.get(args.id);
0368:     if (!order) throw new ConvexError("الطلب غير موجود");
0369:     assertBranchAccess(user, order);
0370:     const reason = args.reason.trim();
```

#### Call 6 at L379
```ts
0376:     if (order.deposit > 0) throw new ConvexError("الطلب يحتوي عربوناً ويحتاج معالجة استرداد مالي");
0377:     await ctx.db.patch(args.id, { status: "cancelled", cancelledAt: Date.now(), cancelledBy: user.userId, cancellationReason: reason });
0378:     await applyOrderStatsChange(ctx, order, { ...order, status: "cancelled" });
0379:     await logAction(ctx, user, { action: "cancel", module: "orders", recordId: args.id, recordLabel: order.orderNumber, details: `إلغاء الطلب ${order.orderNumber}: ${reason}` });
0380:   },
0381: });
0382: 
0383: export const remove = mutation({ args: { id: v.id("orders") }, handler: async () => { throw new ConvexError("استخدم مسار إلغاء الطلب مع إدخال السبب"); } });
```

## convex/products.ts

- Mutations: 5
- logAction calls: 4

### Mutation exports
- L49: `create`
- L77: `update`
- L106: `adjustStock`
- L137: `setActive`
- L145: `remove`

### logAction call sites
#### Call 1 at L72
```ts
0069:       unit: normalized.unit, branchId, description: args.description?.trim() || undefined, isActive: true,
0070:     });
0071:     if (args.stock > 0) await changeProductStock(ctx, user, { productId: id, quantityDelta: args.stock, unitCost: args.costPrice, type: INVENTORY_MOVEMENT_TYPES.openingBalance, reason: "الرصيد الافتتاحي" });
0072:     await logAction(ctx, user, { action: "create", module: "products", recordId: id, recordLabel: normalized.name, details: `إضافة منتج جديد: ${normalized.name}` });
0073:     return id;
0074:   },
0075: });
0076: 
0077: export const update = mutation({
0078:   args: {
0079:     id: v.id("products"), name: v.string(), sku: v.string(), barcode: v.optional(v.string()),
0080:     categoryId: v.optional(v.id("categories")), supplierId: v.optional(v.id("suppliers")), warrantyMonths: v.optional(v.number()),
0081:     costPrice: v.number(), sellPrice: v.number(), minStock: v.number(), unit: v.string(),
0082:     branchId: v.optional(v.id("branches")), description: v.optional(v.string()),
0083:   },
0084:   handler: async (ctx, args) => {
```

#### Call 2 at L102
```ts
0099:       sellPrice: args.sellPrice, minStock: args.minStock, unit: normalized.unit,
0100:       branchId, description: args.description?.trim() || undefined,
0101:     });
0102:     await logAction(ctx, user, { action: "update", module: "products", recordId: args.id, recordLabel: normalized.name, details: `تعديل المنتج: ${normalized.name}` });
0103:   },
0104: });
0105: 
0106: export const adjustStock = mutation({
0107:   args: { id: v.id("products"), adjustment: v.number(), reason: v.string() },
0108:   handler: async (ctx, args) => {
0109:     const user = await requirePermission(ctx, "edit_products");
0110:     const current = await ctx.db.get(args.id); if (!current) throw new ConvexError("المنتج غير موجود");
0111:     await changeProductStock(ctx, user, { productId: args.id, quantityDelta: args.adjustment, unitCost: current.costPrice, type: INVENTORY_MOVEMENT_TYPES.manualAdjustment, reason: args.reason });
0112:     await logAction(ctx, user, { action: "update", module: "products", recordId: args.id, details: `تعديل يدوي للمخزون: ${args.adjustment > 0 ? "+" : ""}${args.adjustment} - ${args.reason.trim()}` });
0113:   },
0114: });
```

#### Call 3 at L112
```ts
0109:     const user = await requirePermission(ctx, "edit_products");
0110:     const current = await ctx.db.get(args.id); if (!current) throw new ConvexError("المنتج غير موجود");
0111:     await changeProductStock(ctx, user, { productId: args.id, quantityDelta: args.adjustment, unitCost: current.costPrice, type: INVENTORY_MOVEMENT_TYPES.manualAdjustment, reason: args.reason });
0112:     await logAction(ctx, user, { action: "update", module: "products", recordId: args.id, details: `تعديل يدوي للمخزون: ${args.adjustment > 0 ? "+" : ""}${args.adjustment} - ${args.reason.trim()}` });
0113:   },
0114: });
0115: 
0116: export const movements = query({
0117:   args: { productId: v.id("products") },
0118:   handler: async (ctx, args) => {
0119:     const user = await requirePermission(ctx, "view_products");
0120:     const product = await ctx.db.get(args.productId);
0121:     if (!product) throw new ConvexError("المنتج غير موجود");
0122:     assertBranchAccess(user, product);
0123:     const movements = await ctx.db.query("inventoryMovements").withIndex("by_product", (q) => q.eq("productId", args.productId)).order("desc").collect();
0124:     if (user.permissions.includes("view_profits")) return movements;
```

#### Call 4 at L134
```ts
0131:   if (!product) throw new ConvexError("المنتج غير موجود");
0132:   assertBranchAccess(user, product);
0133:   await ctx.db.patch(id, { isActive });
0134:   await logAction(ctx, user, { action: "update", module: "products", recordId: id, recordLabel: product.name, details: `${isActive ? "إعادة تفعيل" : "تعطيل"} المنتج: ${product.name}` });
0135: }
0136: 
0137: export const setActive = mutation({
0138:   args: { id: v.id("products"), isActive: v.boolean() },
0139:   handler: async (ctx, args) => {
0140:     const user = await requirePermission(ctx, "edit_products");
0141:     await applyActiveState(ctx, user, args.id, args.isActive);
0142:   },
0143: });
0144: 
0145: export const remove = mutation({
0146:   args: { id: v.id("products") },
```

## convex/purchaseReturns.ts

- Mutations: 2
- logAction calls: 2

### Mutation exports
- L20: `create`
- L44: `reverse`

### logAction call sites
#### Call 1 at L41
```ts
0038:   let refundLedger,supplierLedger,financial;if(state.cashRefund>0&&account){financial=await postFinancialTransaction(ctx,user,{type:"supplier_refund",requestId:`${requestId}:cash`,date:args.date,amount:state.cashRefund,description:`رد نقدي من المورد عن ${returnNumber}`,branchId,referenceType:"purchase_return",referenceId:String(returnId),referenceNumber:returnNumber,supplierId:supplier._id,movements:[{accountId:account._id,signedAmount:state.cashRefund}]});refundLedger=await postSupplierBalanceMovement(ctx,user,{type:"supplier_refund",requestId:`${requestId}:refund-ledger`,supplierId:supplier._id,branchId,date:args.date,amountDelta:state.cashRefund,referenceType:"purchase_return",referenceId:String(returnId),referenceNumber:returnNumber,description:`رد نقدي من المورد ${returnNumber}`});}
0039:   if(totalCredit>0)supplierLedger=await postSupplierBalanceMovement(ctx,user,{type:"purchase_return",requestId:`${requestId}:credit-ledger`,supplierId:supplier._id,branchId,date:args.date,amountDelta:-totalCredit,referenceType:"purchase_return",referenceId:String(returnId),referenceNumber:returnNumber,description:`خصم مرتجع شراء ${returnNumber}`});
0040:   const supplierBalanceBefore=refundLedger?.balanceBefore??supplierLedger?.balanceBefore;if(supplierLedger&&supplierBalanceBefore!==undefined&&roundMoney(supplierLedger.balanceAfter)!==roundMoney(supplierBalanceBefore-state.debtReduction))throw new ConvexError("رصيد المورد غير متسق بعد إشعار الخصم");
0041:   await ctx.db.patch(receipt._id,{creditedTotal:roundMoney((receipt.creditedTotal??0)+totalCredit),returnedGoodsTotal:roundMoney((receipt.returnedGoodsTotal??0)+goodsCredit),returnedFreightTotal:roundMoney((receipt.returnedFreightTotal??0)+freight),netPayableAmount:state.netPayableAmount,paidAmount:state.paidAmount,remainingAmount:state.remainingAmount,status:state.status});const journal=await postPurchaseReturnJournal(ctx,user,{branchId,date:args.date,requestId:`purchase-return:${returnId}:create`,referenceId:String(returnId),referenceNumber:returnNumber,totalCredit,inventoryValueRemoved});await ctx.db.patch(returnId,{items:stored,inventoryValueRemoved,supplierLedgerEntryId:supplierLedger?._id,supplierRefundLedgerEntryId:refundLedger?._id,financialTransactionId:financial?.transactionId,journalEntryId:journal?._id});await logAction(ctx,user,{action:"post",module:"purchase_returns",recordId:returnId,recordLabel:returnNumber,details:JSON.stringify({receipt:receipt.receiptNumber,supplier:supplier.name,branchId,totalCredit,debtReduction:state.debtReduction,cashRefund:state.cashRefund,inventoryValueRemoved,reason})});return returnId;
0042: }});
0043: 
0044: export const reverse=mutation({args:{purchaseReturnId:v.id("purchaseReturns"),date:v.string(),reason:v.string(),requestId:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"reverse_purchase_returns");if(!user.permissions.includes("reverse_financial_transactions")) throw new ConvexError("عكس المرتجع يتطلب صلاحية عكس المعاملات المالية");const row=await ctx.db.get(args.purchaseReturnId);if(!row) throw new ConvexError("مستند المرتجع غير موجود");assertBranchAccess(user,row);const reason=args.reason.trim(),requestId=args.requestId.trim(),reversalFingerprint=fingerprint({requestId,date:args.date,reason});if(row.status==="reversed"){if(row.reversalRequestId===requestId&&row.reversalFingerprint===reversalFingerprint)return row._id;throw new ConvexError("تم عكس المرتجع سابقاً بطلب مختلف");}if(!reason||!requestId) throw new ConvexError("سبب ومعرف طلب العكس مطلوبان");await requireFinanceInitialized(ctx,args.date);const receipt=await ctx.db.get(row.purchaseReceiptId);if(!receipt) throw new ConvexError("مستند الشراء الأصلي غير موجود");let reversalFinancialTransactionId;if(row.financialTransactionId)reversalFinancialTransactionId=await reversePostedFinancialTransaction(ctx,user,{transactionId:row.financialTransactionId,reason,date:args.date,requestId:`${requestId}:cash`,referenceType:"purchase_return",referenceId:String(row._id),referenceNumber:row.returnNumber});for(const item of row.items)await changeProductStock(ctx,user,{productId:item.productId,quantityDelta:item.quantityReturned,type:INVENTORY_MOVEMENT_TYPES.purchaseReturn,reason:`عكس مرتجع شراء ${row.returnNumber}`,referenceId:String(row._id),referenceType:"purchase_return_reversal",unitCost:item.inventoryValueRemoved/item.quantityReturned,valueDelta:item.inventoryValueRemoved});let reversalSupplierLedgerEntryId,reversalSupplierRefundLedgerEntryId;if(row.supplierLedgerEntryId){const e=await postSupplierBalanceMovement(ctx,user,{type:"reversal",requestId:`${requestId}:credit-ledger`,supplierId:row.supplierId,branchId:row.branchId,date:args.date,amountDelta:row.totalCredit,referenceType:"purchase_return",referenceId:String(row._id),referenceNumber:row.returnNumber,description:`عكس خصم ${row.returnNumber}`,originalEntryId:row.supplierLedgerEntryId,reversalReason:reason,reversalDate:args.date});reversalSupplierLedgerEntryId=e._id;}if(row.supplierRefundLedgerEntryId){const e=await postSupplierBalanceMovement(ctx,user,{type:"reversal",requestId:`${requestId}:refund-ledger`,supplierId:row.supplierId,branchId:row.branchId,date:args.date,amountDelta:-row.cashRefund,referenceType:"purchase_return",referenceId:String(row._id),referenceNumber:row.returnNumber,description:`عكس رد المورد ${row.returnNumber}`,originalEntryId:row.supplierRefundLedgerEntryId,reversalReason:reason,reversalDate:args.date});reversalSupplierRefundLedgerEntryId=e._id;}const originalLedger=row.supplierLedgerEntryId?await ctx.db.get(row.supplierLedgerEntryId):undefined,finalReversalLedger=reversalSupplierRefundLedgerEntryId?await ctx.db.get(reversalSupplierRefundLedgerEntryId):reversalSupplierLedgerEntryId?await ctx.db.get(reversalSupplierLedgerEntryId):undefined;if(originalLedger&&finalReversalLedger&&roundMoney(finalReversalLedger.balanceAfter)!==roundMoney((row.supplierRefundLedgerEntryId?(await ctx.db.get(row.supplierRefundLedgerEntryId))?.balanceBefore:originalLedger.balanceBefore)??originalLedger.balanceBefore))throw new ConvexError("رصيد المورد غير متسق بعد عكس إشعار الخصم");let state;try{state=purchaseReceiptAfterReversal(receipt.netPayableAmount??receipt.payableAmount,receipt.paidAmount,receipt.remainingAmount,row.totalCredit,row.debtReduction,row.cashRefund);}catch(error){throw errorOf(error);}await ctx.db.patch(receipt._id,{creditedTotal:roundMoney((receipt.creditedTotal??0)-row.totalCredit),returnedGoodsTotal:roundMoney((receipt.returnedGoodsTotal??0)-row.goodsCredit),returnedFreightTotal:roundMoney((receipt.returnedFreightTotal??0)-row.freightCredit),...state});const reversalJournal=await reversePurchaseReturnJournal(ctx,user,{branchId:row.branchId,date:args.date,requestId:`purchase-return:${row._id}:reverse:${requestId}`,referenceId:String(row._id),referenceNumber:row.returnNumber,originalEntryId:row.journalEntryId,reason,hasAccountingImpact:row.totalCredit>0||row.inventoryValueRemoved>0});await ctx.db.patch(row._id,{status:"reversed",reversedAt:Date.now(),reversedBy:user.userId,reversalReason:reason,reversalDate:args.date,reversalRequestId:requestId,reversalFingerprint,reversalFinancialTransactionId,reversalSupplierLedgerEntryId,reversalSupplierRefundLedgerEntryId,reversalJournalEntryId:reversalJournal?._id});await logAction(ctx,user,{action:"reverse",module:"purchase_returns",recordId:row._id,recordLabel:row.returnNumber,details:JSON.stringify({reason,date:args.date,totalCredit:row.totalCredit,cashRefund:row.cashRefund,inventoryValueRemoved:row.inventoryValueRemoved})});return row._id;}});
0045: 
0046: export const supplierOptions=query({args:{},handler:async ctx=>{await requirePermission(ctx,"create_purchase_returns");return(await ctx.db.query("suppliers").collect()).filter(x=>x.isActive!==false).map(x=>({_id:x._id,name:x.name}));}});
0047: export const eligibleReceipts=query({args:{supplierId:v.id("suppliers"),branchId:v.optional(v.id("branches"))},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"create_purchase_returns"),branchId=resolveWriteBranch(user,args.branchId);if(!branchId)throw new ConvexError("اختر الفرع");const rows=await ctx.db.query("purchaseReceipts").withIndex("by_supplier_branch_date",q=>q.eq("supplierId",args.supplierId).eq("branchId",branchId)).collect();const returns=await Promise.all(rows.map(row=>ctx.db.query("purchaseReturns").withIndex("by_purchase_receipt",q=>q.eq("purchaseReceiptId",row._id)).collect()));return rows.map((row,i)=>{const posted=returns[i].filter(x=>x.status==="posted");const items=row.items.map((item,index)=>{const returned=posted.flatMap(x=>x.items).filter(x=>x.receiptItemIndex===index).reduce((s,x)=>s+x.quantityReturned,0);return{receiptItemIndex:index,productName:item.productName,originalQuantity:item.quantity,returnedQuantity:returned,availableQuantity:item.quantity-returned,historicalLineTotal:item.lineTotal,historicalUnitCost:item.unitCost};});const returnedFreight=row.returnedFreightTotal??0;return{_id:row._id,receiptNumber:row.receiptNumber,externalInvoiceNumber:row.externalInvoiceNumber,receiptDate:row.receiptDate,payableAmount:row.netPayableAmount??row.payableAmount,paidAmount:row.paidAmount,remainingAmount:row.remainingAmount,items,supplierFreightAmount:row.supplierFreightAmount,returnedFreightTotal:returnedFreight,availableFreight:row.supplierFreightAmount-returnedFreight};}).filter(row=>row.availableFreight>0||row.items.some(x=>x.availableQuantity>0));}});
0048: const dto=(row:{_id:unknown;returnNumber:string;receiptNumber:string;supplierName:string;branchId:unknown;date:string;totalCredit:number;debtReduction:number;cashRefund:number;status:string;externalCreditNoteNumber?:string})=>({_id:row._id,returnNumber:row.returnNumber,receiptNumber:row.receiptNumber,supplierName:row.supplierName,branchId:row.branchId,date:row.date,totalCredit:row.totalCredit,debtReduction:row.debtReduction,cashRefund:row.cashRefund,status:row.status,externalCreditNoteNumber:row.externalCreditNoteNumber});
0049: export const list=query({args:{branchId:v.optional(v.id("branches")),supplierId:v.optional(v.id("suppliers")),paginationOpts:paginationOptsValidator},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"view_purchase_returns"),branchId=resolveWriteBranch(user,args.branchId);if(!branchId)throw new ConvexError("اختر الفرع");const result=args.supplierId?await ctx.db.query("purchaseReturns").withIndex("by_supplier_branch_date",q=>q.eq("supplierId",args.supplierId!).eq("branchId",branchId)).order("desc").paginate(args.paginationOpts):await ctx.db.query("purchaseReturns").withIndex("by_branch_date",q=>q.eq("branchId",branchId)).order("desc").paginate(args.paginationOpts);return{page:result.page.map(dto),isDone:result.isDone,continueCursor:result.continueCursor};}});
0050: export const getForPrint=query({args:{purchaseReturnId:v.id("purchaseReturns")},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"print_purchase_returns"),row=await ctx.db.get(args.purchaseReturnId);if(!row)throw new ConvexError("مستند المرتجع غير موجود");assertBranchAccess(user,row);const branch=await ctx.db.get(row.branchId),byUser=await ctx.db.query("userProfiles").withIndex("by_user",q=>q.eq("userId",row.createdBy)).first(),profile=byUser??await ctx.db.query("userProfiles").withIndex("by_token",q=>q.eq("tokenIdentifier",row.createdBy)).first();return{returnNumber:row.returnNumber,date:row.date,supplierName:row.supplierName,branchName:branch?.name??"—",receiptNumber:row.receiptNumber,externalInvoiceNumber:row.externalInvoiceNumber,externalCreditNoteNumber:row.externalCreditNoteNumber,items:row.items.map(x=>({productName:x.productName,quantityReturned:x.quantityReturned,historicalUnitCost:x.historicalUnitCost,goodsCreditAmount:x.goodsCreditAmount})),goodsCredit:row.goodsCredit,freightCredit:row.freightCredit,totalCredit:row.totalCredit,debtReduction:row.debtReduction,cashRefund:row.cashRefund,status:row.status,createdBy:profile?.name??"مستخدم غير معروف",refundAccountName:row.refundAccountName,reversalReason:row.reversalReason,reversalDate:row.reversalDate};}});
0051: export const supplierRefundAccountPicker=query({args:{branchId:v.optional(v.id("branches"))},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"record_supplier_refunds"),branchId=resolveWriteBranch(user,args.branchId);if(!branchId)throw new ConvexError("اختر الفرع");return(await ctx.db.query("financialAccounts").withIndex("by_branch",q=>q.eq("branchId",branchId)).collect()).filter(x=>x.isActive&&allowedRefundAccounts.includes(x.type)).map(x=>({_id:x._id,name:x.name,type:x.type,branchId:x.branchId}));}});
```

#### Call 2 at L44
```ts
0041:   await ctx.db.patch(receipt._id,{creditedTotal:roundMoney((receipt.creditedTotal??0)+totalCredit),returnedGoodsTotal:roundMoney((receipt.returnedGoodsTotal??0)+goodsCredit),returnedFreightTotal:roundMoney((receipt.returnedFreightTotal??0)+freight),netPayableAmount:state.netPayableAmount,paidAmount:state.paidAmount,remainingAmount:state.remainingAmount,status:state.status});const journal=await postPurchaseReturnJournal(ctx,user,{branchId,date:args.date,requestId:`purchase-return:${returnId}:create`,referenceId:String(returnId),referenceNumber:returnNumber,totalCredit,inventoryValueRemoved});await ctx.db.patch(returnId,{items:stored,inventoryValueRemoved,supplierLedgerEntryId:supplierLedger?._id,supplierRefundLedgerEntryId:refundLedger?._id,financialTransactionId:financial?.transactionId,journalEntryId:journal?._id});await logAction(ctx,user,{action:"post",module:"purchase_returns",recordId:returnId,recordLabel:returnNumber,details:JSON.stringify({receipt:receipt.receiptNumber,supplier:supplier.name,branchId,totalCredit,debtReduction:state.debtReduction,cashRefund:state.cashRefund,inventoryValueRemoved,reason})});return returnId;
0042: }});
0043: 
0044: export const reverse=mutation({args:{purchaseReturnId:v.id("purchaseReturns"),date:v.string(),reason:v.string(),requestId:v.string()},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"reverse_purchase_returns");if(!user.permissions.includes("reverse_financial_transactions")) throw new ConvexError("عكس المرتجع يتطلب صلاحية عكس المعاملات المالية");const row=await ctx.db.get(args.purchaseReturnId);if(!row) throw new ConvexError("مستند المرتجع غير موجود");assertBranchAccess(user,row);const reason=args.reason.trim(),requestId=args.requestId.trim(),reversalFingerprint=fingerprint({requestId,date:args.date,reason});if(row.status==="reversed"){if(row.reversalRequestId===requestId&&row.reversalFingerprint===reversalFingerprint)return row._id;throw new ConvexError("تم عكس المرتجع سابقاً بطلب مختلف");}if(!reason||!requestId) throw new ConvexError("سبب ومعرف طلب العكس مطلوبان");await requireFinanceInitialized(ctx,args.date);const receipt=await ctx.db.get(row.purchaseReceiptId);if(!receipt) throw new ConvexError("مستند الشراء الأصلي غير موجود");let reversalFinancialTransactionId;if(row.financialTransactionId)reversalFinancialTransactionId=await reversePostedFinancialTransaction(ctx,user,{transactionId:row.financialTransactionId,reason,date:args.date,requestId:`${requestId}:cash`,referenceType:"purchase_return",referenceId:String(row._id),referenceNumber:row.returnNumber});for(const item of row.items)await changeProductStock(ctx,user,{productId:item.productId,quantityDelta:item.quantityReturned,type:INVENTORY_MOVEMENT_TYPES.purchaseReturn,reason:`عكس مرتجع شراء ${row.returnNumber}`,referenceId:String(row._id),referenceType:"purchase_return_reversal",unitCost:item.inventoryValueRemoved/item.quantityReturned,valueDelta:item.inventoryValueRemoved});let reversalSupplierLedgerEntryId,reversalSupplierRefundLedgerEntryId;if(row.supplierLedgerEntryId){const e=await postSupplierBalanceMovement(ctx,user,{type:"reversal",requestId:`${requestId}:credit-ledger`,supplierId:row.supplierId,branchId:row.branchId,date:args.date,amountDelta:row.totalCredit,referenceType:"purchase_return",referenceId:String(row._id),referenceNumber:row.returnNumber,description:`عكس خصم ${row.returnNumber}`,originalEntryId:row.supplierLedgerEntryId,reversalReason:reason,reversalDate:args.date});reversalSupplierLedgerEntryId=e._id;}if(row.supplierRefundLedgerEntryId){const e=await postSupplierBalanceMovement(ctx,user,{type:"reversal",requestId:`${requestId}:refund-ledger`,supplierId:row.supplierId,branchId:row.branchId,date:args.date,amountDelta:-row.cashRefund,referenceType:"purchase_return",referenceId:String(row._id),referenceNumber:row.returnNumber,description:`عكس رد المورد ${row.returnNumber}`,originalEntryId:row.supplierRefundLedgerEntryId,reversalReason:reason,reversalDate:args.date});reversalSupplierRefundLedgerEntryId=e._id;}const originalLedger=row.supplierLedgerEntryId?await ctx.db.get(row.supplierLedgerEntryId):undefined,finalReversalLedger=reversalSupplierRefundLedgerEntryId?await ctx.db.get(reversalSupplierRefundLedgerEntryId):reversalSupplierLedgerEntryId?await ctx.db.get(reversalSupplierLedgerEntryId):undefined;if(originalLedger&&finalReversalLedger&&roundMoney(finalReversalLedger.balanceAfter)!==roundMoney((row.supplierRefundLedgerEntryId?(await ctx.db.get(row.supplierRefundLedgerEntryId))?.balanceBefore:originalLedger.balanceBefore)??originalLedger.balanceBefore))throw new ConvexError("رصيد المورد غير متسق بعد عكس إشعار الخصم");let state;try{state=purchaseReceiptAfterReversal(receipt.netPayableAmount??receipt.payableAmount,receipt.paidAmount,receipt.remainingAmount,row.totalCredit,row.debtReduction,row.cashRefund);}catch(error){throw errorOf(error);}await ctx.db.patch(receipt._id,{creditedTotal:roundMoney((receipt.creditedTotal??0)-row.totalCredit),returnedGoodsTotal:roundMoney((receipt.returnedGoodsTotal??0)-row.goodsCredit),returnedFreightTotal:roundMoney((receipt.returnedFreightTotal??0)-row.freightCredit),...state});const reversalJournal=await reversePurchaseReturnJournal(ctx,user,{branchId:row.branchId,date:args.date,requestId:`purchase-return:${row._id}:reverse:${requestId}`,referenceId:String(row._id),referenceNumber:row.returnNumber,originalEntryId:row.journalEntryId,reason,hasAccountingImpact:row.totalCredit>0||row.inventoryValueRemoved>0});await ctx.db.patch(row._id,{status:"reversed",reversedAt:Date.now(),reversedBy:user.userId,reversalReason:reason,reversalDate:args.date,reversalRequestId:requestId,reversalFingerprint,reversalFinancialTransactionId,reversalSupplierLedgerEntryId,reversalSupplierRefundLedgerEntryId,reversalJournalEntryId:reversalJournal?._id});await logAction(ctx,user,{action:"reverse",module:"purchase_returns",recordId:row._id,recordLabel:row.returnNumber,details:JSON.stringify({reason,date:args.date,totalCredit:row.totalCredit,cashRefund:row.cashRefund,inventoryValueRemoved:row.inventoryValueRemoved})});return row._id;}});
0045: 
0046: export const supplierOptions=query({args:{},handler:async ctx=>{await requirePermission(ctx,"create_purchase_returns");return(await ctx.db.query("suppliers").collect()).filter(x=>x.isActive!==false).map(x=>({_id:x._id,name:x.name}));}});
0047: export const eligibleReceipts=query({args:{supplierId:v.id("suppliers"),branchId:v.optional(v.id("branches"))},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"create_purchase_returns"),branchId=resolveWriteBranch(user,args.branchId);if(!branchId)throw new ConvexError("اختر الفرع");const rows=await ctx.db.query("purchaseReceipts").withIndex("by_supplier_branch_date",q=>q.eq("supplierId",args.supplierId).eq("branchId",branchId)).collect();const returns=await Promise.all(rows.map(row=>ctx.db.query("purchaseReturns").withIndex("by_purchase_receipt",q=>q.eq("purchaseReceiptId",row._id)).collect()));return rows.map((row,i)=>{const posted=returns[i].filter(x=>x.status==="posted");const items=row.items.map((item,index)=>{const returned=posted.flatMap(x=>x.items).filter(x=>x.receiptItemIndex===index).reduce((s,x)=>s+x.quantityReturned,0);return{receiptItemIndex:index,productName:item.productName,originalQuantity:item.quantity,returnedQuantity:returned,availableQuantity:item.quantity-returned,historicalLineTotal:item.lineTotal,historicalUnitCost:item.unitCost};});const returnedFreight=row.returnedFreightTotal??0;return{_id:row._id,receiptNumber:row.receiptNumber,externalInvoiceNumber:row.externalInvoiceNumber,receiptDate:row.receiptDate,payableAmount:row.netPayableAmount??row.payableAmount,paidAmount:row.paidAmount,remainingAmount:row.remainingAmount,items,supplierFreightAmount:row.supplierFreightAmount,returnedFreightTotal:returnedFreight,availableFreight:row.supplierFreightAmount-returnedFreight};}).filter(row=>row.availableFreight>0||row.items.some(x=>x.availableQuantity>0));}});
0048: const dto=(row:{_id:unknown;returnNumber:string;receiptNumber:string;supplierName:string;branchId:unknown;date:string;totalCredit:number;debtReduction:number;cashRefund:number;status:string;externalCreditNoteNumber?:string})=>({_id:row._id,returnNumber:row.returnNumber,receiptNumber:row.receiptNumber,supplierName:row.supplierName,branchId:row.branchId,date:row.date,totalCredit:row.totalCredit,debtReduction:row.debtReduction,cashRefund:row.cashRefund,status:row.status,externalCreditNoteNumber:row.externalCreditNoteNumber});
0049: export const list=query({args:{branchId:v.optional(v.id("branches")),supplierId:v.optional(v.id("suppliers")),paginationOpts:paginationOptsValidator},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"view_purchase_returns"),branchId=resolveWriteBranch(user,args.branchId);if(!branchId)throw new ConvexError("اختر الفرع");const result=args.supplierId?await ctx.db.query("purchaseReturns").withIndex("by_supplier_branch_date",q=>q.eq("supplierId",args.supplierId!).eq("branchId",branchId)).order("desc").paginate(args.paginationOpts):await ctx.db.query("purchaseReturns").withIndex("by_branch_date",q=>q.eq("branchId",branchId)).order("desc").paginate(args.paginationOpts);return{page:result.page.map(dto),isDone:result.isDone,continueCursor:result.continueCursor};}});
0050: export const getForPrint=query({args:{purchaseReturnId:v.id("purchaseReturns")},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"print_purchase_returns"),row=await ctx.db.get(args.purchaseReturnId);if(!row)throw new ConvexError("مستند المرتجع غير موجود");assertBranchAccess(user,row);const branch=await ctx.db.get(row.branchId),byUser=await ctx.db.query("userProfiles").withIndex("by_user",q=>q.eq("userId",row.createdBy)).first(),profile=byUser??await ctx.db.query("userProfiles").withIndex("by_token",q=>q.eq("tokenIdentifier",row.createdBy)).first();return{returnNumber:row.returnNumber,date:row.date,supplierName:row.supplierName,branchName:branch?.name??"—",receiptNumber:row.receiptNumber,externalInvoiceNumber:row.externalInvoiceNumber,externalCreditNoteNumber:row.externalCreditNoteNumber,items:row.items.map(x=>({productName:x.productName,quantityReturned:x.quantityReturned,historicalUnitCost:x.historicalUnitCost,goodsCreditAmount:x.goodsCreditAmount})),goodsCredit:row.goodsCredit,freightCredit:row.freightCredit,totalCredit:row.totalCredit,debtReduction:row.debtReduction,cashRefund:row.cashRefund,status:row.status,createdBy:profile?.name??"مستخدم غير معروف",refundAccountName:row.refundAccountName,reversalReason:row.reversalReason,reversalDate:row.reversalDate};}});
0051: export const supplierRefundAccountPicker=query({args:{branchId:v.optional(v.id("branches"))},handler:async(ctx,args)=>{const user=await requirePermission(ctx,"record_supplier_refunds"),branchId=resolveWriteBranch(user,args.branchId);if(!branchId)throw new ConvexError("اختر الفرع");return(await ctx.db.query("financialAccounts").withIndex("by_branch",q=>q.eq("branchId",branchId)).collect()).filter(x=>x.isActive&&allowedRefundAccounts.includes(x.type)).map(x=>({_id:x._id,name:x.name,type:x.type,branchId:x.branchId}));}});
```

## convex/repairs.ts

- Mutations: 7
- logAction calls: 4

### Mutation exports
- L415: `create`
- L661: `rotateTrackingToken`
- L681: `updateDetails`
- L945: `transitionStatus`
- L969: `updateStatus`
- L1016: `recordPayment`
- L1018: `refundPayment`

### logAction call sites
#### Call 1 at L650
```ts
0647:     if (args.customerId && args.initialDeposit) await postCustomerLedgerEntry(ctx, user, { type: "repair_payment", requestId: `${args.initialDeposit.requestId}:ledger`, customerId: args.customerId, branchId: branchId!, date: args.initialDeposit.paymentDate, receivableDelta: -initialAmount, advanceDelta: 0, purchasesDelta: 0, description: `عربون الصيانة ${repairNumber}`, referenceType: "repair", referenceId: String(id), referenceNumber: repairNumber });
0648:     if (args.initialDeposit && account) await postFinancialTransaction(ctx, user, { type: "repair_payment", requestId: args.initialDeposit.requestId, date: args.initialDeposit.paymentDate, amount: initialAmount, description: args.initialDeposit.notes?.trim() || `عربون الصيانة ${repairNumber}`, branchId: branchId!, referenceType: "repair", referenceId: String(id), referenceNumber: repairNumber, customerId: args.customerId, movements: [{ accountId: account._id, signedAmount: initialAmount }] });
0649:     if (journal) await ctx.db.patch(id, { journalEntryId: journal._id });
0650:     await logAction(ctx, user, {
0651:       action: "create",
0652:       module: "repairs",
0653:       recordId: id,
0654:       recordLabel: repairNumber,
0655:       details: `استلام جهاز للصيانة: ${repairNumber} - ${args.deviceBrand} ${args.deviceModel} للعميل ${args.customerName}`,
0656:     });
0657:     return id;
0658:   },
0659: });
0660: 
0661: export const rotateTrackingToken = mutation({
0662:   args: { id: v.id("repairs") },
```

#### Call 2 at L670
```ts
0667:     assertBranchAccess(user, repair);
0668:     const trackingToken = await createUniqueTrackingToken(ctx);
0669:     await ctx.db.patch(args.id, { trackingToken });
0670:     await logAction(ctx, user, {
0671:       action: "rotate_tracking_token",
0672:       module: "repairs",
0673:       recordId: args.id,
0674:       recordLabel: repair.repairNumber,
0675:       details: `تجديد رابط تتبع الصيانة ${repair.repairNumber}`,
0676:     });
0677:     return trackingToken;
0678:   },
0679: });
0680: 
0681: export const updateDetails = mutation({
0682:   args: {
```

#### Call 3 at L745
```ts
0742:           ? repair.notes
0743:           : normalizeOptionalText(args.notes),
0744:     });
0745:     await logAction(ctx, user, {
0746:       action: "update_details",
0747:       module: "repairs",
0748:       recordId: args.id,
0749:       recordLabel: repair.repairNumber,
0750:       details: `تحديث بيانات الجهاز والتشخيص للصيانة ${repair.repairNumber}`,
0751:     });
0752:     return args.id;
0753:   },
0754: });
0755: 
0756: async function transitionRepair(
0757:   ctx: MutationCtx,
```

#### Call 4 at L935
```ts
0932:     changedAt: Date.now(),
0933:     changedBy: user.userId,
0934:   });
0935:   await logAction(ctx, user, {
0936:     action: "update_status",
0937:     module: "repairs",
0938:     recordId: args.id,
0939:     recordLabel: repair.repairNumber,
0940:     details: `تحديث حالة الصيانة ${repair.repairNumber} من ${repair.status} إلى ${args.status}`,
0941:   });
0942:   return args.id;
0943: }
0944: 
0945: export const transitionStatus = mutation({
0946:   args: {
0947:     id: v.id("repairs"),
```

## convex/salesReturns.ts

- Mutations: 2
- logAction calls: 2

### Mutation exports
- L48: `create`
- L85: `reverse`

### logAction call sites
#### Call 1 at L81
```ts
0078:   const creditedTotal = roundMoney((invoice.creditedTotal ?? 0) + totalCredit), netTotal = roundMoney(invoice.total - creditedTotal), paid = roundMoney(invoice.paid - cashRefund), remaining = roundMoney(invoice.remaining - debtReduction);
0079:   await ctx.db.patch(invoice._id, { creditedTotal, netTotal, paid, remaining, status: deriveInvoiceStatus({ netTotal, creditedTotal, paid, remaining }) });
0080:   if (invoice.customerId) await postCustomerLedgerEntry(ctx, user, { type: "sales_return", requestId: `${args.requestId}:ledger`, customerId: invoice.customerId, branchId: invoice.branchId, date: args.date, receivableDelta: -debtReduction, advanceDelta: 0, purchasesDelta: -totalCredit, description: `إشعار دائن ${creditNoteNumber}`, referenceType: "sales_return", referenceId: String(id), referenceNumber: creditNoteNumber });
0081:   await logAction(ctx, user, { action: "create", module: "sales_returns", recordId: id, recordLabel: creditNoteNumber, details: `إنشاء إشعار دائن ${creditNoteNumber} بقيمة ${totalCredit} وإعادة المخزون` });
0082:   return id;
0083: } });
0084: 
0085: export const reverse = mutation({ args: { id: v.id("salesReturns"), reason: v.string(), date: v.string(), requestId: v.string() }, handler: async (ctx, args) => {
0086:   const user = await requirePermission(ctx, "create_sales_returns"); await requirePermission(ctx, "reverse_financial_transactions");
0087:   const note = await ctx.db.get(args.id); if (!note) throw new ConvexError("الإشعار الدائن غير موجود"); assertBranchAccess(user, note);
0088:   const requestKey = `${user.userId}:${args.requestId.trim()}`; if (!args.requestId.trim()) throw new ConvexError("معرف طلب العكس مطلوب");
0089:   if (note.status === "reversed") { if (note.reversalRequestId === requestKey) return note._id; throw new ConvexError("تم عكس الإشعار الدائن بالفعل بطلب مختلف"); }
0090:   if (!args.reason.trim()) throw new ConvexError("سبب العكس مطلوب"); await requireFinanceInitialized(ctx, args.date);
0091:   const invoice = await ctx.db.get(note.invoiceId); if (!invoice) throw new ConvexError("الفاتورة غير موجودة");
0092:   for (const item of note.items) await changeProductStock(ctx, user, { productId: item.productId, quantityDelta: -item.quantityReturned, unitCost: item.historicalUnitCost, type: INVENTORY_MOVEMENT_TYPES.sale, reason: `عكس مرتجع ${note.creditNoteNumber}`, referenceId: String(note._id), referenceType: "sales_return_reversal" });
0093:   let reversalTransactionId; if (note.financialTransactionId) reversalTransactionId = await reversePostedFinancialTransaction(ctx, user, { transactionId: note.financialTransactionId, reason: args.reason.trim(), date: args.date, requestId: args.requestId, referenceType: "sales_return_reversal", referenceId: String(note._id), referenceNumber: note.creditNoteNumber });
```

#### Call 2 at L98
```ts
0095:   await ctx.db.patch(invoice._id, { creditedTotal, netTotal, paid, remaining, status: deriveInvoiceStatus({ netTotal, creditedTotal, paid, remaining }) });
0096:   if (note.customerId) await postCustomerLedgerEntry(ctx, user, { type: "sales_return_reversal", requestId: `${args.requestId}:ledger`, customerId: note.customerId, branchId: note.branchId, date: args.date, receivableDelta: note.debtReduction, advanceDelta: 0, purchasesDelta: note.totalCredit, description: `عكس الإشعار ${note.creditNoteNumber}`, referenceType: "sales_return", referenceId: String(note._id), referenceNumber: note.creditNoteNumber });
0097:   await ctx.db.patch(note._id, { status: "reversed", reversedAt: Date.now(), reversedBy: user.userId, reversalReason: args.reason.trim(), reversalDate: args.date, reversalRequestId: requestKey, reversalTransactionId });
0098:   await logAction(ctx, user, { action: "reverse", module: "sales_returns", recordId: note._id, recordLabel: note.creditNoteNumber, details: `عكس الإشعار الدائن: ${args.reason.trim()}` }); return note._id;
0099: } });
```

## convex/seed.ts

- Mutations: 1
- logAction calls: 0

### Mutation exports
- L6: `seedDemo`

## convex/settings.ts

- Mutations: 2
- logAction calls: 2

### Mutation exports
- L38: `upsert`
- L71: `updateModules`

### logAction call sites
#### Call 1 at L61
```ts
0058:     } else {
0059:       id = await ctx.db.insert("settings", normalizedArgs);
0060:     }
0061:     await logAction(ctx, user, {
0062:       action: "update",
0063:       module: "settings",
0064:       recordId: id,
0065:       recordLabel: args.storeName,
0066:       details: `تحديث إعدادات المتجر: ${args.storeName}`,
0067:     });
0068:   },
0069: });
0070: 
0071: export const updateModules = mutation({
0072:   args: {
0073:     modules: v.object({
```

#### Call 2 at L105
```ts
0102:         modules: args.modules,
0103:       });
0104:     }
0105:     await logAction(ctx, user, {
0106:       action: "update",
0107:       module: "settings",
0108:       recordId: id,
0109:       recordLabel: "modules",
0110:       details: `تحديث تفعيل الوحدات`,
0111:     });
0112:   },
0113: });
```

## convex/shipments.ts

- Mutations: 4
- logAction calls: 3

### Mutation exports
- L74: `create`
- L145: `updateStatus`
- L174: `receive`
- L235: `remove`

### logAction call sites
#### Call 1 at L134
```ts
0131:       shipmentNumber,
0132:       status: "ordered",
0133:     });
0134:     await logAction(ctx, user, {
0135:       action: "create",
0136:       module: "shipments",
0137:       recordId: id,
0138:       recordLabel: shipmentNumber,
0139:       details: `إنشاء شحنة واردة: ${shipmentNumber} من ${supplierName} بقيمة ${grandTotal}`,
0140:     });
0141:     return id;
0142:   },
0143: });
0144: 
0145: export const updateStatus = mutation({
0146:   args: {
```

#### Call 2 at L164
```ts
0161:     const patch: Record<string, string | number> = { status: args.status };
0162:     if (args.status === "cancelled") { patch.cancelledAt = Date.now(); patch.cancelledBy = user.userId; patch.cancellationReason = args.reason?.trim() ?? ""; }
0163:     await ctx.db.patch(args.id, patch);
0164:     await logAction(ctx, user, {
0165:       action: "update",
0166:       module: "shipments",
0167:       recordId: args.id,
0168:       recordLabel: shipment.shipmentNumber,
0169:       details: `تحديث حالة الشحنة ${shipment.shipmentNumber} إلى: ${args.status}`,
0170:     });
0171:   },
0172: });
0173: 
0174: export const receive = mutation({
0175:   args: { shipmentId: v.id("shipments"), receiptDate: v.string(), requestId: v.string(), externalInvoiceNumber: v.optional(v.string()), invoiceDate: v.optional(v.string()), dueDate: v.optional(v.string()), supplierFreightAmount: v.number() },
0176:   handler: async (ctx, args) => {
```

#### Call 3 at L230
```ts
0227:     const journal = await postPurchaseReceiptJournal(ctx, user, { branchId: shipment.branchId, date: args.receiptDate, requestId: `purchase-receipt:${purchaseReceiptId}:create`, referenceId: String(purchaseReceiptId), referenceNumber: receiptNumber, totalLandedCost, payableAmount, externalFreightAmount: roundMoney(totalFreight - supplierFreightAmount) });
0228:     if (journal) await ctx.db.patch(purchaseReceiptId, { journalEntryId: journal._id });
0229:     await ctx.db.patch(args.shipmentId, { status: "arrived", arrivedDate: args.receiptDate, purchaseReceiptId, arrivalRequestId: requestId });
0230:     await logAction(ctx, user, { action: "receive", module: "shipments", recordId: args.shipmentId, recordLabel: shipment.shipmentNumber, details: JSON.stringify({ purchaseReceiptId, receiptNumber, payableAmount, totalLandedCost }) });
0231:     return { purchaseReceiptId, receiptNumber };
0232:   },
0233: });
0234: 
0235: export const remove = mutation({ args: { id: v.id("shipments") }, handler: async () => { throw new ConvexError("استخدم انتقال حالة الشحنة إلى ملغاة مع إدخال السبب"); } });
```

## convex/supplierPayments.ts

- Mutations: 2
- logAction calls: 2

### Mutation exports
- L18: `create`
- L48: `reverse`

### logAction call sites
#### Call 1 at L44
```ts
0041:   const ledger = await postSupplierBalanceMovement(ctx, user, { type: "supplier_payment", requestId, supplierId: supplier._id, branchId, date: args.date, amountDelta: -amount, referenceType: "supplier_payment", referenceId: String(paymentId), referenceNumber: paymentNumber, description: `دفعة مورد ${paymentNumber}` });
0042:   for (let index = 0; index < sorted.length; index++) await ctx.db.patch(receipts[index]._id, derivePurchaseReceiptState(receipts[index].netPayableAmount ?? receipts[index].payableAmount, receipts[index].paidAmount + sorted[index].amount));
0043:   await ctx.db.patch(paymentId, { financialTransactionId: financial.transactionId, supplierLedgerEntryId: ledger._id });
0044:   await logAction(ctx, user, { action: "post", module: "supplier_payments", recordId: paymentId, recordLabel: paymentNumber, details: JSON.stringify({ amount, allocations: sorted.length }) });
0045:   return paymentId;
0046: } });
0047: 
0048: export const reverse = mutation({ args: { paymentId: v.id("supplierPayments"), reason: v.string(), date: v.string(), requestId: v.string() }, handler: async (ctx, args) => {
0049:   const user = await requirePermission(ctx, "reverse_supplier_payments"); if (!user.permissions.includes("reverse_financial_transactions")) throw new ConvexError("عكس دفعة المورد يتطلب صلاحية عكس المعاملات المالية");
0050:   const payment = await ctx.db.get(args.paymentId); if (!payment) throw new ConvexError("سند الدفع غير موجود"); assertBranchAccess(user, payment);
0051:   const reason = args.reason.trim(), requestId = args.requestId.trim();
0052:   if (!requestId || requestId.length > 200) throw new ConvexError("معرف طلب العكس غير صالح"); if (!reason) throw new ConvexError("سبب العكس مطلوب"); if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new ConvexError("تاريخ العكس غير صالح");
0053:   const reversalFingerprint = JSON.stringify({ requestId, date: args.date, reason });
0054:   if (payment.status === "reversed") { if (payment.reversalRequestId !== requestId) throw new ConvexError("تم عكس سند الدفع سابقاً بطلب عكس مختلف"); if (payment.reversalFingerprint !== reversalFingerprint) throw new ConvexError("أعيد استخدام معرف طلب العكس بتاريخ أو سبب مختلف"); return payment.reversalFinancialTransactionId; }
0055:   if (!payment.financialTransactionId || !payment.supplierLedgerEntryId) throw new ConvexError("روابط سند الدفع غير مكتملة");
0056:   const allocations = await ctx.db.query("supplierPaymentAllocations").withIndex("by_payment", q => q.eq("paymentId", payment._id)).collect();
```

#### Call 2 at L62
```ts
0059:   const ledger = await postSupplierBalanceMovement(ctx, user, { type: "reversal", requestId, supplierId: payment.supplierId, branchId: payment.branchId, date: args.date, amountDelta: payment.amount, referenceType: "supplier_payment_reversal", referenceId: String(payment._id), referenceNumber: payment.paymentNumber, description: `عكس دفعة ${payment.paymentNumber}: ${reason}`, originalEntryId: payment.supplierLedgerEntryId, reversalReason: reason, reversalDate: args.date });
0060:   for (const allocation of allocations) { const receipt = await ctx.db.get(allocation.purchaseReceiptId); if (!receipt) throw new ConvexError("مستند شراء مرتبط مفقود"); await ctx.db.patch(receipt._id, reverseAllocatedPayment(receipt.netPayableAmount ?? receipt.payableAmount, receipt.paidAmount, allocation.amount)); }
0061:   await ctx.db.patch(payment._id, { status: "reversed", reversedAt: Date.now(), reversedBy: user.userId, reversalReason: reason, reversalDate: args.date, reversalFingerprint, reversalRequestId: requestId, reversalFinancialTransactionId: financialId, reversalSupplierLedgerEntryId: ledger._id });
0062:   await logAction(ctx, user, { action: "reverse", module: "supplier_payments", recordId: payment._id, recordLabel: payment.paymentNumber, details: reason }); return financialId;
0063: } });
0064: 
0065: export const openPurchaseReceipts = query({ args: { supplierId: v.id("suppliers"), branchId: v.optional(v.id("branches")) }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "record_supplier_payments"); const branchId = resolveWriteBranch(user, args.branchId); if (!branchId) throw new ConvexError("اختر الفرع"); return (await ctx.db.query("purchaseReceipts").withIndex("by_supplier_branch_date", q => q.eq("supplierId", args.supplierId).eq("branchId", branchId)).collect()).filter(x => x.remainingAmount > 0 && x.status !== "paid").map(x => ({ _id: x._id, receiptNumber: x.receiptNumber, receiptDate: x.receiptDate, dueDate: x.dueDate, payableAmount: x.netPayableAmount ?? x.payableAmount, paidAmount: x.paidAmount, remainingAmount: x.remainingAmount, status: x.status, supplierId: x.supplierId, supplierName: x.supplierName, branchId: x.branchId })); } });
0066: export const list = query({ args: { branchId: v.optional(v.id("branches")), supplierId: v.optional(v.id("suppliers")), paginationOpts: paginationOptsValidator }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "view_supplier_ledger"); const branchId = resolveWriteBranch(user, args.branchId); if (!branchId) throw new ConvexError("اختر الفرع"); const result = args.supplierId ? await ctx.db.query("supplierPayments").withIndex("by_supplier_branch_date", q => q.eq("supplierId", args.supplierId!).eq("branchId", branchId)).order("desc").paginate(args.paginationOpts) : await ctx.db.query("supplierPayments").withIndex("by_branch_date", q => q.eq("branchId", branchId)).order("desc").paginate(args.paginationOpts); return { page: result.page.map(payment => ({ _id: payment._id, paymentNumber: payment.paymentNumber, supplierName: payment.supplierName, amount: payment.amount, status: payment.status })), isDone: result.isDone, continueCursor: result.continueCursor }; } });
0067: export const receiptHistory = query({ args: { purchaseReceiptId: v.id("purchaseReceipts") }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "view_supplier_ledger"); const receipt = await ctx.db.get(args.purchaseReceiptId); if (!receipt) return []; assertBranchAccess(user, receipt); const rows = await ctx.db.query("supplierPaymentAllocations").withIndex("by_purchase_receipt", q => q.eq("purchaseReceiptId", args.purchaseReceiptId)).collect(); return await Promise.all(rows.map(async allocation => { const payment = await ctx.db.get(allocation.paymentId); if (!payment) throw new ConvexError("سند دفع مرتبط مفقود"); return { _id: allocation._id, paymentNumber: payment.paymentNumber, paymentDate: payment.date, allocatedAmount: allocation.amount, status: payment.status, reversalReason: payment.reversalReason, reversalDate: payment.reversalDate }; })); } });
0068: export const print = query({ args: { paymentId: v.id("supplierPayments") }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "print_supplier_payments"); const payment = await ctx.db.get(args.paymentId); if (!payment) throw new ConvexError("سند الدفع غير موجود"); assertBranchAccess(user, payment); const allocations = await ctx.db.query("supplierPaymentAllocations").withIndex("by_payment", q => q.eq("paymentId", payment._id)).collect(); const branch = await ctx.db.get(payment.branchId); const byUser = await ctx.db.query("userProfiles").withIndex("by_user", q => q.eq("userId", payment.createdBy)).first(); const creator = byUser ?? await ctx.db.query("userProfiles").withIndex("by_token", q => q.eq("tokenIdentifier", payment.createdBy)).first(); return { paymentNumber: payment.paymentNumber, date: payment.date, supplierName: payment.supplierName, branchName: branch?.name ?? "—", accountName: payment.accountName, amount: payment.amount, notes: payment.notes, status: payment.status, createdBy: creator?.name ?? "مستخدم غير معروف", allocations: allocations.map(row => ({ receiptNumber: row.receiptNumber, amount: row.amount })), reversalReason: payment.reversalReason, reversalDate: payment.reversalDate }; } });
0069: export const supplierOptions = query({ args: {}, handler: async ctx => { await requirePermission(ctx, "record_supplier_payments"); return (await ctx.db.query("suppliers").collect()).filter(s => s.isActive !== false).map(s => ({ _id: s._id, name: s.name })); } });
0070: export const supplierBalance = query({ args: { supplierId: v.id("suppliers"), branchId: v.optional(v.id("branches")) }, handler: async (ctx, args) => { const user = await requirePermission(ctx, "view_supplier_ledger"); const branchId = resolveWriteBranch(user, args.branchId); if (!branchId) throw new ConvexError("اختر الفرع"); const row = await ctx.db.query("supplierBalances").withIndex("by_supplier_branch", q => q.eq("supplierId", args.supplierId).eq("branchId", branchId)).unique(); return { balance: row?.balance ?? 0, branchId }; } });
```

## convex/suppliers.ts

- Mutations: 4
- logAction calls: 3

### Mutation exports
- L147: `create`
- L171: `update`
- L211: `setActive`
- L222: `remove`

### logAction call sites
#### Call 1 at L160
```ts
0157:     const normalized = supplierData(args);
0158:     await assertUniqueSupplierPhone(ctx, normalized.phone);
0159:     const id = await ctx.db.insert("suppliers", { ...normalized, balance: 0, isActive: true });
0160:     await logAction(ctx, user, {
0161:       action: "create",
0162:       module: "suppliers",
0163:       recordId: id,
0164:       recordLabel: normalized.name,
0165:       details: `إضافة مورد جديد: ${normalized.name} - ${normalized.phone}`,
0166:     });
0167:     return id;
0168:   },
0169: });
0170: 
0171: export const update = mutation({
0172:   args: {
```

#### Call 2 at L201
```ts
0198:       normalized.notes === supplier.notes;
0199:     if (supplierUnchanged) return;
0200:     await ctx.db.patch(id, normalized);
0201:     await logAction(ctx, user, {
0202:       action: "update",
0203:       module: "suppliers",
0204:       recordId: id,
0205:       recordLabel: normalized.name,
0206:       details: `تحديث بيانات المورد: ${supplier.name} ← ${normalized.name}`,
0207:     });
0208:   },
0209: });
0210: 
0211: export const setActive = mutation({
0212:   args: { id: v.id("suppliers"), isActive: v.boolean() },
0213:   handler: async (ctx, args) => {
```

#### Call 3 at L219
```ts
0216:     if (!supplier) throw new ConvexError("المورد غير موجود");
0217:     if (supplier.isActive === args.isActive) return;
0218:     await ctx.db.patch(args.id, { isActive: args.isActive });
0219:     await logAction(ctx, user, { action: args.isActive ? "activate" : "deactivate", module: "suppliers", recordId: args.id, recordLabel: supplier.name, details: `${args.isActive ? "تفعيل" : "تعطيل"} المورد ${supplier.name}` });
0220:   },
0221: });
0222: export const remove = mutation({ args: { id: v.id("suppliers") }, handler: async () => { throw new ConvexError("استخدم تعطيل المورد بدلاً من الحذف"); } });
```

