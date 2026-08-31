import { v } from "convex/values";
import { SUPPORTED_CURRENCY_CODES } from "../../shared/currency.ts";

const [egp, usd, sar] = SUPPORTED_CURRENCY_CODES;

export const currencyValidator = v.union(
  v.literal(egp),
  v.literal(usd),
  v.literal(sar),
);
