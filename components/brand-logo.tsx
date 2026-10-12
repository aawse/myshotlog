import Image from "next/image";

export function BrandLogo() {
  return (
    <Image
      className="brand-logo"
      src="/brand/MyShotLog-logo.svg"
      alt="MyShotLog"
      width={678}
      height={256}
      unoptimized
      loading="eager"
    />
  );
}
