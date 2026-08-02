from pathlib import Path

customers_path = Path("src/components/CustomersPage.tsx")
suppliers_path = Path("src/components/SuppliersPage.tsx")
customers = customers_path.read_text()
suppliers = suppliers_path.read_text()


def replace_once(text: str, label: str, old: str, new: str) -> str:
    if old not in text:
        raise SystemExit(f"missing expected source: {label}")
    return text.replace(old, new, 1)


if "const [selectedBranchId, setSelectedBranchId]" not in customers:
    customers = replace_once(
        customers,
        "customer queries and state",
        '''  const canCreate = usePermission("create_customers");
  const canEdit = usePermission("edit_customers");
  const canSetActive = usePermission("delete_customers");
  const canViewLedger = usePermission("view_customer_ledger");
  const me = useQuery(api.employees.me);
  const customerArgs = me
    ? me.branchId
      ? { branchId: me.branchId }
      : {}
    : "skip";
  const customers = useQuery(api.customers.list, customerArgs) ?? [];
  const balances = useQuery(
    api.customerLedger.branchBalances,
    canViewLedger && me?.branchId ? { branchId: me.branchId } : "skip",
  ) as CustomerBalance[] | undefined;
  const createCustomer = useMutation(api.customers.create);
  const updateCustomer = useMutation(api.customers.update);
  const setCustomerActive = useMutation(api.customers.setActive);

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<Id<"customers"> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<Id<"customers"> | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
''',
        '''  const canCreate = usePermission("create_customers");
  const canEdit = usePermission("edit_customers");
  const canSetActive = usePermission("delete_customers");
  const canViewLedger = usePermission("view_customer_ledger");
  const canViewBranches = usePermission("view_branches");
  const me = useQuery(api.employees.me);

  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<Id<"customers"> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<Id<"customers"> | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);

  const branchesQuery = useQuery(
    api.branches.list,
    canViewBranches && !me?.branchId ? {} : "skip",
  );
  const branches = branchesQuery ?? [];
  const effectiveBranchId = me?.branchId ??
    (selectedBranchId ? selectedBranchId as Id<"branches"> : null);
  const requiresBranchSelection = Boolean(
    me && !me.branchId && canViewBranches && branches.length > 0 && !selectedBranchId,
  );
  const noCustomerBranchAvailable = Boolean(
    me &&
      !me.branchId &&
      canViewBranches &&
      branchesQuery !== undefined &&
      branches.length === 0,
  );
  const customerArgs = me && effectiveBranchId
    ? { branchId: effectiveBranchId }
    : "skip";
  const customersQuery = useQuery(api.customers.list, customerArgs);
  const customers = customersQuery ?? [];
  const balances = useQuery(
    api.customerLedger.branchBalances,
    canViewLedger && effectiveBranchId
      ? { branchId: effectiveBranchId }
      : "skip",
  ) as CustomerBalance[] | undefined;
  const createCustomer = useMutation(api.customers.create);
  const updateCustomer = useMutation(api.customers.update);
  const setCustomerActive = useMutation(api.customers.setActive);
''',
    )

    customers = replace_once(
        customers,
        "customer balance scope",
        '''  const hasBalanceScope =
    canViewLedger && Boolean(me?.branchId) && balances !== undefined;
''',
        '''  const hasBalanceScope =
    canViewLedger && Boolean(effectiveBranchId) && balances !== undefined;
''',
    )

    customers = replace_once(
        customers,
        "customer branch handler",
        '''  const closeForm = () => {
''',
        '''  const handleCustomerBranchChange = (value: string) => {
    if (saving || updatingId !== null) return;
    setSelectedBranchId(value);
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setSearch("");
  };

  const closeForm = () => {
''',
    )

    customers = replace_once(
        customers,
        "customer create guard",
        '''  const openCreate = () => {
    setEditingId(null);
''',
        '''  const openCreate = () => {
    if (!effectiveBranchId) {
      toast.error("اختر فرع العميل أولًا");
      return;
    }
    setEditingId(null);
''',
    )

    customers = replace_once(
        customers,
        "customer create branch",
        '''      } else {
        await createCustomer({ ...payload, branchId: me?.branchId });
        toast.success("تمت إضافة العميل");
''',
        '''      } else {
        if (!effectiveBranchId) {
          toast.error("اختر فرع العميل أولًا");
          return;
        }
        await createCustomer({ ...payload, branchId: effectiveBranchId });
        toast.success("تمت إضافة العميل");
''',
    )

    customers = replace_once(
        customers,
        "customer ledger branch",
        '''    const branchId = customer.branchId ?? me?.branchId;
''',
        '''    const branchId = customer.branchId ?? effectiveBranchId;
''',
    )

    customers = replace_once(
        customers,
        "customer header",
        '''      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600" />
            العملاء
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{customers.length} عميل</p>
        </div>
        {canCreate && (
          <button
            onClick={openCreate}
            disabled={!me?.branchId}
            className="btn-primary flex items-center gap-2"
            title={!me?.branchId ? "اختر فرع العمل أولًا" : undefined}
          >
            <Plus className="w-4 h-4" />
            عميل جديد
          </button>
        )}
      </div>
''',
        '''      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600" />
            العملاء
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {noCustomerBranchAvailable
              ? "لا توجد فروع نشطة"
              : requiresBranchSelection
                ? "اختر الفرع لعرض العملاء"
                : customersQuery === undefined
                  ? "جارٍ تحميل العملاء"
                  : `${customers.length} عميل`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canViewBranches && !me?.branchId && branches.length > 0 && (
            <select
              className="form-input min-w-40"
              aria-label="فرع العملاء"
              value={selectedBranchId}
              disabled={saving || updatingId !== null}
              onChange={(event) => handleCustomerBranchChange(event.target.value)}
            >
              <option value="">اختر الفرع</option>
              {branches.map((branch: { _id: Id<"branches">; name: string }) => (
                <option key={branch._id} value={branch._id}>{branch.name}</option>
              ))}
            </select>
          )}
          {canCreate && (
            <button
              onClick={openCreate}
              disabled={!effectiveBranchId}
              className="btn-primary flex items-center gap-2"
              title={!effectiveBranchId ? "اختر فرع العميل أولًا" : undefined}
            >
              <Plus className="w-4 h-4" />
              عميل جديد
            </button>
          )}
        </div>
      </div>
''',
    )

    customers = replace_once(
        customers,
        "customer empty states",
        '''        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            لا يوجد عملاء
          </div>
        )}
''',
        '''        {requiresBranchSelection && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            اختر الفرع لعرض العملاء
          </div>
        )}
        {!requiresBranchSelection && !noCustomerBranchAvailable && customersQuery === undefined && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            جارٍ تحميل العملاء
          </div>
        )}
        {!requiresBranchSelection && customersQuery !== undefined && customers.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            لا يوجد عملاء في هذا الفرع
          </div>
        )}
        {customers.length > 0 && filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            لا توجد نتائج مطابقة للبحث
          </div>
        )}
''',
    )

