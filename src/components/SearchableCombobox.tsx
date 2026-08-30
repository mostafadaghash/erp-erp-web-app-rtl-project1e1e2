import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export type SearchableComboboxOption = {
  value: string;
  label: string;
  description?: string;
  searchText?: string;
  disabled?: boolean;
};

function normalizeSearch(value: string) {
  return value
    .toLocaleLowerCase("ar-EG")
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

export function SearchableCombobox({
  value,
  onChange,
  options,
  placeholder = "اكتب للبحث...",
  emptyText = "لا توجد نتائج",
  disabled = false,
  allowClear = true,
  className = "",
  testId,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchableComboboxOption[];
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
  testId?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const needle = normalizeSearch(query);
    if (!needle) return options;
    return options.filter((option) => normalizeSearch(`${option.label} ${option.description ?? ""} ${option.searchText ?? ""}`).includes(needle));
  }, [options, query]);

  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, []);

  useEffect(() => setActiveIndex(0), [query]);

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
    window.setTimeout(() => inputRef.current?.blur(), 0);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`} data-testid={testId}>
      <div className={`flex min-h-10 items-center rounded-lg border bg-white transition ${open ? "border-emerald-500 ring-2 ring-emerald-500/10" : "border-slate-300"} ${disabled ? "bg-slate-100 opacity-70" : ""}`}>
        <Search className="mr-3 h-4 w-4 shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          disabled={disabled}
          value={open ? query : selected?.label ?? ""}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400"
          onFocus={() => { setOpen(true); setQuery(""); }}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onKeyDown={(event) => {
            if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
              event.preventDefault();
              setOpen(true);
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) => Math.min(filtered.length - 1, current + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => Math.max(0, current - 1));
            } else if (event.key === "Enter" && filtered[activeIndex] && !filtered[activeIndex].disabled) {
              event.preventDefault();
              choose(filtered[activeIndex].value);
            } else if (event.key === "Escape") {
              setOpen(false);
              setQuery("");
              inputRef.current?.blur();
            }
          }}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        {allowClear && value && !disabled && (
          <button type="button" onClick={() => choose("")} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="مسح الاختيار">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <button type="button" disabled={disabled} onClick={() => { setOpen((current) => !current); setQuery(""); inputRef.current?.focus(); }} className="grid h-8 w-8 place-items-center text-slate-400" aria-label="فتح القائمة">
          <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && !disabled && (
        <div className="absolute z-[180] mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl">
          {filtered.length === 0 ? (
            <div className="px-3 py-5 text-center text-sm text-slate-400">{emptyText}</div>
          ) : filtered.map((option, index) => (
            <button
              type="button"
              key={option.value}
              disabled={option.disabled}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option.value)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-right transition ${index === activeIndex ? "bg-emerald-50" : "hover:bg-slate-50"} ${option.disabled ? "cursor-not-allowed opacity-40" : ""}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-800">{option.label}</span>
                {option.description && <span className="mt-0.5 block truncate text-xs text-slate-500">{option.description}</span>}
              </span>
              {option.value === value && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
