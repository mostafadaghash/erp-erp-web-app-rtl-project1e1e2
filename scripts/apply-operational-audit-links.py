from pathlib import Path


def replace_once(path: str, before: str, after: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(before)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {before[:100]!r}")
    file.write_text(text.replace(before, after, 1))


def insert_before_in_section(path: str, section: str, needle: str, insertion: str) -> None:
    file = Path(path)
    text = file.read_text()
    start = text.find(section)
    if start < 0:
        raise RuntimeError(f"Missing section {section!r} in {path}")
    position = text.find(needle, start)
    if position < 0:
        raise RuntimeError(f"Missing insertion point {needle!r} after {section!r} in {path}")
    if text.find(needle, position + len(needle)) >= 0 and section == "":
        raise RuntimeError(f"Ambiguous insertion point {needle!r} in {path}")
    file.write_text(text[:position] + insertion + text[position:])


# Invoices: direct document audit rows now carry source, branch, customer and safe state snapshots.
replace_once(
    "convex/invoices.ts",
    '''    await logAction(ctx, user, {
      action: "create",
      module: "invoices",
      recordId: id,
      recordLabel: invoiceNumber,
      details: `إنشاء فاتورة ${invoiceNumber} بقيمة ${prepared.total} للعميل ${customerName}`,
    });''',
    '''    await logAction(ctx, user, {
      action: "create",
      module: "invoices",
      recordId: String(id),
      recordLabel: invoiceNumber,
      details: `إنشاء فاتورة ${invoiceNumber} بقيمة ${prepared.total} للعميل ${customerName}`,
      branchId,
      sourceType: "invoice",
      sourceId: String(id),
      sourceNumber: invoiceNumber,
      relatedType: args.customerId ? "customer" : undefined,
      relatedId: args.customerId ? String(args.customerId) : undefined,
      after: {
        status: deriveInvoiceStatus({ netTotal: prepared.total, creditedTotal: 0, paid: prepared.paid, remaining: prepared.remaining }),
        total: prepared.total,
        paid: prepared.paid,
        remaining: prepared.remaining,
        customerName,
      },
    });''',
)
replace_once(
    "convex/invoices.ts",
    '''    await logAction(ctx, user, {
      action: "update",
      module: "invoices",
      recordId: id,
      recordLabel: inv.invoiceNumber,
      details: `تعديل الفاتورة ${inv.invoiceNumber}`,
    });''',
    '''    await logAction(ctx, user, {
      action: "update",
      module: "invoices",
      recordId: String(id),
      recordLabel: inv.invoiceNumber,
      details: `تعديل الفاتورة ${inv.invoiceNumber}`,
      branchId,
      sourceType: "invoice",
      sourceId: String(id),
      sourceNumber: inv.invoiceNumber,
      relatedType: data.customerId ? "customer" : undefined,
      relatedId: data.customerId ? String(data.customerId) : undefined,
      before: {
        status: inv.status,
        total: inv.total,
        paid: inv.paid,
        remaining: inv.remaining,
        customerName: inv.customerName,
      },
      after: {
        status: deriveInvoiceStatus({ netTotal: prepared.total, creditedTotal: 0, paid: prepared.paid, remaining: prepared.remaining }),
        total: prepared.total,
        paid: prepared.paid,
        remaining: prepared.remaining,
        customerName,
      },
    });''',
)
replace_once(
    "convex/invoices.ts",
    '''    await logAction(ctx, user, {
      action: "update",
      module: "invoices",
      recordId: args.id,
      recordLabel: inv.invoiceNumber,
      details: `تغيير حالة الفاتورة ${inv.invoiceNumber} إلى ${args.status}`,
    });''',
    '''    await logAction(ctx, user, {
      action: "update_status",
      module: "invoices",
      recordId: String(args.id),
      recordLabel: inv.invoiceNumber,
      details: `تغيير حالة الفاتورة ${inv.invoiceNumber} إلى ${args.status}`,
      branchId: inv.branchId,
      sourceType: "invoice",
      sourceId: String(args.id),
      sourceNumber: inv.invoiceNumber,
      relatedType: inv.customerId ? "customer" : undefined,
      relatedId: inv.customerId ? String(inv.customerId) : undefined,
      before: { status: inv.status },
      after: { status: args.status },
    });''',
)
replace_once(
    "convex/invoices.ts",
    '''    await logAction(ctx, user, {
      action: "cancel",
      module: "invoices",
      recordId: args.id,
      recordLabel: inv.invoiceNumber,
      details: `إلغاء الفاتورة ${inv.invoiceNumber}: ${reason}`,
    });''',
    '''    await logAction(ctx, user, {
      action: "cancel",
      module: "invoices",
      recordId: String(args.id),
      recordLabel: inv.invoiceNumber,
      details: `إلغاء الفاتورة ${inv.invoiceNumber}: ${reason}`,
      branchId: inv.branchId,
      sourceType: "invoice",
      sourceId: String(args.id),
      sourceNumber: inv.invoiceNumber,
      relatedType: inv.customerId ? "customer" : undefined,
      relatedId: inv.customerId ? String(inv.customerId) : undefined,
      before: { status: inv.status, total: inv.total, paid: inv.paid, remaining: inv.remaining },
      after: { status: "cancelled", cancellationReason: reason },
    });''',
)

# Orders: master-data changes and deposit/refund actions expose document and finance links.
replace_once(
    "convex/orders.ts",
    '''    await logAction(ctx, user, { action: "create", module: "orders", recordId: id, recordLabel: orderNumber, details: `إنشاء طلب جديد: ${orderNumber} للعميل ${customerName}` });''',
    '''    await logAction(ctx, user, { action: "create", module: "orders", recordId: String(id), recordLabel: orderNumber, details: `إنشاء طلب جديد: ${orderNumber} للعميل ${customerName}`, branchId, sourceType: "order", sourceId: String(id), sourceNumber: orderNumber, relatedType: args.customerId ? "customer" : undefined, relatedId: args.customerId ? String(args.customerId) : undefined, after: { status: "pending", total, deposit, remaining, customerName } });''',
)
replace_once(
    "convex/orders.ts",
    '''    await logAction(ctx, user, { action: "update", module: "orders", recordId: order._id, recordLabel: order.orderNumber, details: `تعديل بيانات وبنود الطلب ${order.orderNumber}` });''',
    '''    await logAction(ctx, user, { action: "update", module: "orders", recordId: String(order._id), recordLabel: order.orderNumber, details: `تعديل بيانات وبنود الطلب ${order.orderNumber}`, branchId: order.branchId, sourceType: "order", sourceId: String(order._id), sourceNumber: order.orderNumber, relatedType: customerId ? "customer" : undefined, relatedId: customerId ? String(customerId) : undefined, before: { status: order.status, total: order.total, deposit: order.deposit, remaining: order.remaining, customerName: order.customerName }, after: { status: order.status, total, deposit: order.deposit, remaining, customerName } });''',
)
replace_once(
    "convex/orders.ts",
    '''    await logAction(ctx, user, { action: "update", module: "orders", recordId: args.id, recordLabel: order.orderNumber, details: `تحديث حالة الطلب ${order.orderNumber} إلى: ${args.status}` });''',
    '''    await logAction(ctx, user, { action: "update_status", module: "orders", recordId: String(args.id), recordLabel: order.orderNumber, details: `تحديث حالة الطلب ${order.orderNumber} إلى: ${args.status}`, branchId: order.branchId, sourceType: "order", sourceId: String(args.id), sourceNumber: order.orderNumber, relatedType: order.customerId ? "customer" : undefined, relatedId: order.customerId ? String(order.customerId) : undefined, before: { status: order.status }, after: { status: args.status } });''',
)
replace_once(
    "convex/orders.ts",
    '''    await logAction(ctx, user, { action: "update", module: "orders", recordId: args.id, recordLabel: order.orderNumber, details: `دفعة جديدة بقيمة ${args.amount} للطلب ${order.orderNumber}` });''',
    '''    await logAction(ctx, user, { action: "record_payment", module: "orders", recordId: String(args.id), recordLabel: order.orderNumber, details: `دفعة جديدة بقيمة ${args.amount} للطلب ${order.orderNumber}`, branchId: order.branchId, sourceType: "order", sourceId: String(args.id), sourceNumber: order.orderNumber, relatedType: "customer", relatedId: String(order.customerId), financialTransactionId: String(posted.transactionId), before: { status: order.status, deposit: order.deposit, remaining: order.remaining }, after: { status: order.status, deposit: newDeposit, remaining: newRemaining, amount: args.amount, accountName: account.name } });''',
)
replace_once(
    "convex/orders.ts",
    '''    await logAction(ctx, user, { action: "refund", module: "orders", recordId: order._id, recordLabel: order.orderNumber, details: `استرداد عربون بقيمة ${args.amount}: ${reason}` });''',
    '''    await logAction(ctx, user, { action: "refund", module: "orders", recordId: String(order._id), recordLabel: order.orderNumber, details: `استرداد عربون بقيمة ${args.amount}: ${reason}`, branchId: order.branchId, sourceType: "order", sourceId: String(order._id), sourceNumber: order.orderNumber, relatedType: "customer", relatedId: String(order.customerId), financialTransactionId: String(posted.transactionId), before: { status: order.status, deposit: order.deposit, remaining: order.remaining }, after: { status: order.status, deposit: roundMoney(order.deposit - args.amount), remaining: nextRemaining, amount: args.amount, accountName: account.name, reversalReason: reason } });''',
)
replace_once(
    "convex/orders.ts",
    '''    await logAction(ctx, user, { action: "cancel", module: "orders", recordId: args.id, recordLabel: order.orderNumber, details: `إلغاء الطلب ${order.orderNumber}: ${reason}` });''',
    '''    await logAction(ctx, user, { action: "cancel", module: "orders", recordId: String(args.id), recordLabel: order.orderNumber, details: `إلغاء الطلب ${order.orderNumber}: ${reason}`, branchId: order.branchId, sourceType: "order", sourceId: String(args.id), sourceNumber: order.orderNumber, relatedType: order.customerId ? "customer" : undefined, relatedId: order.customerId ? String(order.customerId) : undefined, before: { status: order.status, total: order.total, deposit: order.deposit, remaining: order.remaining }, after: { status: "cancelled", cancellationReason: reason } });''',
)

# Delivery/COD: operational state changes, confirmation and settlement documents become directly traceable.
replace_once(
    "convex/deliveries.ts",
    '''    await logAction(ctx, user, {
      action: "update",
      module: "deliveries",
      recordId: args.id,
      recordLabel: delivery.deliveryNumber,
      details: `تحديث حالة التوصيل ${delivery.deliveryNumber} إلى: ${args.status}`,
    });''',
    '''    await logAction(ctx, user, {
      action: "update_status",
      module: "deliveries",
      recordId: String(args.id),
      recordLabel: delivery.deliveryNumber,
      details: `تحديث حالة التوصيل ${delivery.deliveryNumber} إلى: ${args.status}`,
      branchId: delivery.branchId,
      sourceType: "delivery",
      sourceId: String(args.id),
      sourceNumber: delivery.deliveryNumber,
      relatedType: delivery.invoiceId ? "invoice" : undefined,
      relatedId: delivery.invoiceId ? String(delivery.invoiceId) : undefined,
      relatedNumber: delivery.invoiceNumber,
      before: { status: delivery.status },
      after: { status: args.status, cancellationReason: args.reason?.trim() ?? null },
    });''',
)
replace_once(
    "convex/deliveries.ts",
    '''    await logAction(ctx, user, {
      action: "update",
      module: "deliveries",
      recordId: args.id,
      recordLabel: delivery.deliveryNumber,
      details: `تعديل بيانات التوصيل ${delivery.deliveryNumber}`,
    });''',
    '''    await logAction(ctx, user, {
      action: "update",
      module: "deliveries",
      recordId: String(args.id),
      recordLabel: delivery.deliveryNumber,
      details: `تعديل بيانات التوصيل ${delivery.deliveryNumber}`,
      branchId: delivery.branchId,
      sourceType: "delivery",
      sourceId: String(args.id),
      sourceNumber: delivery.deliveryNumber,
      relatedType: delivery.invoiceId ? "invoice" : undefined,
      relatedId: delivery.invoiceId ? String(delivery.invoiceId) : undefined,
      relatedNumber: delivery.invoiceNumber,
      before: { city: delivery.city, shippingCompany: delivery.shippingCompany, trackingNumber: delivery.trackingNumber ?? null, expectedDate: delivery.expectedDate ?? null },
      after: { city: args.city ?? delivery.city, shippingCompany: args.shippingCompany ?? delivery.shippingCompany, trackingNumber: args.trackingNumber ?? delivery.trackingNumber ?? null, expectedDate: args.expectedDate ?? delivery.expectedDate ?? null },
    });''',
)
replace_once(
    "convex/deliveries.ts",
    '''await logAction(ctx,user,{action:"create",module:"deliveries",recordId:id,recordLabel:deliveryNumber,details:`ربط ${order.orderNumber} بالفاتورة ${invoice.invoiceNumber}`});''',
    '''await logAction(ctx,user,{action:"create",module:"deliveries",recordId:String(id),recordLabel:deliveryNumber,details:`ربط ${order.orderNumber} بالفاتورة ${invoice.invoiceNumber}`,branchId,sourceType:"delivery",sourceId:String(id),sourceNumber:deliveryNumber,relatedType:"invoice",relatedId:String(invoice._id),relatedNumber:invoice.invoiceNumber,after:{status:"pending",orderNumber:order.orderNumber,invoiceNumber:invoice.invoiceNumber,totalAmount:net,codAmount:remaining,prepaidAmount:paid,expectedCarrierFee:normalized.expectedCarrierFee}});''',
)
replace_once(
    "convex/deliveries.ts",
    '''await logAction(ctx,user,{action:"confirm",module:"deliveries",recordId:delivery._id,recordLabel:delivery.deliveryNumber,details:`تأكيد التسليم - المحاولة ${attempts.length+1}`});''',
    '''await logAction(ctx,user,{action:"confirm",module:"deliveries",recordId:String(delivery._id),recordLabel:delivery.deliveryNumber,details:`تأكيد التسليم - المحاولة ${attempts.length+1}`,branchId:delivery.branchId,sourceType:"delivery",sourceId:String(delivery._id),sourceNumber:delivery.deliveryNumber,relatedType:"delivery_confirmation",relatedId:String(confirmationId),relatedNumber:String(attempts.length+1),financialTransactionId:financialTransactionId?String(financialTransactionId):undefined,before:{status:delivery.status,codAmount:cod},after:{status:"delivered",date:args.date,codAmount:cod,attemptNumber:attempts.length+1}});''',
)
insert_before_in_section(
    "convex/deliveries.ts",
    "export const createCodSettlement=mutation",
    "return settlementId;}});",
    '''await logAction(ctx,user,{action:"post",module:"cod_settlements",recordId:String(settlementId),recordLabel:settlementNumber,details:`تسوية ${deliveries.length} تحصيل COD`,branchId,sourceType:"cod_settlement",sourceId:String(settlementId),sourceNumber:settlementNumber,financialTransactionId:String(posted.transactionId),after:{status:"posted",date:args.date,deliveriesCount:deliveries.length,grossAmount:gross,feeAmount:fee,netAmount:net,sourceAccountName:source.name,destinationAccountName:destination.name}});''',
)
insert_before_in_section(
    "convex/deliveries.ts",
    "export const reverseCodSettlement=mutation",
    "return reversal;}});",
    '''await logAction(ctx,user,{action:"reverse",module:"cod_settlements",recordId:String(settlement._id),recordLabel:settlement.settlementNumber,details:reason,branchId:settlement.branchId,sourceType:"cod_settlement",sourceId:String(settlement._id),sourceNumber:settlement.settlementNumber,financialTransactionId:String(reversal),reversalOfId:String(settlement.financialTransactionId),before:{status:"posted",grossAmount:settlement.grossAmount,feeAmount:settlement.feeAmount,netAmount:settlement.netAmount},after:{status:"reversed",date:args.date,reversalReason:reason}});''',
)
replace_once(
    "convex/deliveries.ts",
    '''await logAction(ctx,user,{action:"reverse",module:"deliveries",recordId:d._id,recordLabel:d.deliveryNumber,details:`عكس محاولة التأكيد ${confirmation.attemptNumber}: ${reason}`});''',
    '''await logAction(ctx,user,{action:"reverse",module:"deliveries",recordId:String(d._id),recordLabel:d.deliveryNumber,details:`عكس محاولة التأكيد ${confirmation.attemptNumber}: ${reason}`,branchId:d.branchId,sourceType:"delivery",sourceId:String(d._id),sourceNumber:d.deliveryNumber,relatedType:"delivery_confirmation",relatedId:String(confirmation._id),relatedNumber:String(confirmation.attemptNumber),financialTransactionId:financial?String(financial):undefined,reversalOfId:confirmation.financialTransactionId?String(confirmation.financialTransactionId):undefined,before:{status:"delivered",codAmount:cod},after:{status:"shipped",date:args.date,codAmount:cod,reversalReason:reason}});''',
)

# Repairs: document links and safe state summaries without exposing tracking tokens.
replace_once(
    "convex/repairs.ts",
    '''    await logAction(ctx, user, {
      action: "create",
      module: "repairs",
      recordId: id,
      recordLabel: repairNumber,
      details: `استلام جهاز للصيانة: ${repairNumber} - ${args.deviceBrand} ${args.deviceModel} للعميل ${args.customerName}`,
    });''',
    '''    await logAction(ctx, user, {
      action: "create",
      module: "repairs",
      recordId: String(id),
      recordLabel: repairNumber,
      details: `استلام جهاز للصيانة: ${repairNumber} - ${args.deviceBrand} ${args.deviceModel} للعميل ${args.customerName}`,
      branchId,
      sourceType: "repair",
      sourceId: String(id),
      sourceNumber: repairNumber,
      relatedType: args.customerId ? "customer" : undefined,
      relatedId: args.customerId ? String(args.customerId) : undefined,
      journalEntryId: journal?._id ? String(journal._id) : undefined,
      after: { status: "received", date, totalCost, deposit: initialAmount, remaining: roundMoney(totalCost - initialAmount), laborCost, partsCount: storedParts.length, customerName: normalizedText.customerName, technicianName: technicianName ?? null },
    });''',
)
replace_once(
    "convex/repairs.ts",
    '''    await logAction(ctx, user, {
      action: "rotate_tracking_token",
      module: "repairs",
      recordId: args.id,
      recordLabel: repair.repairNumber,
      details: `تجديد رابط تتبع الصيانة ${repair.repairNumber}`,
    });''',
    '''    await logAction(ctx, user, {
      action: "rotate_tracking_token",
      module: "repairs",
      recordId: String(args.id),
      recordLabel: repair.repairNumber,
      details: `تجديد رابط تتبع الصيانة ${repair.repairNumber}`,
      branchId: repair.branchId,
      sourceType: "repair",
      sourceId: String(args.id),
      sourceNumber: repair.repairNumber,
      relatedType: repair.customerId ? "customer" : undefined,
      relatedId: repair.customerId ? String(repair.customerId) : undefined,
      before: { publicTrackingActive: Boolean(repair.trackingToken) },
      after: { publicTrackingActive: true, publicTrackingRotated: true },
    });''',
)
replace_once(
    "convex/repairs.ts",
    '''    await logAction(ctx, user, {
      action: "update_details",
      module: "repairs",
      recordId: args.id,
      recordLabel: repair.repairNumber,
      details: `تحديث بيانات الجهاز والتشخيص للصيانة ${repair.repairNumber}`,
    });''',
    '''    await logAction(ctx, user, {
      action: "update_details",
      module: "repairs",
      recordId: String(args.id),
      recordLabel: repair.repairNumber,
      details: `تحديث بيانات الجهاز والتشخيص للصيانة ${repair.repairNumber}`,
      branchId: repair.branchId,
      sourceType: "repair",
      sourceId: String(args.id),
      sourceNumber: repair.repairNumber,
      relatedType: repair.customerId ? "customer" : undefined,
      relatedId: repair.customerId ? String(repair.customerId) : undefined,
      before: { technicianName: repair.technicianName ?? null, hasDiagnosis: Boolean(repair.diagnosis), hasSerialNumber: Boolean(repair.serialNumber), expectedDate: repair.expectedDate ?? null, hasQualityCheckNotes: Boolean(repair.qualityCheckNotes) },
      after: { technicianName: technician?.name ?? repair.technicianName ?? null, hasDiagnosis: args.diagnosis === undefined ? Boolean(repair.diagnosis) : Boolean(normalizeOptionalText(args.diagnosis)), hasSerialNumber: args.serialNumber === undefined ? Boolean(repair.serialNumber) : Boolean(normalizeOptionalText(args.serialNumber)), expectedDate: args.expectedDate === undefined ? repair.expectedDate ?? null : expectedDate ?? null, hasQualityCheckNotes: args.qualityCheckNotes === undefined ? Boolean(repair.qualityCheckNotes) : Boolean(normalizeOptionalText(args.qualityCheckNotes)) },
    });''',
)
replace_once(
    "convex/repairs.ts",
    '''  await logAction(ctx, user, {
    action: "update_status",
    module: "repairs",
    recordId: args.id,
    recordLabel: repair.repairNumber,
    details: `تحديث حالة الصيانة ${repair.repairNumber} من ${repair.status} إلى ${args.status}`,
  });''',
    '''  await logAction(ctx, user, {
    action: "update_status",
    module: "repairs",
    recordId: String(args.id),
    recordLabel: repair.repairNumber,
    details: `تحديث حالة الصيانة ${repair.repairNumber} من ${repair.status} إلى ${args.status}`,
    branchId: repair.branchId,
    sourceType: "repair",
    sourceId: String(args.id),
    sourceNumber: repair.repairNumber,
    relatedType: repair.customerId ? "customer" : undefined,
    relatedId: repair.customerId ? String(repair.customerId) : undefined,
    journalEntryId: cancellationJournal?._id ? String(cancellationJournal._id) : undefined,
    before: { status: repair.status },
    after: { status: args.status, date, reversalReason: reason ?? null, warrantyDays: warrantyDays ?? null },
  });''',
)

# Sales returns: credit notes and reversals point to invoices and finance transactions.
replace_once(
    "convex/salesReturns.ts",
    '''  await logAction(ctx, user, { action: "create", module: "sales_returns", recordId: id, recordLabel: creditNoteNumber, details: `إنشاء إشعار دائن ${creditNoteNumber} بقيمة ${totalCredit} وإعادة المخزون` });''',
    '''  await logAction(ctx, user, { action: "create", module: "sales_returns", recordId: String(id), recordLabel: creditNoteNumber, details: `إنشاء إشعار دائن ${creditNoteNumber} بقيمة ${totalCredit} وإعادة المخزون`, branchId: invoice.branchId, sourceType: "sales_return", sourceId: String(id), sourceNumber: creditNoteNumber, relatedType: "invoice", relatedId: String(invoice._id), relatedNumber: invoice.invoiceNumber, financialTransactionId: transactionId ? String(transactionId) : undefined, after: { status: "posted", date: args.date, totalCredit, debtReduction, cashRefund, itemsCount: normalized.length, reversalReason: args.reason.trim() } });''',
)
replace_once(
    "convex/salesReturns.ts",
    '''  await logAction(ctx, user, { action: "reverse", module: "sales_returns", recordId: note._id, recordLabel: note.creditNoteNumber, details: `عكس الإشعار الدائن: ${args.reason.trim()}` }); return note._id;''',
    '''  await logAction(ctx, user, { action: "reverse", module: "sales_returns", recordId: String(note._id), recordLabel: note.creditNoteNumber, details: `عكس الإشعار الدائن: ${args.reason.trim()}`, branchId: note.branchId, sourceType: "sales_return", sourceId: String(note._id), sourceNumber: note.creditNoteNumber, relatedType: "invoice", relatedId: String(note.invoiceId), relatedNumber: note.invoiceNumber, financialTransactionId: reversalTransactionId ? String(reversalTransactionId) : undefined, reversalOfId: note.financialTransactionId ? String(note.financialTransactionId) : undefined, before: { status: note.status, totalCredit: note.totalCredit, cashRefund: note.cashRefund }, after: { status: "reversed", date: args.date, reversalReason: args.reason.trim() } }); return note._id;''',
)

# Purchase returns: return, receipt, supplier, finance and journal links remain in one immutable row.
replace_once(
    "convex/purchaseReturns.ts",
    '''await logAction(ctx,user,{action:"post",module:"purchase_returns",recordId:returnId,recordLabel:returnNumber,details:JSON.stringify({receipt:receipt.receiptNumber,supplier:supplier.name,branchId,totalCredit,debtReduction:state.debtReduction,cashRefund:state.cashRefund,inventoryValueRemoved,reason})});''',
    '''await logAction(ctx,user,{action:"post",module:"purchase_returns",recordId:String(returnId),recordLabel:returnNumber,details:`مرتجع شراء ${returnNumber}`,branchId,sourceType:"purchase_return",sourceId:String(returnId),sourceNumber:returnNumber,relatedType:"purchase_receipt",relatedId:String(receipt._id),relatedNumber:receipt.receiptNumber,financialTransactionId:financial?.transactionId?String(financial.transactionId):undefined,journalEntryId:journal?._id?String(journal._id):undefined,after:{status:"posted",date:args.date,totalCredit,debtReduction:state.debtReduction,cashRefund:state.cashRefund,inventoryValueRemoved,itemsCount:stored.length,supplierName:supplier.name,reversalReason:reason}});''',
)
replace_once(
    "convex/purchaseReturns.ts",
    '''await logAction(ctx,user,{action:"reverse",module:"purchase_returns",recordId:row._id,recordLabel:row.returnNumber,details:JSON.stringify({reason,date:args.date,totalCredit:row.totalCredit,cashRefund:row.cashRefund,inventoryValueRemoved:row.inventoryValueRemoved})});''',
    '''await logAction(ctx,user,{action:"reverse",module:"purchase_returns",recordId:String(row._id),recordLabel:row.returnNumber,details:reason,branchId:row.branchId,sourceType:"purchase_return",sourceId:String(row._id),sourceNumber:row.returnNumber,relatedType:"purchase_receipt",relatedId:String(row.purchaseReceiptId),relatedNumber:row.receiptNumber,financialTransactionId:reversalFinancialTransactionId?String(reversalFinancialTransactionId):undefined,journalEntryId:reversalJournal?._id?String(reversalJournal._id):undefined,reversalOfId:row.financialTransactionId?String(row.financialTransactionId):undefined,before:{status:row.status,totalCredit:row.totalCredit,cashRefund:row.cashRefund,inventoryValueRemoved:row.inventoryValueRemoved},after:{status:"reversed",date:args.date,reversalReason:reason}});''',
)

# Audit UI labels for the new actions, modules, links and snapshots.
replace_once(
    "src/components/AuditLogsPage.tsx",
    '''  reverse: {
    label: "عكس",
    color: "bg-orange-100 text-orange-700",
    icon: Trash2,
  },''',
    '''  reverse: {
    label: "عكس",
    color: "bg-orange-100 text-orange-700",
    icon: Trash2,
  },
  cancel: { label: "إلغاء", color: "bg-red-100 text-red-700", icon: Trash2 },
  confirm: { label: "تأكيد", color: "bg-emerald-100 text-emerald-700", icon: Plus },
  refund: { label: "استرداد", color: "bg-orange-100 text-orange-700", icon: Trash2 },
  record_payment: { label: "تحصيل", color: "bg-emerald-100 text-emerald-700", icon: Plus },
  update_status: { label: "تغيير حالة", color: "bg-blue-100 text-blue-700", icon: Edit2 },
  update_details: { label: "تعديل تفاصيل", color: "bg-blue-100 text-blue-700", icon: Edit2 },
  rotate_tracking_token: { label: "تجديد التتبع", color: "bg-amber-100 text-amber-700", icon: Edit2 },''',
)
replace_once(
    "src/components/AuditLogsPage.tsx",
    '''  supplier_payments: "مدفوعات الموردين",
};''',
    '''  supplier_payments: "مدفوعات الموردين",
  sales_returns: "مرتجعات المبيعات",
  purchase_returns: "مرتجعات المشتريات",
  cod_settlements: "تسويات COD",
};''',
)
replace_once(
    "src/components/AuditLogsPage.tsx",
    '''  reversalReason: "سبب العكس",
};''',
    '''  reversalReason: "سبب العكس",
  cancellationReason: "سبب الإلغاء",
  customerName: "العميل",
  total: "الإجمالي",
  paid: "المدفوع",
  remaining: "المتبقي",
  deposit: "العربون",
  totalAmount: "قيمة التوصيل",
  codAmount: "تحصيل COD",
  prepaidAmount: "المدفوع مقدمًا",
  expectedCarrierFee: "رسوم الناقل المتوقعة",
  attemptNumber: "رقم المحاولة",
  deliveriesCount: "عدد التوصيلات",
  grossAmount: "الإجمالي المحصل",
  feeAmount: "الرسوم",
  netAmount: "الصافي",
  sourceAccountName: "حساب المصدر",
  destinationAccountName: "حساب الوجهة",
  laborCost: "تكلفة العمالة",
  partsCount: "عدد القطع",
  technicianName: "الفني",
  warrantyDays: "أيام الضمان",
  itemsCount: "عدد البنود",
  totalCredit: "قيمة الإشعار",
  debtReduction: "تخفيض المديونية",
  cashRefund: "الرد النقدي",
  inventoryValueRemoved: "قيمة المخزون",
  publicTrackingActive: "التتبع العام فعال",
  publicTrackingRotated: "تم تجديد التتبع",
  hasDiagnosis: "يوجد تشخيص",
  hasSerialNumber: "يوجد رقم تسلسلي",
  hasQualityCheckNotes: "توجد ملاحظات فحص",
};''',
)
replace_once(
    "src/components/AuditLogsPage.tsx",
    '''  delivery: "توصيل",
};''',
    '''  delivery: "توصيل",
  delivery_confirmation: "تأكيد توصيل",
  cod_settlement: "تسوية COD",
  sales_return: "إشعار دائن مبيعات",
};''',
)

# Executable source contracts.
Path("tests/auditLogOperationalDocumentLinks.test.ts").write_text(r'''import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path: string) => readFileSync(path, "utf8");
const invoices = read("convex/invoices.ts");
const orders = read("convex/orders.ts");
const deliveries = read("convex/deliveries.ts");
const repairs = read("convex/repairs.ts");
const salesReturns = read("convex/salesReturns.ts");
const purchaseReturns = read("convex/purchaseReturns.ts");
const auditUi = read("src/components/AuditLogsPage.tsx");

function expectAll(source: string, tokens: string[]) {
  for (const token of tokens) assert.ok(source.includes(token), `Missing ${token}`);
}

test("AOD-01 invoices expose document branch customer and safe state snapshots", () => {
  expectAll(invoices, [
    'sourceType: "invoice"',
    'sourceNumber: invoiceNumber',
    'branchId,',
    'relatedType: args.customerId ? "customer" : undefined',
    'before: { status: inv.status, total: inv.total, paid: inv.paid, remaining: inv.remaining }',
    'after: { status: "cancelled", cancellationReason: reason }',
  ]);
});

test("AOD-02 order deposits and refunds link their financial transactions", () => {
  expectAll(orders, [
    'sourceType: "order"',
    'action: "record_payment"',
    'financialTransactionId: String(posted.transactionId)',
    'action: "refund"',
    'before: { status: order.status, deposit: order.deposit, remaining: order.remaining }',
  ]);
  const duplicateReturn = orders.indexOf('if (posted.duplicate) return posted.transactionId;');
  const paymentAudit = orders.indexOf('action: "record_payment"', duplicateReturn);
  assert.ok(duplicateReturn >= 0 && paymentAudit > duplicateReturn);
});

test("AOD-03 delivery creation confirmation and reversal expose document lineage", () => {
  expectAll(deliveries, [
    'sourceType:"delivery"',
    'relatedType:"invoice"',
    'relatedType:"delivery_confirmation"',
    'financialTransactionId:financialTransactionId?String(financialTransactionId):undefined',
    'reversalOfId:confirmation.financialTransactionId?String(confirmation.financialTransactionId):undefined',
  ]);
});

test("AOD-04 COD settlements are audited on post and reversal", () => {
  expectAll(deliveries, [
    'module:"cod_settlements"',
    'sourceType:"cod_settlement"',
    'deliveriesCount:deliveries.length',
    'financialTransactionId:String(posted.transactionId)',
    'reversalOfId:String(settlement.financialTransactionId)',
  ]);
  const createRetry = deliveries.indexOf('if(prior){if(prior.requestFingerprint!==fp)');
  const settlementAudit = deliveries.indexOf('module:"cod_settlements"', createRetry);
  assert.ok(createRetry >= 0 && settlementAudit > createRetry);
});

test("AOD-05 repairs use safe summaries and never snapshot the tracking token", () => {
  expectAll(repairs, [
    'sourceType: "repair"',
    'journalEntryId: journal?._id ? String(journal._id) : undefined',
    'publicTrackingRotated: true',
    'hasDiagnosis:',
    'journalEntryId: cancellationJournal?._id ? String(cancellationJournal._id) : undefined',
  ]);
  const auditCalls = repairs.split('await logAction').slice(1).join('await logAction');
  assert.doesNotMatch(auditCalls, /before:\s*\{[^}]*trackingToken/i);
  assert.doesNotMatch(auditCalls, /after:\s*\{[^}]*trackingToken/i);
});

test("AOD-06 sales return credit notes link invoices and finance reversals", () => {
  expectAll(salesReturns, [
    'sourceType: "sales_return"',
    'relatedType: "invoice"',
    'financialTransactionId: transactionId ? String(transactionId) : undefined',
    'financialTransactionId: reversalTransactionId ? String(reversalTransactionId) : undefined',
    'reversalOfId: note.financialTransactionId ? String(note.financialTransactionId) : undefined',
  ]);
});

test("AOD-07 purchase returns link receipt finance journal and reversal lineage", () => {
  expectAll(purchaseReturns, [
    'sourceType:"purchase_return"',
    'relatedType:"purchase_receipt"',
    'financialTransactionId:financial?.transactionId?String(financial.transactionId):undefined',
    'journalEntryId:journal?._id?String(journal._id):undefined',
    'financialTransactionId:reversalFinancialTransactionId?String(reversalFinancialTransactionId):undefined',
    'journalEntryId:reversalJournal?._id?String(reversalJournal._id):undefined',
  ]);
});

test("AOD-08 operational audit snapshots exclude request and idempotency material", () => {
  const sources = [invoices, orders, deliveries, repairs, salesReturns, purchaseReturns].join("\n");
  assert.doesNotMatch(sources, /before:\s*\{[^}]*(requestId|requestFingerprint|idempotencyKey|trackingToken)/i);
  assert.doesNotMatch(sources, /after:\s*\{[^}]*(requestId|requestFingerprint|idempotencyKey|trackingToken)/i);
});

test("AOD-09 Audit Log UI labels new actions modules documents and fields", () => {
  expectAll(auditUi, [
    'record_payment: { label: "تحصيل"',
    'cod_settlements: "تسويات COD"',
    'sales_returns: "مرتجعات المبيعات"',
    'purchase_returns: "مرتجعات المشتريات"',
    'delivery_confirmation: "تأكيد توصيل"',
    'cod_settlement: "تسوية COD"',
    'sales_return: "إشعار دائن مبيعات"',
    'publicTrackingRotated: "تم تجديد التتبع"',
  ]);
  assert.doesNotMatch(auditUi, /href=\{.*log\./);
  assert.doesNotMatch(auditUi, /navigate\(.*log\./);
});
''')

Path("tests/AUDIT_LOG_OPERATIONAL_DOCUMENT_LINKS_MATRIX.md").write_text('''# Audit Log — Operational Document Links Matrix

| ID | Contract | Automated evidence |
| --- | --- | --- |
| AOD-01 | Invoice create/update/status/cancel rows identify the invoice, branch, customer and safe before/after state. | Source contract |
| AOD-02 | Order create/update/status/payment/refund/cancel rows identify the order and link payment/refund finance transactions. | Source contract |
| AOD-03 | Delivery create/confirm/reverse rows identify delivery, invoice and confirmation lineage. | Source contract |
| AOD-04 | COD settlement creation and reversal produce direct immutable audit rows with finance lineage. | Source contract |
| AOD-05 | Repair create/detail/status/tracking-rotation rows identify repair and customer without exposing tracking tokens. | Source contract |
| AOD-06 | Sales credit notes and reversals identify the invoice and original/reversal finance transactions. | Source contract |
| AOD-07 | Purchase returns and reversals identify receipt, finance transaction and journal entry lineage. | Source contract |
| AOD-08 | New snapshots exclude request IDs, fingerprints, idempotency keys and tracking tokens. | Source contract |
| AOD-09 | Audit Log UI has Arabic labels and no navigation derived from audit values. | Source contract |

## Manual acceptance

- Create, edit, status-change and cancel one invoice and one order; confirm source document, branch, customer and before/after values.
- Record and refund an order deposit; confirm the operational row and the centralized Finance row share the same transaction identifier.
- Create a delivery, confirm COD delivery, reverse the confirmation, create a COD settlement and reverse it; verify each document and reversal lineage is distinguishable.
- Create a repair, rotate its public tracking link, update details and move it through statuses; confirm no tracking token value is displayed.
- Create and reverse one sales credit note and one purchase return; confirm invoice/receipt, Finance and journal references.
- Check long IDs and Arabic labels on desktop and mobile; audit tags must remain non-clickable.

## Scope boundary

This slice changes audit metadata, direct audit coverage and Audit Log presentation only. It does not change balances, inventory calculations, invoice/order totals, delivery eligibility, COD settlement arithmetic, repair workflow rules, return valuation, journal debit/credit mappings, idempotency keys, permissions, branch ownership or schema.
''')
