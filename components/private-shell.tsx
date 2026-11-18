"use client";
import { UpdateProvider } from "./update-provider";
import { UpdateNotice } from "./app-updates";
import { useI18n } from "./language-provider";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BrandLogo } from "./brand-logo";
import { RedesignIcon } from "./redesign-icon";
import { signOut } from "@/app/auth/actions";
import { ShieldCheck } from "lucide-react";
import { JournalTools } from "./journal-tools";
import { JournalScreens } from "./journal-screens";
import { navigateJournal } from "./journal-navigation";
import { useJournalState } from "./journal-provider";
export function PrivateShell({ children }: { children: React.ReactNode }) {
  const { tr } = useI18n();
  const { state } = useJournalState();
  const path = (usePathname() ?? "").replace(/\/$/, "");
  const search = useSearchParams();
  const progress = path === "/dashboard" && search?.get("view") === "progress";
  const current = (section: string) =>
    path === section
      ? ("page" as const)
      : path.startsWith(section + "/")
        ? ("location" as const)
        : undefined;
  const mainLinks = (
    <>
      <Link
        href="/dashboard/"
        aria-current={progress ? undefined : current("/dashboard")}
      >
        <RedesignIcon name="journal" /> {tr("nav.dashboard")}
      </Link>
      <Link href="/sessions/" aria-current={current("/sessions")}>
        <RedesignIcon name="sessions" /> {tr("nav.sessions")}
      </Link>
      <Link
        className="desktop-quick-link"
        href="/quick/"
        aria-current={current("/quick")}
      >
        <RedesignIcon name="plus" /> {tr("nav.quick")}
      </Link>
      <Link
        href="/dashboard/?view=progress"
        aria-current={progress ? "page" : undefined}
      >
        <RedesignIcon name="progress" /> {tr("nav.progress")}
      </Link>
    </>
  );
  const extraLinks = (
    <>
      <Link
        className="mobile-quick-link"
        href="/quick/"
        aria-current={current("/quick")}
      >
        {tr("nav.quick")}
      </Link>
      <Link href="/firearms/" aria-current={current("/firearms")}>
        <RedesignIcon name="equipment" /> {tr("nav.firearms")}
      </Link>
      <Link href="/qualifications/" aria-current={current("/qualifications")}>
        {tr("nav.qualifications")}
      </Link>
      <Link href="/training/" aria-current={current("/training")}>
        <RedesignIcon name="rules" /> {tr("training.title")}
      </Link>
      <Link href="/settings/" aria-current={current("/settings")}>
        <RedesignIcon name="settings" /> {tr("nav.settings")}
      </Link>
    </>
  );
  const signOutForm = (
    <form
      action={signOut}
      onSubmit={(event) => {
        if (state.pending.length && !window.confirm(tr("sync.leavePending")))
          event.preventDefault();
      }}
    >
      <button className="text-button">{tr("nav.signOut")}</button>
    </form>
  );
  return (
    <UpdateProvider>
      <div className="private-app">
        <div
          className="shell"
          role="region"
          aria-label={tr("nav.caption")}
          tabIndex={0}
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
          <header className="topbar journal-topbar">
            <Link href="/dashboard/" className="brand">
              <BrandLogo />
            </Link>
            <span className="private-tag">
              <ShieldCheck size={14} /> {tr("nav.onlyYou")}
            </span>
          </header>
          <aside className="sidebar">
            <nav aria-label={tr("nav.caption")}>
              {mainLinks}
              {extraLinks}
            </nav>
            <div className="sidebar-bottom">
              <span className="private-tag">{tr("nav.private")}</span>
              <p>{tr("nav.motto")}</p>
              {signOutForm}
            </div>
          </aside>
          <div className="workspace">
            <main className="content">
              <UpdateNotice />
              <JournalScreens fallback={children} />
            </main>
            <footer>{tr("nav.footer")}</footer>
          </div>
          <nav className="mobile-journal-nav" aria-label={tr("nav.caption")}>
            {mainLinks}
            <details key={path + String(progress)}>
              <summary>
                <RedesignIcon name="more" /> {tr("nav.more")}
              </summary>
              <div
                className="mobile-journal-menu"
                onClick={(event) => {
                  if ((event.target as Element).closest("a"))
                    event.currentTarget
                      .closest("details")
                      ?.removeAttribute("open");
                }}
              >
                {extraLinks}
                {signOutForm}
              </div>
            </details>
          </nav>
        </div>
        <JournalTools />
      </div>
    </UpdateProvider>
  );
}
