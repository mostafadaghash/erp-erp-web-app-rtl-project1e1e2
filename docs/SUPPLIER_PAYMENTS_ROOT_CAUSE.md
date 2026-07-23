# Supplier payments — root-cause review

Purchase receipt posting previously stopped after creating the payable: it populated `purchaseReceipts`, the supplier balance/ledger, and inventory valuation. The domain had no durable payment aggregate or allocation rows joining a disbursement to one or more receipts. Consequently the generic finance reversal could not know which receipt balances and statuses to restore, and no single mutation owned all treasury, supplier-ledger, and receipt effects.

The correction is a dedicated `supplierPayments` aggregate with immutable `supplierPaymentAllocations`. Its create and reverse mutations orchestrate the existing centralized finance poster and the generalized centralized supplier-ledger poster, then update receipt settlement fields in the same Convex transaction. Allocations are retained after reversal for audit history.
