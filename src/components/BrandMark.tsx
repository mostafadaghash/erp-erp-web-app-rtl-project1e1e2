import { Blocks } from "lucide-react";

interface BrandMarkProps {
  name: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  size?: "sm" | "md" | "lg";
  inverse?: boolean;
}

const sizes = {
  sm: "h-9 w-9 rounded-xl",
  md: "h-11 w-11 rounded-2xl",
  lg: "h-20 w-20 rounded-3xl",
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
  const className = `${sizes[size]} flex shrink-0 items-center justify-center overflow-hidden shadow-lg`;
  if (logoUrl) {
    return (
      <div className={`${className} ${inverse ? "bg-white/10" : "bg-white"}`}>
        <img src={logoUrl} alt={`شعار ${name}`} className="h-full w-full object-contain p-1.5" />
      </div>
    );
  }

  return (
    <div
      className={className}
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
