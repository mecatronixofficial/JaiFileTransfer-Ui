import Image from "next/image";
import logo from "../../../public/logo/jai-logo.png";

type BrandLogoProps = {
  className?: string;
  decorative?: boolean;
};

export default function BrandLogo({ className = "h-12 w-12", decorative = false }: BrandLogoProps) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm ${className}`}>
      <Image
        src={logo}
        alt={decorative ? "" : "Jai Export Enterprises"}
        className="h-auto max-h-full w-full object-contain"
      />
    </span>
  );
}
