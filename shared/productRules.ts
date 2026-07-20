export type ProductRuleInput = { name: string; sku: string; costPrice: number; sellPrice: number; minStock: number; unit: string; warrantyMonths?: number };

function nonNegativeNumber(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} يجب أن يكون رقماً صالحاً غير سالب`);
}
function nonNegativeInteger(value: number, label: string) {
  nonNegativeNumber(value, label);
  if (!Number.isInteger(value)) throw new Error(`${label} يجب أن يكون عدداً صحيحاً`);
}
export function normalizeSku(value: string) {
  const sku = value.trim().toUpperCase();
  if (!sku) throw new Error("رمز SKU مطلوب ولا يمكن أن يكون فارغاً");
  return sku;
}
export function validateProductInput(input: ProductRuleInput) {
  const name = input.name.trim();
  if (!name) throw new Error("اسم المنتج مطلوب");
  const unit = input.unit.trim();
  if (!unit) throw new Error("وحدة المنتج مطلوبة");
  nonNegativeNumber(input.costPrice, "سعر التكلفة");
  nonNegativeNumber(input.sellPrice, "سعر البيع");
  nonNegativeInteger(input.minStock, "الحد الأدنى للمخزون");
  if (input.warrantyMonths !== undefined) nonNegativeInteger(input.warrantyMonths, "مدة الضمان");
  return { name, sku: normalizeSku(input.sku), unit };
}
export function validateOpeningStock(stock: number) { nonNegativeInteger(stock, "المخزون"); }
