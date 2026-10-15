"use client";
import { UpdateProvider } from "./update-provider";
import { UpdateNotice } from "./app-updates";
import { useI18n } from "./language-provider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "./brand-logo";
import { signOut } from "@/app/auth/actions";
import {
  LayoutDashboard,
  Zap,
  NotebookPen,
  Target,
  Settings,
  ShieldCheck,
  BookOpen,
} from "lucide-react";
import { SyncStatus } from "./sync-status";
import { JournalScreens } from "./journal-screens";
import { navigateJournal } from "./journal-navigation";
import { useJournalState } from "./journal-provider";
export function PrivateShell({ children }: { children: React.ReactNode }) {
  const { tr } = useI18n();
  const { state } = useJournalState();
  const path = (usePathname() ?? "").replace(/\/$/, "");
  const current = (section: string) =>
    path === section
      ? ("page" as const)
      : path.startsWith(section + "/")
        ? ("location" as const)
        : undefined;
  return (
    <UpdateProvider>
      <div
        className="shell"
        onClickCapture={(event) => {
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          const anchor = (event.target as Element).closest("a");
          if (!anchor || anchor.target || anchor.hasAttribute("download"))
            return;
          if (navigateJournal(anchor.href)) event.preventDefault();
        }}
        onSubmitCapture={(event) => {
          const form = event.target as HTMLFormElement;
          if (form.classList.contains("filters")) {
            const query = new URLSearchParams();
            new FormData(form).forEach((value, key) => {
              if (typeof value === "string") query.set(key, value);
            });
            if (navigateJournal("/qualifications/?" + query))
              event.preventDefault();
          }
        }}
      >
        <aside className="sidebar">
          <Link href="/dashboard/" className="brand">
            <BrandLogo />
          </Link>
          <div className="nav-caption">{tr("nav.caption")}</div>
          <nav>
            <Link href="/quick/" aria-current={current("/quick")}>
              <Zap size={19} /> {tr("nav.quick")}
            </Link>
            <Link href="/dashboard/" aria-current={current("/dashboard")}>
              <LayoutDashboard size={19} /> {tr("nav.dashboard")}
            </Link>
            <Link href="/sessions/" aria-current={current("/sessions")}>
              <NotebookPen size={19} /> {tr("nav.sessions")}
            </Link>
            <Link href="/firearms/" aria-current={current("/firearms")}>
              <Target size={19} /> {tr("nav.firearms")}
            </Link>
            <Link
              href="/qualifications/"
              aria-current={current("/qualifications")}
            >
              <ShieldCheck size={19} /> {tr("nav.qualifications")}
            </Link>
            <Link href="/training/" aria-current={current("/training")}>
              <BookOpen size={19} /> {tr("training.title")}
            </Link>
            <Link href="/settings/" aria-current={current("/settings")}>
              <Settings size={19} /> {tr("nav.settings")}
            </Link>
          </nav>
          <div className="sidebar-bottom">
            <span className="private-tag">{tr("nav.private")}</span>
            <p>{tr("nav.motto")}</p>
            <form
              action={signOut}
              onSubmit={(event) => {
                if (
                  state.pending.length &&
                  !window.confirm(tr("sync.leavePending"))
                )
                  event.preventDefault();
              }}
            >
              <button className="text-button">{tr("nav.signOut")}</button>
            </form>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <span>{tr("nav.caption")}</span>
            <span className="private-tag">
              <ShieldCheck size={14} /> {tr("nav.onlyYou")}
            </span>
          </header>
          <main className="content">
            <UpdateNotice />
            <SyncStatus />
            <JournalScreens fallback={children} />
          </main>
          <footer>{tr("nav.footer")}</footer>
        </div>
      </div>
    </UpdateProvider>
  );
}
