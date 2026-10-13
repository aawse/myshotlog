import { LanguageProvider } from "@/components/language-provider";
import { getI18n } from "@/lib/i18n-server";
import { PerformanceInsights } from "@/components/performance-insights";
import { Analytics } from "@vercel/analytics/next";
import { connection } from "next/server";
import type { Metadata } from "next";
import "./globals.css";
export async function generateMetadata(): Promise<Metadata> {
  const { tr } = await getI18n();
  return {
    title: tr("site.title"),
    applicationName: "MyShotLog",
    description: tr("site.description"),
    icons: {
      icon: { url: "/brand/MyShotLog-icon.svg", type: "image/svg+xml" },
      apple: "/brand/MyShotLog-icon.png",
    },
  };
}
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const { language } = await getI18n();
  return (
    <html lang={language}>
      <body>
        <LanguageProvider language={language}>
          {children}
          <Analytics />
          {process.env.VERCEL === "1" && <PerformanceInsights />}
        </LanguageProvider>
      </body>
    </html>
  );
}
