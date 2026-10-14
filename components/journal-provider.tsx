"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useSyncExternalStore,
} from "react";
import { BrowserJournal } from "@/lib/sync/controller";
import { IndexedBrowserStorage } from "@/lib/sync/storage";
import { useI18n } from "./language-provider";
import { installJournal } from "./mutate";
const Context = createContext<BrowserJournal | null>(null);
export function JournalProvider({
  scope,
  children,
}: {
  scope: string;
  children: React.ReactNode;
}) {
  const [journal] = useState(
    () => new BrowserJournal(scope, new IndexedBrowserStorage()),
  );
  const lifecycle = useRef(0);
  useEffect(() => {
    const generation = ++lifecycle.current;
    const uninstall = installJournal(journal);
    void journal.start();
    const reconnect = () => {
      if (!document.hidden) void journal.sync();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (journal.getSnapshot().state.pending.length) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("online", reconnect);
    window.addEventListener("focus", reconnect);
    document.addEventListener("visibilitychange", reconnect);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      uninstall();
      queueMicrotask(() => {
        if (lifecycle.current === generation) journal.dispose();
      });
      window.removeEventListener("online", reconnect);
      window.removeEventListener("focus", reconnect);
      document.removeEventListener("visibilitychange", reconnect);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [journal]);
  return (
    <Context.Provider value={journal}>
      <JournalLanguage />
      {children}
    </Context.Provider>
  );
}
function JournalLanguage() {
  const { records } = useJournalState(),
    { setLanguage } = useI18n(),
    journal = useJournal();
  const language = records?.profile.language;
  useEffect(() => {
    if (!language || !journal) return;
    setLanguage(language);
    document.cookie =
      "myshotlog_language=" +
      journal.scope +
      "." +
      language +
      "; Path=/; SameSite=Lax; Max-Age=31536000" +
      (location.protocol === "https:" ? "; Secure" : "");
  }, [language, setLanguage, journal]);
  return null;
}
export function useJournal() {
  return useContext(Context);
}
export function useJournalState() {
  const journal = useJournal();
  if (!journal) throw new Error("JournalProvider required");
  return useSyncExternalStore(
    journal.subscribe,
    journal.getSnapshot,
    journal.getSnapshot,
  );
}
export function useRecords() {
  const { records } = useJournalState();
  if (!records) throw new Error("Journal not ready");
  return records;
}
