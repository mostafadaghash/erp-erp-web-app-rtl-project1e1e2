export type OrderOperationalMeta = {
  internalNotes?: string;
  customerAddress?: string;
  deliveryAddress?: string;
  shippingCompany?: string;
  deliveryNotes?: string;
};

const PREFIX = "__ERP_ORDER_META_V1__:";

const clean = (value?: string) => value?.trim() || undefined;

export function encodeOrderOperationalMeta(meta: OrderOperationalMeta): string | undefined {
  const normalized: OrderOperationalMeta = {
    internalNotes: clean(meta.internalNotes),
    customerAddress: clean(meta.customerAddress),
    deliveryAddress: clean(meta.deliveryAddress),
    shippingCompany: clean(meta.shippingCompany),
    deliveryNotes: clean(meta.deliveryNotes),
  };
  if (!Object.values(normalized).some(Boolean)) return undefined;
  return `${PREFIX}${JSON.stringify(normalized)}`;
}

export function decodeOrderOperationalMeta(value?: string): OrderOperationalMeta {
  if (!value) return {};
  if (!value.startsWith(PREFIX)) return { internalNotes: value };
  try {
    const parsed = JSON.parse(value.slice(PREFIX.length)) as OrderOperationalMeta;
    return {
      internalNotes: clean(parsed.internalNotes),
      customerAddress: clean(parsed.customerAddress),
      deliveryAddress: clean(parsed.deliveryAddress),
      shippingCompany: clean(parsed.shippingCompany),
      deliveryNotes: clean(parsed.deliveryNotes),
    };
  } catch {
    return { internalNotes: value };
  }
}

export function isStructuredOrderMeta(value?: string): boolean {
  return Boolean(value?.startsWith(PREFIX));
}
