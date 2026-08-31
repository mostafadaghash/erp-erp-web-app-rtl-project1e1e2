import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_META,
  LANGUAGE_STORAGE_KEY,
  getDirection,
  getLocale,
  isLanguage,
  translateKey,
  type Direction,
  type Language,
  type TranslationKey,
} from "./catalog";
import { installLegacyTranslationBridge, syncDocumentLocale } from "./domBridge";
import "./i18n.css";

type TranslateParams = Record<string, string | number>;

interface I18nContextValue {
  language: Language;
  direction: Direction;
  locale: string;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, params?: TranslateParams) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLanguage(): Language {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function interpolate(value: string, params?: TranslateParams): string {
  if (!params) return value;
  return value.replace(/\{([\w.-]+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  const setLanguage = useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    } catch {
      // The language still changes for the current session if storage is unavailable.
    }
  }, []);

  useEffect(() => {
    syncDocumentLocale(language);
    const uninstallBridge = installLegacyTranslationBridge(language);
    window.dispatchEvent(new CustomEvent("erp-language-change", { detail: { language } }));
    return uninstallBridge;
  }, [language]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LANGUAGE_STORAGE_KEY || !isLanguage(event.newValue)) return;
      setLanguageState(event.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const direction = getDirection(language);
  const locale = getLocale(language);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    direction,
    locale,
    setLanguage,
    t: (key, params) => interpolate(translateKey(language, key), params),
    formatNumber: (number, options) => new Intl.NumberFormat(locale, {
      numberingSystem: "latn",
      ...options,
    }).format(number),
    formatDate: (input, options) => {
      const date = input instanceof Date ? input : new Date(input);
      return new Intl.DateTimeFormat(locale, options).format(date);
    },
  }), [direction, language, locale, setLanguage]);

  return (
    <I18nContext.Provider value={value}>
      {children}
      <SettingsLanguagePortal />
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

export function LanguageSelect({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, t } = useI18n();
  return (
    <label className={compact ? "i18n-language-select i18n-language-select--compact" : "i18n-language-select"}>
      {!compact && <span>{t("settings.interfaceLanguage")}</span>}
      <select
        data-testid={compact ? "language-quick-switch" : "language-setting-select"}
        aria-label={t("settings.interfaceLanguage")}
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
      >
        <option value="ar">{LANGUAGE_META.ar.nativeLabel}</option>
        <option value="en">{LANGUAGE_META.en.nativeLabel}</option>
      </select>
    </label>
  );
}

function SettingsLanguagePortal() {
  const { language, direction, t } = useI18n();
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const resolveHost = () => {
      const settingsPage = document.querySelector<HTMLElement>("[data-testid='settings-page']");
      if (!settingsPage) {
        setHost((current) => current?.isConnected ? current : null);
        return;
      }

      let nextHost = settingsPage.querySelector<HTMLElement>("[data-i18n-language-settings-host]");
      if (!nextHost) {
        nextHost = document.createElement("section");
        nextHost.dataset.i18nLanguageSettingsHost = "true";
        nextHost.className = "settings-section i18n-settings-language-card";
        const firstChild = settingsPage.children.item(0);
        if (firstChild?.nextSibling) settingsPage.insertBefore(nextHost, firstChild.nextSibling);
        else settingsPage.appendChild(nextHost);
      }
      setHost((current) => current === nextHost ? current : nextHost);
    };

    resolveHost();
    const observer = new MutationObserver(resolveHost);
    observer.observe(document.body, { subtree: true, childList: true });
    return () => observer.disconnect();
  }, []);

  if (!host?.isConnected) return null;

  return createPortal(
    <div className="i18n-settings-language-content" dir={direction} data-language={language}>
      <div>
        <h2>{t("settings.languageTitle")}</h2>
        <p>{t("settings.languageDescription")}</p>
      </div>
      <LanguageSelect />
    </div>,
    host,
  );
}

export function getInitialLanguage(): Language {
  return readStoredLanguage();
}
