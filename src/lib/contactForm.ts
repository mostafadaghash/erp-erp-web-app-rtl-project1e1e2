import {
  normalizeContactEmail,
  normalizeContactName,
  normalizeContactPhone,
  normalizeOptionalContactText,
} from "../../shared/contactRules.ts";

export type ContactFormValues = {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

export type ContactPayload = {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
};

export type ContactFormErrors = Partial<
  Record<keyof ContactFormValues, string>
>;

export type ContactFormValidation =
  | {
      ok: true;
      payload: ContactPayload;
      normalizedForm: ContactFormValues;
    }
  | {
      ok: false;
      errors: ContactFormErrors;
      reason: string;
    };

export function validateContactForm(
  values: ContactFormValues,
): ContactFormValidation {
  const errors: ContactFormErrors = {};
  let name: string | undefined;
  let phone: string | undefined;
  let email: string | undefined;
  let address: string | undefined;
  let notes: string | undefined;

  try {
    name = normalizeContactName(values.name);
  } catch {
    errors.name = values.name.trim()
      ? "الاسم يجب أن يكون بين حرفين و100 حرف"
      : "الاسم مطلوب";
  }

  try {
    phone = normalizeContactPhone(values.phone);
  } catch {
    errors.phone = values.phone.trim()
      ? "رقم الهاتف يجب أن يحتوي على 7 إلى 15 رقمًا صحيحًا"
      : "رقم الهاتف مطلوب";
  }

  try {
    email = normalizeContactEmail(values.email);
  } catch {
    errors.email = "أدخل بريدًا إلكترونيًا صحيحًا لا يتجاوز 254 حرفًا";
  }

  try {
    address = normalizeOptionalContactText(values.address, 300);
  } catch {
    errors.address = "العنوان لا يتجاوز 300 حرف";
  }

  try {
    notes = normalizeOptionalContactText(values.notes, 1000);
  } catch {
    errors.notes = "الملاحظات لا تتجاوز 1000 حرف";
  }

  const reason =
    errors.name ??
    errors.phone ??
    errors.email ??
    errors.address ??
    errors.notes;
  if (reason) return { ok: false, errors, reason };

  if (!name || !phone) {
    return {
      ok: false,
      errors: {
        ...errors,
        ...(!name ? { name: "الاسم مطلوب" } : {}),
        ...(!phone ? { phone: "رقم الهاتف مطلوب" } : {}),
      },
      reason: !name ? "الاسم مطلوب" : "رقم الهاتف مطلوب",
    };
  }

  const payload: ContactPayload = {
    name,
    phone,
    ...(email ? { email } : {}),
    ...(address ? { address } : {}),
    ...(notes ? { notes } : {}),
  };

  return {
    ok: true,
    payload,
    normalizedForm: {
      name,
      phone,
      email: email ?? "",
      address: address ?? "",
      notes: notes ?? "",
    },
  };
}