if "const suppliersQuery = useQuery(api.suppliers.list)" not in suppliers:
    suppliers = replace_once(
        suppliers,
        "supplier list query",
        '''  const me = useQuery(api.employees.me);
  const suppliers = useQuery(api.suppliers.list) ?? [];
''',
        '''  const me = useQuery(api.employees.me);
  const suppliersQuery = useQuery(api.suppliers.list);
  const suppliers = suppliersQuery ?? [];
''',
    )

    suppliers = replace_once(
        suppliers,
        "supplier branch scope",
        '''  const effectiveBranch =
    selectedBranch ?? me?.branchId ?? branches?.[0]?._id ?? null;
  const pinnedBalanceArgs = canViewSupplierLedger && me?.branchId ? { branchId: me.branchId } : "skip";
  const supplierBalanceArgs =
    canViewSupplierLedger && effectiveBranch
      ? { branchId: effectiveBranch }
      : pinnedBalanceArgs;
''',
        '''  const effectiveBranch = me?.branchId ?? selectedBranch;
  const requiresLedgerBranchSelection = Boolean(
    canViewSupplierLedger &&
      me &&
      !me.branchId &&
      (branches?.length ?? 0) > 0 &&
      !selectedBranch,
  );
  const supplierBalanceArgs =
    canViewSupplierLedger && effectiveBranch
      ? { branchId: effectiveBranch }
      : "skip";
''',
    )

    suppliers = replace_once(
        suppliers,
        "supplier balance helper",
        '''  const balanceFor = (supplierId: Id<"suppliers">) =>
    supplierBalances?.find((balance) => balance.supplierId === supplierId)
      ?.balance ?? 0;
  const filtered = suppliers.filter(
''',
        '''  const balanceFor = (supplierId: Id<"suppliers">) =>
    supplierBalances?.find((balance) => balance.supplierId === supplierId)
      ?.balance;
  const hasSupplierBalanceScope =
    supplierBalances !== undefined && Boolean(effectiveBranch);
  const filtered = suppliers.filter(
''',
    )

    suppliers = replace_once(
        suppliers,
        "supplier branch handler",
        '''  const closeForm = () => {
''',
        '''  const handleSupplierBranchChange = (value: string) => {
    setSelectedBranch(value ? value as Id<"branches"> : null);
    setLedgerTarget(null);
  };

  const closeForm = () => {
''',
    )

    suppliers = replace_once(
        suppliers,
        "supplier subtitle",
        '''          <p className="text-slate-500 text-sm mt-0.5">{suppliers.length} مورد</p>
''',
        '''          <p className="text-slate-500 text-sm mt-0.5">
            {suppliersQuery === undefined
              ? "جارٍ تحميل الموردين"
              : `${suppliers.length} مورد`}
          </p>
''',
    )

    suppliers = replace_once(
        suppliers,
        "supplier branch selector",
        '''        {canViewSupplierLedger && branches && branches.length > 1 && (
          <select
            className="form-input sm:max-w-xs"
            aria-label="فرع أرصدة الموردين"
            value={effectiveBranch ?? ""}
            onChange={(event) => {
              setSelectedBranch(event.target.value as Id<"branches">);
              setLedgerTarget(null);
            }}
          >
            {branches.map((branch) => (
''',
        '''        {canViewSupplierLedger && !me?.branchId && branches && branches.length > 0 && (
          <select
            className="form-input sm:max-w-xs"
            aria-label="فرع أرصدة الموردين"
            value={selectedBranch ?? ""}
            onChange={(event) => handleSupplierBranchChange(event.target.value)}
          >
            <option value="">اختر فرع الأرصدة</option>
            {branches.map((branch) => (
''',
    )

    suppliers = replace_once(
        suppliers,
        "supplier balance display",
        '''            {canViewSupplierLedger && effectiveBranch && (
              <div className="pt-3 border-t border-slate-100 flex justify-between">
                <p className="text-xs text-slate-500">الرصيد المستحق</p>
                <p className="font-bold text-sm text-amber-600">
                  {balanceFor(supplier._id).toLocaleString("ar-EG")} ج.م
                </p>
              </div>
            )}
''',
        '''            {canViewSupplierLedger && (
              <div className="pt-3 border-t border-slate-100 flex justify-between gap-3">
                <p className="text-xs text-slate-500">الرصيد المستحق</p>
                <p className="font-bold text-sm text-amber-600 text-left">
                  {requiresLedgerBranchSelection
                    ? "اختر فرع الأرصدة"
                    : effectiveBranch && supplierBalances === undefined
                      ? "جارٍ تحميل رصيد الفرع"
                      : hasSupplierBalanceScope
                        ? `${(balanceFor(supplier._id) ?? 0).toLocaleString("ar-EG")} ج.م`
                        : "—"}
                </p>
              </div>
            )}
''',
    )

    suppliers = replace_once(
        suppliers,
        "supplier ledger action gate",
        '''              {canViewSupplierLedger && effectiveBranch && (
''',
        '''              {canViewSupplierLedger && hasSupplierBalanceScope && (
''',
    )

    suppliers = replace_once(
        suppliers,
        "supplier ledger balance",
        '''                  {balanceFor(ledgerTarget._id).toLocaleString("ar-EG")} ج.م
''',
        '''                  {(balanceFor(ledgerTarget._id) ?? 0).toLocaleString("ar-EG")} ج.م
''',
    )

    suppliers = replace_once(
        suppliers,
        "supplier empty states",
        '''        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
            لا يوجد موردون
          </div>
        )}
''',
        '''        {suppliersQuery === undefined && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
            جارٍ تحميل الموردين
          </div>
        )}
        {suppliersQuery !== undefined && suppliers.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
            لا يوجد موردون
          </div>
        )}
        {suppliers.length > 0 && filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
            لا توجد نتائج مطابقة للبحث
          </div>
        )}
''',
    )

    suppliers = replace_once(
        suppliers,
        "supplier ledger loading states",
        '''            <div className="overflow-y-auto divide-y">
              {ledgerEntries.map((entry) => (
''',
        '''            <div className="overflow-y-auto divide-y">
              {ledgerStatus === "LoadingFirstPage" && (
                <p className="p-8 text-center text-slate-400">جارٍ تحميل دفتر المورد</p>
              )}
              {ledgerEntries.map((entry) => (
''',
    )

    suppliers = replace_once(
        suppliers,
        "supplier ledger empty state",
        '''              {ledgerEntries.length === 0 && ledgerStatus !== "LoadingFirstPage" && (
''',
        '''              {ledgerEntries.length === 0 && ledgerStatus === "Exhausted" && (
''',
    )

    suppliers = replace_once(
        suppliers,
        "supplier ledger loading more",
        '''            {ledgerStatus === "CanLoadMore" && (
              <footer className="p-4 border-t">
                <button
                  onClick={() => loadMoreLedger(15)}
                  className="btn-secondary w-full"
                >
                  تحميل المزيد
                </button>
              </footer>
            )}
''',
        '''            {ledgerStatus === "CanLoadMore" && (
              <footer className="p-4 border-t">
                <button
                  onClick={() => loadMoreLedger(15)}
                  className="btn-secondary w-full"
                >
                  تحميل المزيد
                </button>
              </footer>
            )}
            {ledgerStatus === "LoadingMore" && (
              <footer className="p-4 border-t text-center text-sm text-slate-400">
                جارٍ تحميل المزيد
              </footer>
            )}
''',
    )

customers_path.write_text(customers)
suppliers_path.write_text(suppliers)
