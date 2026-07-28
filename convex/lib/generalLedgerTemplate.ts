export type AccountClass = "asset"|"liability"|"equity"|"revenue"|"expense";
export type NormalSide = "debit"|"credit";
export interface TemplateAccount { code:string; nameAr:string; parentCode?:string; accountClass:AccountClass; normalSide:NormalSide; isPosting:boolean; isContra?:boolean; systemKey:string }
export const GENERAL_LEDGER_CHART_VERSION = "EGP-FOUNDATION-1";
export const DEFAULT_CHART: readonly TemplateAccount[] = [
 {code:"1000",nameAr:"الأصول",accountClass:"asset",normalSide:"debit",isPosting:false,systemKey:"assets"},
 {code:"1100",nameAr:"النقدية والبنوك",parentCode:"1000",accountClass:"asset",normalSide:"debit",isPosting:false,systemKey:"cash_and_banks"},
 {code:"1110",nameAr:"خزائن نقدية",parentCode:"1100",accountClass:"asset",normalSide:"debit",isPosting:true,systemKey:"cash"},
 {code:"1120",nameAr:"البنوك",parentCode:"1100",accountClass:"asset",normalSide:"debit",isPosting:true,systemKey:"banks"},
 {code:"1130",nameAr:"المحافظ الإلكترونية",parentCode:"1100",accountClass:"asset",normalSide:"debit",isPosting:true,systemKey:"wallets"},
 {code:"1140",nameAr:"متحصلات COD لدى شركات الشحن",parentCode:"1100",accountClass:"asset",normalSide:"debit",isPosting:true,systemKey:"cod_receivable"},
 {code:"1200",nameAr:"مراقبة العملاء",parentCode:"1000",accountClass:"asset",normalSide:"debit",isPosting:true,systemKey:"accounts_receivable"},
 {code:"1300",nameAr:"المخزون",parentCode:"1000",accountClass:"asset",normalSide:"debit",isPosting:true,systemKey:"inventory"},
 {code:"2000",nameAr:"الالتزامات",accountClass:"liability",normalSide:"credit",isPosting:false,systemKey:"liabilities"},
 {code:"2100",nameAr:"مراقبة الموردين",parentCode:"2000",accountClass:"liability",normalSide:"credit",isPosting:true,systemKey:"accounts_payable"},
 {code:"2200",nameAr:"التزامات أخرى",parentCode:"2000",accountClass:"liability",normalSide:"credit",isPosting:true,systemKey:"other_liabilities"},
 {code:"3000",nameAr:"حقوق الملكية",accountClass:"equity",normalSide:"credit",isPosting:false,systemKey:"equity"},
 {code:"3100",nameAr:"رأس المال",parentCode:"3000",accountClass:"equity",normalSide:"credit",isPosting:true,systemKey:"capital"},
 {code:"3200",nameAr:"حقوق ملكية الأرصدة الافتتاحية",parentCode:"3000",accountClass:"equity",normalSide:"credit",isPosting:true,systemKey:"opening_equity"},
 {code:"4000",nameAr:"الإيرادات",accountClass:"revenue",normalSide:"credit",isPosting:false,systemKey:"revenue"},
 {code:"4100",nameAr:"المبيعات",parentCode:"4000",accountClass:"revenue",normalSide:"credit",isPosting:true,systemKey:"sales"},
 {code:"4190",nameAr:"مردودات ومسموحات المبيعات",parentCode:"4000",accountClass:"revenue",normalSide:"debit",isPosting:true,isContra:true,systemKey:"sales_returns"},
 {code:"5000",nameAr:"تكلفة المبيعات",accountClass:"expense",normalSide:"debit",isPosting:true,systemKey:"cogs"},
 {code:"6000",nameAr:"المصروفات التشغيلية",accountClass:"expense",normalSide:"debit",isPosting:false,systemKey:"operating_expenses"},
 {code:"6100",nameAr:"رسوم شركات الشحن",parentCode:"6000",accountClass:"expense",normalSide:"debit",isPosting:true,systemKey:"shipping_fees"},
 {code:"6200",nameAr:"مصروفات تشغيلية عامة",parentCode:"6000",accountClass:"expense",normalSide:"debit",isPosting:true,systemKey:"general_operating_expenses"},
 {code:"7000",nameAr:"إيرادات أخرى",accountClass:"revenue",normalSide:"credit",isPosting:true,systemKey:"other_revenue"},
 {code:"8000",nameAr:"مصروفات أخرى",accountClass:"expense",normalSide:"debit",isPosting:true,systemKey:"other_expenses"},
];
