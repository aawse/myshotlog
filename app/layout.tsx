import { connection } from "next/server";
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "MyShotLog · Din träningsjournal",
  applicationName: "MyShotLog",
  description: "Privat träningsjournal för nationellt pistolskytte.",
  icons: {
    icon: { url: "/brand/MyShotLog-icon.svg", type: "image/svg+xml" },
    apple: "/brand/MyShotLog-icon.png",
  },
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
