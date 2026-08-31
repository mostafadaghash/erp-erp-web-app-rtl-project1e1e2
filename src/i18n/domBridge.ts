import {
  containsArabic,
  getDirection,
  getLocale,
  hasLegacyTranslation,
  translateLegacyText,
  type Language,
} from "./catalog";

const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string | null>>();
const originalDirections = new WeakMap<HTMLElement, string | null>();
const originalLanguages = new WeakMap<HTMLElement, string | null>();

const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"] as const;
const UI_CONTEXT_SELECTOR = [
  "button",
  "label",
  "th",
  "option",
  "summary",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "nav",
  "aside",
  "header",
  "footer",
  "[role='menuitem']",
  "[role='tab']",
  "[role='dialog']",
  "[role='alert']",
  "[role='status']",
  "[data-testid='settings-page']",
  "[class*='toast']",
  "[class*='badge']",
  "[class*='filter']",
  "[class*='dropdown']",
  "[class*='menu']",
  "[class*='toolbar']",
].join(",");

const SKIP_SELECTOR = [
  "script",
  "style",
  "code",
  "pre",
  "svg",
  "canvas",
  "textarea",
  "[contenteditable='true']",
  "[data-i18n-skip]",
  "[data-user-content]",
].join(",");

function attributeStore(element: Element): Map<string, string | null> {
  let store = originalAttributes.get(element);
  if (!store) {
    store = new Map();
    originalAttributes.set(element, store);
  }
  return store;
}

function isLikelyUiContext(element: Element): boolean {
  if (element.matches(SKIP_SELECTOR) || element.closest(SKIP_SELECTOR)) return false;
  if (element.matches(UI_CONTEXT_SELECTOR) || element.closest(UI_CONTEXT_SELECTOR)) return true;
  if (element.closest("tbody td")) return false;
  if (element.matches("p,span,div,li,dt,dd")) {
    const className = typeof element.className === "string" ? element.className : "";
    return /(title|heading|label|caption|hint|help|empty|status|summary|metric|stat|section|modal|dialog|panel|card|form)/i.test(className);
  }
  return false;
}

function translateTextNode(node: Text, language: Language): void {
  const parent = node.parentElement;
  if (!parent || parent.closest(SKIP_SELECTOR)) return;

  const current = node.nodeValue ?? "";
  if (language === "ar") {
    const stored = originalText.get(node);
    if (stored !== undefined && current !== stored) node.nodeValue = stored;
    return;
  }

  if (containsArabic(current)) originalText.set(node, current);
  const source = originalText.get(node) ?? current;
  if (!containsArabic(source)) return;

  const exact = hasLegacyTranslation(source);
  const uiContext = isLikelyUiContext(parent);
  if (!exact && !uiContext) return;

  const translated = translateLegacyText(source, "en", {
    fallbackToTransliteration: uiContext,
  });
  if (translated !== current) node.nodeValue = translated;
}

function translateAttribute(element: Element, attribute: string, language: Language): void {
  const store = attributeStore(element);
  const current = element.getAttribute(attribute);

  if (language === "ar") {
    if (store.has(attribute)) {
      const stored = store.get(attribute);
      if (stored === null) element.removeAttribute(attribute);
      else if (current !== stored) element.setAttribute(attribute, stored);
    }
    return;
  }

  if (current && containsArabic(current)) store.set(attribute, current);
  const source = store.get(attribute) ?? current;
  if (!source || !containsArabic(source)) return;

  const translated = translateLegacyText(source, "en", {
    fallbackToTransliteration: true,
  });
  if (translated !== current) element.setAttribute(attribute, translated);
}

function syncElementDirection(element: HTMLElement, language: Language): void {
  if (element.hasAttribute("data-i18n-fixed-dir")) return;
  const current = element.getAttribute("dir");

  if (language === "ar") {
    if (originalDirections.has(element)) {
      const stored = originalDirections.get(element);
      if (stored === null) element.removeAttribute("dir");
      else element.setAttribute("dir", stored);
    }
    return;
  }

  if (!originalDirections.has(element)) originalDirections.set(element, current);
  if (current === "rtl") element.setAttribute("dir", "ltr");
}

function syncElementLanguage(element: HTMLElement, language: Language): void {
  const current = element.getAttribute("lang");
  if (language === "ar") {
    if (originalLanguages.has(element)) {
      const stored = originalLanguages.get(element);
      if (stored === null) element.removeAttribute("lang");
      else element.setAttribute("lang", stored);
    }
    return;
  }

  if (!originalLanguages.has(element)) originalLanguages.set(element, current);
  if (current?.toLowerCase().startsWith("ar")) element.setAttribute("lang", "en");
}

function processElement(element: Element, language: Language): void {
  for (const attribute of TRANSLATABLE_ATTRIBUTES) {
    if (element.hasAttribute(attribute) || attributeStore(element).has(attribute)) {
      translateAttribute(element, attribute, language);
    }
  }

  if (element instanceof HTMLElement) {
    if (element.hasAttribute("dir") || originalDirections.has(element)) syncElementDirection(element, language);
    if (element.hasAttribute("lang") || originalLanguages.has(element)) syncElementLanguage(element, language);
  }

  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) translateTextNode(child as Text, language);
  }
}

export function translateDomTree(root: ParentNode, language: Language): void {
  if (root instanceof Element) processElement(root, language);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text, language);
    else if (node instanceof Element) processElement(node, language);
    node = walker.nextNode();
  }
}

export function syncDocumentLocale(language: Language): void {
  const direction = getDirection(language);
  const locale = getLocale(language);
  document.documentElement.lang = language;
  document.documentElement.dir = direction;
  document.documentElement.dataset.language = language;
  document.documentElement.dataset.locale = locale;
  if (document.body) {
    document.body.dir = direction;
    document.body.dataset.language = language;
  }
}

export function installLegacyTranslationBridge(language: Language): () => void {
  syncDocumentLocale(language);
  translateDomTree(document.body, language);

  let applying = false;
  const observer = new MutationObserver((mutations) => {
    if (applying) return;
    applying = true;
    queueMicrotask(() => {
      try {
        for (const mutation of mutations) {
          if (mutation.type === "characterData" && mutation.target instanceof Text) {
            translateTextNode(mutation.target, language);
            continue;
          }
          if (mutation.type === "attributes" && mutation.target instanceof Element) {
            if (mutation.attributeName && TRANSLATABLE_ATTRIBUTES.includes(mutation.attributeName as typeof TRANSLATABLE_ATTRIBUTES[number])) {
              translateAttribute(mutation.target, mutation.attributeName, language);
            } else if (mutation.target instanceof HTMLElement && mutation.attributeName === "dir") {
              syncElementDirection(mutation.target, language);
            }
            continue;
          }
          for (const added of Array.from(mutation.addedNodes)) {
            if (added instanceof Text) translateTextNode(added, language);
            else if (added instanceof Element) translateDomTree(added, language);
          }
        }
      } finally {
        applying = false;
      }
    });
  });

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...TRANSLATABLE_ATTRIBUTES, "dir"],
  });

  return () => observer.disconnect();
}
