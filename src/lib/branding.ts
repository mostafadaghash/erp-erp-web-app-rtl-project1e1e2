import { useEffect } from "react";

export const DEFAULT_BRAND = {
  storeName: "DAGHASH ERP",
  shortName: "DAGHASH",
  tagline: "إدارة أعمالك بوضوح",
  primaryColor: "#4f46e5",
  secondaryColor: "#7c3aed",
} as const;

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

export function useBrandingTheme(settings?: BrandingSettings | null) {
  const brand = getBrand(settings);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--brand-primary", brand.primaryColor);
    root.style.setProperty("--brand-secondary", brand.secondaryColor);
    document.title = `${brand.storeName} | ${brand.tagline}`;

    let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (brand.faviconUrl) {
      if (!favicon) {
        favicon = document.createElement("link");
        favicon.rel = "icon";
        favicon.dataset.dynamicBrandFavicon = "true";
        document.head.appendChild(favicon);
      }
      favicon.href = brand.faviconUrl;
    } else if (favicon?.dataset.dynamicBrandFavicon === "true") {
      favicon.remove();
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
