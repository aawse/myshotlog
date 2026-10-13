import type { Metadata } from "next";
import { WitnessSigning } from "@/components/witness-signing";
import { LanguageProvider } from "@/components/language-provider";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function Page() {
  return (
    <LanguageProvider language="sv">
      <WitnessSigning />
    </LanguageProvider>
  );
}
