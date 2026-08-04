import { readFile, writeFile } from "node:fs/promises";

async function patchFile(path, transform) {
  const source = await readFile(path, "utf8");
  const updated = transform(source);
  if (updated === source) throw new Error(`No changes applied to ${path}`);
  await writeFile(path, updated.endsWith("\n") ? updated : `${updated}\n`);
}

function replaceOnce(source, search, replacement, label) {
  const matches = typeof search === "string"
    ? source.split(search).length - 1
    : [...source.matchAll(new RegExp(search.source, search.flags.includes("g") ? search.flags : `${search.flags}g`))].length;
  if (matches !== 1) throw new Error(`${label}: expected one match, found ${matches}`);
  return source.replace(search, replacement);
}

await patchFile("convex/customerLedger.ts", (source) => {
  let updated = replaceOnce(
    source,
    /const customers = \(await ctx\.db\.query\("customers"\)\.withIndex\("by_branch", q => q\.eq\("branchId", args\.branchId\)\)\.collect\(\)\)\.filter\(customer => customer\.isActive !== false\);/,
    'const customers = await ctx.db.query("customers").withIndex("by_branch", q => q.eq("branchId", args.branchId)).collect();',
    "customer options active filter",
  );
  updated = replaceOnce(
    updated,
    'return { customerId: customer._id, customerName: customer.name, phone: customer.phone, branchId: args.branchId, receivableBalance:',
    'return { customerId: customer._id, customerName: customer.name, phone: customer.phone, isActive: customer.isActive !== false, branchId: args.branchId, receivableBalance:',
    "customer option activity DTO",
  );
  return updated;
});

await patchFile("src/components/CustomerLedgerPage.tsx", (source) => {
  let updated = replaceOnce(
    source,
    "لا يوجد عملاء نشطون في هذا الفرع",
    "لا يوجد عملاء في هذا الفرع",
    "customer options empty state",
  );
  updated = replaceOnce(
    updated,
    `              <b>{customer.customerName}</b>\n              <div className="text-xs mt-1">`,
    `              <div className="flex items-center justify-between gap-2">\n                <b>{customer.customerName}</b>\n                {customer.isActive === false && (\n                  <span className="badge badge-danger text-[10px]">معطل</span>\n                )}\n              </div>\n              <div className="text-xs mt-1">`,
    "disabled customer label",
  );
  return updated;
});

await patchFile("src/components/SuppliersPage.tsx", (source) => {
  let updated = replaceOnce(
    source,
    `            value={search}\n            onChange={(event) => setSearch(event.target.value)}`,
    `            value={search}\n            disabled={suppliersQuery === undefined}\n            title={suppliersQuery === undefined ? "انتظر تحميل الموردين" : undefined}\n            onChange={(event) => setSearch(event.target.value)}`,
    "supplier search loading guard",
  );
  updated = replaceOnce(
    updated,
    `                  <p className="mt-2 text-slate-600">{entry.description}</p>\n                  <p className="mt-1 text-xs text-slate-500">`,
    `                  <p className="mt-2 text-slate-600">{entry.description}</p>\n                  {entry.externalInvoiceNumber && (\n                    <p className="mt-1 text-xs text-slate-500">\n                      فاتورة المورد: {entry.externalInvoiceNumber}\n                    </p>\n                  )}\n                  {entry.reversalDate && (\n                    <p className="mt-1 text-xs text-rose-700">\n                      تاريخ العكس: {entry.reversalDate}\n                    </p>\n                  )}\n                  {entry.reversalReason && (\n                    <p className="mt-1 text-xs text-rose-700 break-words">\n                      سبب العكس: {entry.reversalReason}\n                    </p>\n                  )}\n                  <p className="mt-1 text-xs text-slate-500">`,
    "supplier ledger metadata",
  );
  return updated;
});
