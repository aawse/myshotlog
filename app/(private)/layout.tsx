import { UpdateProvider } from "@/components/update-provider";
import { UpdateNotice } from "@/components/app-updates";
import { getI18n } from "@/lib/i18n-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { configured, currentUser } from "@/lib/auth/server";
import { signOut } from "@/app/auth/actions";
import {
  LayoutDashboard,
  Zap,
  NotebookPen,
  Target,
  Settings,
  ShieldCheck,
} from "lucide-react";
export const dynamic = "force-dynamic";
export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!configured()) redirect("/setup/");
  const user = await currentUser();
  if (!user) redirect("/login/");
  const { tr } = await getI18n();
  return (
    <UpdateProvider>
      <div className="shell">
        <aside className="sidebar">
          <Link href="/dashboard/" className="brand">
            <BrandLogo />
          </Link>
          <div className="nav-caption">{tr("nav.caption")}</div>
          <nav>
            <Link href="/quick/">
              <Zap size={19} /> {tr("nav.quick")}
            </Link>
            <Link href="/dashboard/">
              <LayoutDashboard size={19} /> {tr("nav.dashboard")}
            </Link>
            <Link href="/sessions/">
              <NotebookPen size={19} /> {tr("nav.sessions")}
            </Link>
            <Link href="/firearms/">
              <Target size={19} /> {tr("nav.firearms")}
            </Link>
            <Link href="/qualifications/">
              <ShieldCheck size={19} /> {tr("nav.qualifications")}
            </Link>
            <Link href="/settings/">
              <Settings size={19} /> {tr("nav.settings")}
            </Link>
          </nav>
          <div className="sidebar-bottom">
            <span className="private-tag">{tr("nav.private")}</span>
            <p>{tr("nav.motto")}</p>
            <form action={signOut}>
              <button className="text-button">{tr("nav.signOut")}</button>
            </form>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <span>{tr("nav.sport")}</span>
            <span className="private-tag">
              <ShieldCheck size={14} /> {tr("nav.onlyYou")}
            </span>
          </header>
          <main className="content">
            <UpdateNotice />
            {children}
          </main>
          <footer>{tr("nav.footer")}</footer>
        </div>
      </div>
    </UpdateProvider>
  );
}
