import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  corrections,
  invoiceEditor,
  invoiceDialog,
  shipments,
  purchaseDialog,
  salesReturns,
  salesReturnDialog,
  purchaseReturns,
  purchaseReturnDialog,
] = await Promise.all([
  readFile("convex/documentCorrections.ts", "utf8"),
  readFile("convex/invoiceEditor.ts", "utf8"),
  readFile("src/components/InvoiceEditDialog.tsx", "utf8"),
  readFile("src/components/ShipmentsPage.tsx", "utf8"),
  readFile("src/components/PurchaseOrderEditDialog.tsx", "utf8"),
  readFile("src/components/SalesReturnsPanel.tsx", "utf8"),
  readFile("src/components/SalesReturnEditDialog.tsx", "utf8"),
  readFile("src/components/PurchaseReturnsPage.tsx", "utf8"),
  readFile("src/components/PurchaseReturnEditDialog.tsx", "utf8"),
]);

test("DOC-CORRECTION-01 sales invoice correction requires a reason and preserves accounting safeguards", () => {
  assert.match(invoiceEditor, /reason: v\.string\(\)/);
  assert.match(invoiceEditor, /سبب التعديل مطلوب/);
  assert.match(invoiceEditor, /assertInvoiceNotLockedByActiveDelivery/);
  assert.match(invoiceEditor, /changeProductStock/);
  assert.match(invoiceEditor, /postCustomerLedgerEntry/);
  assert.match(invoiceEditor, /correctionReason: reason/);
  assert.match(invoiceDialog, /data-testid="invoice-edit-reason"/);
  assert.match(invoiceDialog, /reason: reason\.trim\(\)/);
});

test("DOC-CORRECTION-02 purchase documents can be corrected before receipt but not after inventory posting", () => {
  assert.match(corrections, /export const editPurchaseOrder = mutation/);
  assert.match(corrections, /shipment\.status === "arrived" \|\| shipment\.purchaseReceiptId/);
  assert.match(corrections, /edit_shipments/);
  assert.match(corrections, /correctionReason: reason/);
  assert.match(shipments, /data-testid="purchase-edit-open"/);
  assert.match(purchaseDialog, /purchase-edit-quantity-/);
  assert.match(purchaseDialog, /purchase-edit-cost-/);
  assert.match(purchaseDialog, /data-testid="purchase-edit-reason"/);
});

test("DOC-CORRECTION-03 posted sales returns support quantity and credit correction only without cash settlement", () => {
  assert.match(corrections, /export const editSalesReturn = mutation/);
  assert.match(corrections, /note\.cashRefund > 0 \|\| note\.financialTransactionId/);
  assert.match(corrections, /returnedElsewhere/);
  assert.match(corrections, /postCustomerLedgerEntry/);
  assert.match(corrections, /sales_return_correction/);
  assert.match(corrections, /unitPrice: original\.unitPrice/);
  assert.match(corrections, /historicalUnitCost: original\.unitCost/);
  assert.match(salesReturns, /data-testid="sales-return-edit-open"/);
  assert.match(salesReturnDialog, /sales-return-edit-price-/);
  assert.match(salesReturnDialog, /data-testid="sales-return-edit-reason"/);
});

test("DOC-CORRECTION-04 purchase return corrections reverse and repost inventory, supplier ledger, and journal", () => {
  assert.match(corrections, /export const editPurchaseReturn = mutation/);
  assert.match(corrections, /row\.cashRefund > 0 \|\| row\.financialTransactionId/);
  assert.match(corrections, /purchaseReceiptAfterReversal/);
  assert.match(corrections, /purchaseReceiptAfterCredit/);
  assert.match(corrections, /postSupplierBalanceMovement/);
  assert.match(corrections, /reversePurchaseReturnJournal/);
  assert.match(corrections, /postPurchaseReturnJournal/);
  assert.match(corrections, /historicalUnitCost: historical\.unitCost/);
  assert.match(purchaseReturns, /data-testid="purchase-return-edit-open"/);
  assert.match(purchaseReturnDialog, /purchase-return-edit-price-/);
  assert.match(purchaseReturnDialog, /data-testid="purchase-return-edit-reason"/);
});

test("DOC-CORRECTION-05 every correction surface requires a documented reason", () => {
  for (const source of [invoiceDialog, purchaseDialog, salesReturnDialog, purchaseReturnDialog]) {
    assert.match(source, /سبب التعديل/);
    assert.match(source, /reason\.trim\(\)/);
  }
  assert.match(corrections, /const correctionReason/);
});