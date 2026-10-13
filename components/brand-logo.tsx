import { swText } from "@/lib/i18n";
import Image from "next/image";

export function BrandLogo() {
  return (
    <Image
      className="brand-logo"
      src="/brand/MyShotLog-logo.svg"
      alt={swText("brand.name")}
      width={761}
      height={256}
      unoptimized
      loading="eager"
    />
  );
}
