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
  if (!configured()) redirect("/setup");
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand">
          <BrandLogo />
        </Link>
        <div className="nav-caption">DIN TRÄNINGSJOURNAL</div>
        <nav>
          <Link href="/quick">
            <Zap size={19} /> Snabbserie
          </Link>
          <Link href="/dashboard">
            <LayoutDashboard size={19} /> Översikt
          </Link>
          <Link href="/sessions">
            <NotebookPen size={19} /> Träningspass
          </Link>
          <Link href="/firearms">
            <Target size={19} /> Mina vapen
          </Link>
          <Link href="/qualifications">
            <ShieldCheck size={19} /> Märkesprogress
          </Link>
          <Link href="/settings">
            <Settings size={19} /> Inställningar
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <span className="private-tag">● Privat journal</span>
          <p>Din träning. Din utveckling.</p>
          <form action={signOut}>
            <button className="text-button">Logga ut →</button>
          </form>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>Nationellt pistolskytte</span>
          <span className="private-tag">
            <ShieldCheck size={14} /> Bara för dig
          </span>
        </header>
        <main className="content">{children}</main>
        <footer>MyShotLog · Personlig journal. Inget officiellt intyg.</footer>
      </div>
    </div>
  );
}
