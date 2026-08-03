from pathlib import Path

customers_path = Path("src/components/CustomersPage.tsx")
suppliers_path = Path("src/components/SuppliersPage.tsx")
customers = customers_path.read_text()
suppliers = suppliers_path.read_text()


def replace_once(text: str, label: str, old: str, new: str) -> str:
    if old not in text:
        raise SystemExit(f"missing expected source: {label}")
    return text.replace(old, new, 1)


if "const customersLoaded = customersQuery !== undefined;" not in customers:
    customers = replace_once(
        customers,
        "customer loading state helpers",
        '''  const hasBalanceScope =
    canViewLedger && Boolean(effectiveBranchId) && balances !== undefined;
  const filtered = customers.filter(
''',
        '''  const hasBalanceScope =
    canViewLedger && Boolean(effectiveBranchId) && balances !== undefined;
  const customersLoaded = customersQuery !== undefined;
  const balancesLoading =
    canViewLedger && Boolean(effectiveBranchId) && balances === undefined;
  const missingCustomerBranchAccess = Boolean(
    me && !me.branchId && !canViewBranches,
  );
  const filtered = customers.filter(
''',
    )

    customers = replace_once(
        customers,
        "customer header branch unavailable",
        '''            {noCustomerBranchAvailable
              ? "لا توجد فروع نشطة"
              : requiresBranchSelection
''',
        '''            {noCustomerBranchAvailable
              ? "لا توجد فروع نشطة"
              : missingCustomerBranchAccess
                ? "لا يوجد فرع عمل متاح لعرض العملاء"
                : requiresBranchSelection
''',
    )

    customers = replace_once(
        customers,
        "customer total loading value",
        '''        <StatCard label="إجمالي العملاء" value={customers.length} color="indigo" />
''',
        '''        <StatCard
          label="إجمالي العملاء"
          value={customersLoaded ? customers.length : "—"}
          color="indigo"
        />
''',
    )

    customers = replace_once(
        customers,
        "customer debtor count loading",
        '''          value={
            hasBalanceScope
              ? customers.filter(
''',
        '''          value={
            balancesLoading
              ? "…"
              : hasBalanceScope
                ? customers.filter(
''',
    )
    customers = replace_once(
        customers,
        "customer debtor count indent",
        '''                ).length
              : "—"
          }
''',
        '''                  ).length
                : "—"
          }
''',
    )

    customers = replace_once(
        customers,
        "customer debt total loading",
        '''          value={
            hasBalanceScope
              ? `${(balances ?? [])
''',
        '''          value={
            balancesLoading
              ? "…"
              : hasBalanceScope
                ? `${(balances ?? [])
''',
    )
    customers = replace_once(
        customers,
        "customer debt total indent",
        '''                  .toLocaleString("ar-EG")} ج.م`
              : "—"
          }
''',
        '''                    .toLocaleString("ar-EG")} ج.م`
                : "—"
          }
''',
    )

    customers = replace_once(
        customers,
        "customer search readiness",
        '''          value={search}
          onChange={(event) => setSearch(event.target.value)}
''',
        '''          value={search}
          disabled={!customersLoaded}
          title={!customersLoaded ? "اختر الفرع وانتظر تحميل العملاء" : undefined}
          onChange={(event) => setSearch(event.target.value)}
''',
    )

    customers = replace_once(
        customers,
        "missing customer branch empty state",
        '''        {requiresBranchSelection && (
''',
        '''        {missingCustomerBranchAccess && (
          <div className="col-span-full text-center py-12 text-amber-700">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            لا يوجد فرع عمل متاح لعرض العملاء
          </div>
        )}
        {requiresBranchSelection && (
''',
    )

    customers = replace_once(
        customers,
        "customer loading excludes blocked branch",
        '''        {!requiresBranchSelection && !noCustomerBranchAvailable && customersQuery === undefined && (
''',
        '''        {!requiresBranchSelection && !noCustomerBranchAvailable && !missingCustomerBranchAccess && customersQuery === undefined && (
''',
    )

if "const supplierBranchStatus = (() =>" not in suppliers:
    suppliers = replace_once(
        suppliers,
        "supplier branch status helper",
        '''  const filtered = suppliers.filter(
    (supplier) =>
      supplier.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      supplier.phone.includes(search.trim()),
  );

  const handleSupplierBranchChange = (value: string) => {
''',
        '''  const filtered = suppliers.filter(
    (supplier) =>
      supplier.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      supplier.phone.includes(search.trim()),
  );
  const supplierBranchStatus = (() => {
    if (!canViewSupplierLedger) return null;
    if (me === undefined || (!me.branchId && branches === undefined)) {
      return "جارٍ تحميل فروع الأرصدة";
    }
    if (!me?.branchId && (branches?.length ?? 0) === 0) {
      return "لا توجد فروع نشطة لعرض أرصدة الموردين";
    }
    if (requiresLedgerBranchSelection) {
      return "اختر فرعًا لعرض أرصدة ودفاتر الموردين";
    }
    if (effectiveBranch && supplierBalances === undefined) {
      return "جارٍ تحميل أرصدة الموردين للفرع المحدد";
    }
    return null;
  })();

  const handleSupplierBranchChange = (value: string) => {
''',
    )

    suppliers = replace_once(
        suppliers,
        "supplier branch status banner",
        '''      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
''',
        '''      </div>

      {supplierBranchStatus && (
        <p
          role="status"
          className="rounded-xl bg-slate-100 p-3 text-sm font-medium text-slate-700"
        >
          {supplierBranchStatus}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
''',
    )

customers_path.write_text(customers)
suppliers_path.write_text(suppliers)
