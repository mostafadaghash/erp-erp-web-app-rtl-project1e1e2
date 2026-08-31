import { readFileSync, writeFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const write = (path, source) => writeFileSync(path, source);

function transform(path, fn) {
  const before = read(path);
  const after = fn(before);
  if (after === before) throw new Error(`No changes produced for ${path}`);
  write(path, after);
}

function prependImport(source, line) {
  return source.includes(line) ? source : `${line}\n${source}`;
}

function insertIntoExportedFunction(source, functionName, lines) {
  const marker = `export function ${functionName}`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${marker}`);
  const openParen = source.indexOf("(", start + marker.length);
  if (openParen < 0) throw new Error(`Missing function params for ${functionName}`);
  let depth = 0;
  let closeParen = -1;
  for (let index = openParen; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    else if (source[index] === ")") {
      depth -= 1;
      if (depth === 0) { closeParen = index; break; }
    }
  }
  if (closeParen < 0) throw new Error(`Unclosed params for ${functionName}`);
  const bodyOpen = source.indexOf("{", closeParen);
  if (bodyOpen < 0) throw new Error(`Missing function body for ${functionName}`);
  const insertion = `\n${lines.map(line => `  ${line}`).join("\n")}`;
  return source.slice(0, bodyOpen + 1) + insertion + source.slice(bodyOpen + 1);
}

function addCurrencyHook(source, functionName, withCode = false, extraLines = []) {
  source = prependImport(source, 'import { useCurrency } from "../lib/utils";');
  const destructure = withCode
    ? "const { formatCurrency, currencyCode } = useCurrency();"
    : "const { formatCurrency } = useCurrency();";
  if (!source.includes(destructure)) {
    source = insertIntoExportedFunction(source, functionName, [destructure, ...extraLines]);
  }
  return source;
}

function replaceDirectCurrency(source) {
  source = source.replace(
    /\{([^{}\n]+?)\.toLocaleString\("ar-EG"(?:,\s*\{[^{}]*\})?\)\} ج\.م/g,
    "{formatCurrency($1)}",
  );
  source = source.replace(
    /\$\{([^{}\n]+?)\.toLocaleString\("ar-EG"(?:,\s*\{[^{}]*\})?\)\} ج\.م/g,
    "${formatCurrency($1)}",
  );
  return source;
}

function replaceFormatAmountCurrency(source) {
  source = source.replace(/\{formatAmount\(([^{}]+)\)\} ج\.م/g, "{formatCurrency($1)}");
  source = source.replace(/\{formatAmount\(([^{}]+)\)\} <span>ج\.م<\/span>/g, "{formatCurrency($1)}");
  return source;
}

// CRM
transform("src/components/CRMPage.tsx", (source) => {
  source = addCurrencyHook(source, "CRMPage", true);
  source = replaceDirectCurrency(source);
  source = source.replace("الميزانية (ج.م)", "الميزانية ({currencyCode})");
  return source;
});

// Expenses
transform("src/components/ExpensesPage.tsx", (source) => {
  source = addCurrencyHook(source, "ExpensesPage", true);
  source = replaceDirectCurrency(source);
  source = source.replace('{(expenseStats?.total ?? 0).toLocaleString("ar-EG")}', "{formatCurrency(expenseStats?.total ?? 0)}");
  source = source.replace('{(expenseStats?.today ?? 0).toLocaleString("ar-EG")}', "{formatCurrency(expenseStats?.today ?? 0)}");
  source = source.replace('{cat.total.toLocaleString("ar-EG")}', "{formatCurrency(cat.total)}");
  source = source.replace("إجمالي المصروفات (ج.م)", "إجمالي المصروفات ({currencyCode})");
  source = source.replace("مصروفات اليوم (ج.م)", "مصروفات اليوم ({currencyCode})");
  source = source.replace("المبلغ (ج.م) *", "المبلغ ({currencyCode}) *");
  return source;
});

// General ledger
transform("src/components/GeneralLedgerPage.tsx", (source) => {
  source = addCurrencyHook(source, "GeneralLedgerPage", true, ["const money = formatCurrency;"]);
  source = source.replace(/const money = \(value: number\) =>\n  new Intl\.NumberFormat\("ar-EG", \{[\s\S]*?\n  \}\)\.format\(value\);\n/, "");
  source = source.replace(
    'function Totals({ totals }: { totals: ReturnType<typeof lineValidation> }) {',
    'function Totals({ totals, formatCurrency }: { totals: ReturnType<typeof lineValidation>; formatCurrency: (value: number) => string }) {',
  );
  source = source.replaceAll("money(totals.", "formatCurrency(totals.");
  source = source.replaceAll("<Totals totals=", "<Totals formatCurrency={formatCurrency} totals=");
  source = source.replace("العملة الأساسية: EGP", "العملة الأساسية: ${currencyCode}");
  source = source.replace("دليل حسابات، قيود مزدوجة، فترات مالية وتقارير مراجعة — EGP.", "دليل حسابات، قيود مزدوجة، فترات مالية وتقارير مراجعة — {currencyCode}.");
  return source;
});

// Sales invoice
transform("src/components/NewInvoicePage.tsx", (source) => {
  source = source.replace("const { formatAmount } = useCurrency();", "const { formatAmount, formatCurrency } = useCurrency();");
  source = replaceFormatAmountCurrency(source);
  return source;
});

// Purchase invoice
transform("src/components/NewPurchaseInvoicePage.tsx", (source) => {
  if (source.includes("const { formatAmount } = useCurrency();")) {
    source = source.replace("const { formatAmount } = useCurrency();", "const { formatAmount, formatCurrency } = useCurrency();");
  } else if (!source.includes("formatCurrency } = useCurrency()")) {
    source = addCurrencyHook(source, "NewPurchaseInvoicePage");
  }
  source = replaceFormatAmountCurrency(source);
  return source;
});

// Orders
transform("src/components/OrdersPage.tsx", (source) => {
  source = addCurrencyHook(source, "OrdersPage", true, ["const money = formatCurrency;"]);
  source = source.replace('const money = (value: number) => `${value.toLocaleString("ar-EG")} ج.م`;\n', "");
  source = source.replace(
    'function getWhatsAppMessage(status: string, orderNumber: string, customerName: string, storeName: string, remaining: number): string {',
    'function getWhatsAppMessage(status: string, orderNumber: string, customerName: string, storeName: string, remaining: number, formatCurrency: (value: number) => string): string {',
  );
  source = source.replace('${remaining.toLocaleString("ar-EG")} ج.م', '${formatCurrency(remaining)}');
  source = source.replace(
    "getWhatsAppMessage(order.status, order.orderNumber, order.customerName, storeName, order.remaining)",
    "getWhatsAppMessage(order.status, order.orderNumber, order.customerName, storeName, order.remaining, formatCurrency)",
  );
  source = source.replace("المبلغ المدفوع (ج.م)", "المبلغ المدفوع ({currencyCode})");
  return source;
});

// Payment schedules
transform("src/components/PaymentSchedulesPage.tsx", (source) => {
  source = addCurrencyHook(source, "PaymentSchedulesPage");
  source = replaceDirectCurrency(source);
  return source;
});

// Products
transform("src/components/ProductsPage.tsx", (source) => {
  source = addCurrencyHook(source, "ProductsPage");
  source = replaceDirectCurrency(source);
  return source;
});

// Purchase returns
transform("src/components/PurchaseReturnsPage.tsx", (source) => {
  source = addCurrencyHook(source, "PurchaseReturnsPage", false, ["const money = formatCurrency;"]);
  source = source.replace(/const money = \(value: number\) =>\n  `\$\{value\.toLocaleString\("ar-EG", \{ minimumFractionDigits: 2, maximumFractionDigits: 2 \}\)\} ج\.م`;\n/, "");
  return source;
});

// Repair work correction
transform("src/components/RepairWorkEditDialog.tsx", (source) => {
  source = addCurrencyHook(source, "RepairWorkEditDialog", false, ["const money = formatCurrency;"]);
  source = source.replace('const money = (value: number) => `${value.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;\n', "");
  return source;
});

// Repairs
transform("src/components/RepairsPage.tsx", (source) => {
  source = addCurrencyHook(source, "RepairsPage", false, ["const money = formatCurrency;"]);
  source = source.replace('const money = (value: number) => `${value.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;\n', "");
  return source;
});

// Settings
transform("src/components/SettingsPage.tsx", (source) => {
  source = prependImport(source, 'import { CURRENCY_DEFINITIONS, DEFAULT_CURRENCY_CODE, SUPPORTED_CURRENCY_CODES, normalizeCurrencyCode, type CurrencyCode } from "../../shared/currency";');
  const occurrences = [...source.matchAll(/currency: "EGP",/g)];
  if (occurrences.length !== 3) throw new Error(`Expected 3 settings EGP occurrences, found ${occurrences.length}`);
  let occurrence = 0;
  source = source.replace(/currency: "EGP",/g, () => {
    occurrence += 1;
    if (occurrence === 1) return "currency: DEFAULT_CURRENCY_CODE,";
    if (occurrence === 2) return "currency: normalizeCurrencyCode(settings.currency),";
    return "currency: form.currency,";
  });
  source = source.replace(
    '<label className="form-label">العملة<select className="form-input" value="EGP" disabled><option value="EGP">جنيه مصري (EGP)</option></select></label>',
    '<label className="form-label">العملة الأساسية<select data-testid="settings-currency" className="form-input" value={form.currency} onChange={event => setForm({ ...form, currency: event.target.value as CurrencyCode })}>{SUPPORTED_CURRENCY_CODES.map(code => <option key={code} value={code}>{CURRENCY_DEFINITIONS[code].labelAr} ({code})</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-400">تغيير العملة يغيّر عرض القيم المالية ولا ينفذ تحويل أسعار صرف.</span></label>',
  );
  return source;
});

// Shipments
transform("src/components/ShipmentsPage.tsx", (source) => {
  source = addCurrencyHook(source, "ShipmentsPage", true);
  source = replaceDirectCurrency(source);
  source = source.replace('(stats?.totalCost ?? 0).toLocaleString("ar-EG") + " ج.م"', "formatCurrency(stats?.totalCost ?? 0)");
  source = source.replace("تكلفة الشحن (ج.م)", "تكلفة الشحن ({currencyCode})");
  return source;
});

// Supplier payments
transform("src/components/SupplierPaymentsPage.tsx", (source) => {
  source = addCurrencyHook(source, "SupplierPaymentsPage");
  source = source.replace('${total.toFixed(2)} ج.م', '${formatCurrency(total)}');
  source = source.replace('${escape(row.amount.toFixed(2))} ج.م', '${escape(formatCurrency(row.amount))}');
  source = source.replace('${escape(printDto.amount.toFixed(2))} ج.م', '${escape(formatCurrency(printDto.amount))}');
  source = source.replace('{balance.balance.toFixed(2)} ج.م', '{formatCurrency(balance.balance)}');
  source = source.replace('{total.toFixed(2)} ج.م', '{formatCurrency(total)}');
  source = source.replace('<td>{r.remainingAmount}</td>', '<td>{formatCurrency(r.remainingAmount)}</td>');
  source = source.replace('[canPrint, printDto, printPaymentId, storeName]', '[canPrint, printDto, printPaymentId, storeName, formatCurrency]');
  return source;
});

// Suppliers
transform("src/components/SuppliersPage.tsx", (source) => {
  source = addCurrencyHook(source, "SuppliersPage");
  source = replaceDirectCurrency(source);
  return source;
});

// Vouchers
transform("src/components/VouchersPage.tsx", (source) => {
  source = addCurrencyHook(source, "VouchersPage");
  source = replaceDirectCurrency(source);
  return source;
});

// Print templates use the same settings record as the UI, so bind a formatter per document.
transform("src/components/PrintTemplate.tsx", (source) => {
  source = prependImport(source, 'import { formatCurrencyValue } from "../lib/currency";');
  source = source.replace('const money = (value: number) => `${Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;\n', "");
  for (const name of ["InvoiceTemplate", "OrderTemplate", "RepairTemplate"]) {
    const marker = `function ${name}`;
    const start = source.indexOf(marker);
    if (start < 0) throw new Error(`Missing ${name}`);
    const bodyOpen = source.indexOf("{", source.indexOf(")", start));
    source = source.slice(0, bodyOpen + 1) + '\n  const money = (value: number) => formatCurrencyValue(value, settings?.currency);' + source.slice(bodyOpen + 1);
  }
  return source;
});

// Backend settings
transform("convex/settings.ts", (source) => {
  source = prependImport(source, 'import { DEFAULT_CURRENCY_CODE } from "../shared/currency.ts";');
  source = prependImport(source, 'import { currencyValidator } from "./lib/currency.ts";');
  source = source.replace("currency: v.string(),", "currency: currencyValidator,");
  source = source.replace('currency: "EGP",', "currency: args.currency,");
  source = source.replace('currency: "EGP",', "currency: DEFAULT_CURRENCY_CODE,");
  const anchor = '    const id = existing\n      ? (await ctx.db.patch(existing._id, normalizedArgs), existing._id)\n      : await ctx.db.insert("settings", normalizedArgs);';
  if (!source.includes(anchor)) throw new Error("Missing settings upsert anchor");
  source = source.replace(anchor, `${anchor}\n\n    const ledgerSettings = await ctx.db.query("generalLedgerSettings").first();\n    if (ledgerSettings && ledgerSettings.baseCurrency !== normalizedArgs.currency) {\n      await ctx.db.patch(ledgerSettings._id, { baseCurrency: normalizedArgs.currency });\n    }`);
  return source;
});

// Schema contracts
transform("convex/schema.ts", (source) => {
  source = prependImport(source, 'import { currencyValidator } from "./lib/currency";');
  source = source.replace('baseCurrency:v.literal("EGP")', "baseCurrency:currencyValidator");
  source = source.replace("currency: v.string(),", "currency: currencyValidator,");
  return source;
});

// General ledger initialization reads the configured single base currency.
transform("convex/generalLedger.ts", (source) => {
  source = prependImport(source, 'import { normalizeCurrencyCode } from "../shared/currency.ts";');
  const oldLine = ' const id=await ctx.db.insert("generalLedgerSettings",{baseCurrency:"EGP",chartVersion:GENERAL_LEDGER_CHART_VERSION,status:"foundation_ready",operationalPostingEnabled:false,financialPostingEnabled:false,cutoverDate,initializedAt:now,initializedBy:user.userId,initializationRequestId:requestId,initializationFingerprint:fp});';
  if (!source.includes(oldLine)) throw new Error("Missing general ledger base currency insert");
  source = source.replace(oldLine, ' const businessSettings=await ctx.db.query("settings").first(),baseCurrency=normalizeCurrencyCode(businessSettings?.currency);\n const id=await ctx.db.insert("generalLedgerSettings",{baseCurrency,chartVersion:GENERAL_LEDGER_CHART_VERSION,status:"foundation_ready",operationalPostingEnabled:false,financialPostingEnabled:false,cutoverDate,initializedAt:now,initializedBy:user.userId,initializationRequestId:requestId,initializationFingerprint:fp});');
  return source;
});

// Final scan. The chart version is a historical schema/version identifier, not a display currency.
const allowed = new Set([
  "shared/currency.ts",
  "src/lib/currency.ts",
  "convex/lib/currency.ts",
  "convex/lib/generalLedgerTemplate.ts",
]);
const targets = [
  "src/components/CRMPage.tsx",
  "src/components/ExpensesPage.tsx",
  "src/components/GeneralLedgerPage.tsx",
  "src/components/NewInvoicePage.tsx",
  "src/components/NewPurchaseInvoicePage.tsx",
  "src/components/OrdersPage.tsx",
  "src/components/PaymentSchedulesPage.tsx",
  "src/components/PrintTemplate.tsx",
  "src/components/ProductsPage.tsx",
  "src/components/PurchaseReturnsPage.tsx",
  "src/components/RepairWorkEditDialog.tsx",
  "src/components/RepairsPage.tsx",
  "src/components/SettingsPage.tsx",
  "src/components/ShipmentsPage.tsx",
  "src/components/SupplierPaymentsPage.tsx",
  "src/components/SuppliersPage.tsx",
  "src/components/VouchersPage.tsx",
  "src/lib/utils.ts",
  "convex/generalLedger.ts",
  "convex/schema.ts",
  "convex/settings.ts",
];
for (const path of targets) {
  if (allowed.has(path)) continue;
  const source = read(path);
  if (/\bEGP\b|ج\.م/.test(source)) throw new Error(`Hard-coded currency remains in ${path}`);
}

console.log("Stage 4 currency codemod completed successfully.");
