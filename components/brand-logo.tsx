import { swText } from "@/lib/i18n";
import { RedesignIcon } from "./redesign-icon";

export function BrandLogo() {
  return (
    <span className="brand-lockup">
      <RedesignIcon name="target" />
      {swText("brand.name")}
    </span>
  );
}
