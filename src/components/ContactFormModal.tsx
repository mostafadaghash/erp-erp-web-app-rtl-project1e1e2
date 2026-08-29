import { useEffect, useRef, type FormEvent } from "react";
import { X } from "lucide-react";
import type {
  ContactFormValidation,
  ContactFormValues,
} from "../lib/contactForm";

type ContactFormModalProps = {
  title: string;
  nameLabel: string;
  form: ContactFormValues;
  saving: boolean;
  validation: ContactFormValidation;
  onChange: (form: ContactFormValues) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  categoryOptions?: Array<{ _id: string; name: string }>;
  categoryId?: string;
  onCategoryChange?: (categoryId: string) => void;
};

export function ContactFormModal({
  title,
  nameLabel,
  form,
  saving,
  validation,
  onChange,
  onClose,
  onSubmit,
  categoryOptions,
  categoryId,
  onCategoryChange,
}: ContactFormModalProps) {
  const errors = validation.ok ? undefined : validation.errors;
  const submitLock = useRef(false);

  useEffect(() => {
    if (!saving) submitLock.current = false;
  }, [saving]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    onSubmit(event);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl animate-fade-in-up">
        <header className="p-5 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </header>
        <form noValidate onSubmit={handleSubmit} className="p-6 space-y-4">
          <ContactField
            id="contact-name"
            label={nameLabel}
            value={form.name}
            required
            maxLength={100}
            autoComplete="name"
            error={errors?.name}
            onChange={(name) => onChange({ ...form, name })}
          />
          {categoryOptions && onCategoryChange && <label className="block"><span className="form-label">التصنيف</span><select className="form-input" value={categoryId ?? ""} onChange={event => onCategoryChange(event.target.value)}><option value="">بدون تصنيف</option>{categoryOptions.map(option => <option key={option._id} value={option._id}>{option.name}</option>)}</select></label>}
          <ContactField
            id="contact-phone"
            label="رقم الهاتف *"
            value={form.phone}
            required
            maxLength={30}
            inputMode="tel"
            autoComplete="tel"
            error={errors?.phone}
            onChange={(phone) => onChange({ ...form, phone })}
          />
          <ContactField
            id="contact-email"
            label="البريد الإلكتروني"
            value={form.email}
            type="email"
            maxLength={254}
            inputMode="email"
            autoComplete="email"
            error={errors?.email}
            onChange={(email) => onChange({ ...form, email })}
          />
          <ContactField
            id="contact-address"
            label="العنوان"
            value={form.address}
            maxLength={300}
            autoComplete="street-address"
            error={errors?.address}
            onChange={(address) => onChange({ ...form, address })}
          />
          <label className="block" htmlFor="contact-notes">
            <span className="form-label">ملاحظات</span>
            <textarea
              id="contact-notes"
              className="form-input"
              rows={2}
              maxLength={1000}
              aria-invalid={Boolean(errors?.notes)}
              aria-describedby={errors?.notes ? "contact-notes-error" : undefined}
              value={form.notes}
              onChange={(event) =>
                onChange({ ...form, notes: event.target.value })
              }
            />
            {errors?.notes && (
              <span
                id="contact-notes-error"
                className="mt-1 block text-xs font-semibold text-rose-600"
              >
                {errors.notes}
              </span>
            )}
          </label>

          {!validation.ok && (
            <p
              role="alert"
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800"
            >
              {validation.reason}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving || !validation.ok}
              title={!validation.ok ? validation.reason : undefined}
              className="btn-primary flex-1"
            >
              {saving ? "جارٍ الحفظ..." : "حفظ"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="btn-secondary"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ContactField({
  id,
  label,
  value,
  onChange,
  error,
  required = false,
  type = "text",
  maxLength,
  inputMode,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  type?: "text" | "email";
  maxLength: number;
  inputMode?: "text" | "tel" | "email";
  autoComplete?: string;
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="form-label">{label}</span>
      <input
        id={id}
        className="form-input"
        type={type}
        required={required}
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && (
        <span
          id={`${id}-error`}
          className="mt-1 block text-xs font-semibold text-rose-600"
        >
          {error}
        </span>
      )}
    </label>
  );
}
