import { Blocks } from "lucide-react";

interface BrandMarkProps {
  name: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  size?: "sm" | "md" | "lg";
  inverse?: boolean;
}

const fallbackSizes = {
  sm: "h-9 w-9 rounded-xl",
  md: "h-11 w-11 rounded-2xl",
  lg: "h-20 w-20 rounded-3xl",
};

const logoSizes = {
  sm: "h-9 min-w-9 max-w-[6.5rem] rounded-xl px-1.5 py-1",
  md: "h-11 min-w-11 max-w-[9rem] rounded-2xl px-2 py-1.5",
  lg: "h-20 min-w-20 max-w-[15rem] rounded-3xl px-3 py-2",
};

const iconSizes = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-9 w-9",
};

export function BrandMark({
  name,
  logoUrl,
  primaryColor,
  secondaryColor,
  size = "md",
  inverse = false,
}: BrandMarkProps) {
  if (logoUrl) {
    return (
      <div
        data-brand-mark="logo"
        className={`${logoSizes[size]} inline-flex w-fit shrink-0 items-center justify-center overflow-hidden ${
          inverse ? "bg-white/10" : "bg-white"
        }`}
      >
        <img
          src={logoUrl}
          alt={`شعار ${name}`}
          data-brand-logo
          className="block h-auto w-auto max-h-full max-w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div
      data-brand-mark="fallback"
      className={`${fallbackSizes[size]} flex shrink-0 items-center justify-center overflow-hidden shadow-lg`}
      style={{
        background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
        boxShadow: `0 14px 30px color-mix(in srgb, ${primaryColor} 28%, transparent)`,
      }}
      aria-label={`هوية ${name}`}
    >
      <Blocks className={`${iconSizes[size]} text-white`} strokeWidth={2.2} />
    </div>
  );
}
