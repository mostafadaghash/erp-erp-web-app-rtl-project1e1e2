import { useEffect } from "react";

export const DEFAULT_BRAND = {
  storeName: "DAGHASH ERP",
  shortName: "DAGHASH",
  tagline: "إدارة أعمالك بوضوح",
  primaryColor: "#16a66a",
  secondaryColor: "#12263a",
} as const;

export const DEFAULT_FAVICON_PATH = "/favicon.svg";

export interface BrandingSettings {
  storeName?: string;
  shortName?: string;
  tagline?: string;
  legalName?: string;
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  invoiceFooter?: string;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function getBrand(settings?: BrandingSettings | null) {
  return {
    storeName: settings?.storeName?.trim() || DEFAULT_BRAND.storeName,
    shortName: settings?.shortName?.trim() || settings?.storeName?.trim() || DEFAULT_BRAND.shortName,
    tagline: settings?.tagline?.trim() || DEFAULT_BRAND.tagline,
    legalName: settings?.legalName?.trim() || undefined,
    primaryColor: HEX_COLOR.test(settings?.primaryColor ?? "")
      ? settings!.primaryColor!
      : DEFAULT_BRAND.primaryColor,
    secondaryColor: HEX_COLOR.test(settings?.secondaryColor ?? "")
      ? settings!.secondaryColor!
      : DEFAULT_BRAND.secondaryColor,
    logoUrl: settings?.logoUrl || undefined,
    faviconUrl: settings?.faviconUrl || undefined,
    invoiceFooter: settings?.invoiceFooter?.trim() || undefined,
  };
}

function resolveFaviconLink() {
  let favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"][data-brand-favicon], link[rel~="icon"]');
  if (!favicon) {
    favicon = document.createElement("link");
    favicon.rel = "icon";
    document.head.appendChild(favicon);
  }
  favicon.dataset.brandFavicon = "true";
  return favicon;
}

export function useBrandingTheme(settings?: BrandingSettings | null) {
  const brand = getBrand(settings);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--brand-primary", brand.primaryColor);
    root.style.setProperty("--brand-secondary", brand.secondaryColor);
    document.title = `${brand.storeName} | ${brand.tagline}`;

    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    themeColor?.setAttribute("content", brand.secondaryColor);

    const favicon = resolveFaviconLink();
    if (brand.faviconUrl) {
      favicon.href = brand.faviconUrl;
      favicon.removeAttribute("type");
      favicon.removeAttribute("sizes");
    } else {
      favicon.href = DEFAULT_FAVICON_PATH;
      favicon.type = "image/svg+xml";
      favicon.setAttribute("sizes", "any");
    }
  }, [
    brand.faviconUrl,
    brand.primaryColor,
    brand.secondaryColor,
    brand.storeName,
    brand.tagline,
  ]);

  return brand;
}
