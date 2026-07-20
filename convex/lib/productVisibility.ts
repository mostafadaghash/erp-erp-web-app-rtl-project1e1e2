import type { Permission } from "./permissions";

export type ProductFinancialFields = {
  sellPrice: number;
  costPrice: number;
};

export function redactProductFinancials<T extends ProductFinancialFields>(
  product: T,
  permissions: readonly Permission[],
) {
  const { sellPrice, costPrice, ...basic } = product;
  return {
    ...basic,
    ...(permissions.includes("view_prices") ? { sellPrice } : {}),
    ...(permissions.includes("view_profits") ? { costPrice } : {}),
  };
}

export function visibleProductStats(
  products: readonly (ProductFinancialFields & { stock: number })[],
  permissions: readonly Permission[],
) {
  const totalValue = products.reduce((sum, product) => sum + product.costPrice * product.stock, 0);
  const totalRetail = products.reduce((sum, product) => sum + product.sellPrice * product.stock, 0);
  return {
    ...(permissions.includes("view_prices") ? { totalRetail } : {}),
    ...(permissions.includes("view_profits")
      ? { totalValue, potentialProfit: totalRetail - totalValue }
      : {}),
  };
}
