import { QuickIssueReport } from "@/components/quick-issue-report";
import { LanguageProvider } from "@/components/language-provider";
import { getI18n } from "@/lib/i18n-server";
import { AppTelemetry } from "@/components/app-telemetry";
import { connection } from "next/server";
import localFont from "next/font/local";
import type { Metadata } from "next";
import "./globals.css";
const didactGothic = localFont({
  src: "../lib/fonts/DidactGothic-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  variable: "--font-didact-gothic",
});
export async function generateMetadata(): Promise<Metadata> {
  const { tr } = await getI18n();
  return {
    title: tr("site.title"),
    applicationName: "MyShotLog",
    robots: { index: false, follow: false, nocache: true },
    description: tr("site.description"),
    icons: {
      icon: {
        url: "/brand/MyShotLog-icon.svg",
        type: "image/svg+xml",
        sizes: "any",
      },
      apple: {
        url: "/brand/MyShotLog-apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
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
    <html lang={language} className={didactGothic.variable}>
      <body>
        <LanguageProvider language={language}>
          {children}
          <QuickIssueReport />
          <AppTelemetry speedEnabled={process.env.VERCEL === "1"} />
        </LanguageProvider>
      </body>
    </html>
  );
}
