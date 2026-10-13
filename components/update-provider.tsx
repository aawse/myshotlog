"use client";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { UpdateStatus } from "@/lib/updates/model";
import type { MessageKey } from "@/lib/i18n";
const errorKeys: Record<string, MessageKey> = {
  configuration: "updates.configuration",
  forbidden: "updates.forbidden",
  permissions: "updates.permissions",
  conflict: "updates.conflict",
  changed: "updates.changed",
  rateLimited: "updates.rateLimited",
  signIn: "api.signIn",
  invalidData: "api.invalidData",
};
const Context = createContext<{
  status?: UpdateStatus;
  error?: MessageKey;
  checking: boolean;
  syncing: boolean;
  synced: boolean;
  ready: boolean;
  refresh: () => Promise<void>;
  sync: () => Promise<void>;
}>({
  checking: true,
  syncing: false,
  synced: false,
  ready: false,
  refresh: async () => {},
  sync: async () => {},
});
const validErrors = new Set<MessageKey>([
  ...Object.values(errorKeys),
  "updates.unavailable",
]);
function errorKey(error: unknown): MessageKey {
  const key =
    error instanceof Error
      ? (error.message as MessageKey)
      : "updates.unavailable";
  return validErrors.has(key) ? key : "updates.unavailable";
}
async function jsonResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(errorKeys[data.error] ?? "updates.unavailable");
  return data;
}
export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<UpdateStatus>(),
    [error, setError] = useState<MessageKey>(),
    [checking, setChecking] = useState(true),
    [syncing, setSyncing] = useState(false),
    [synced, setSynced] = useState(false),
    [ready, setReady] = useState(false);
  const initialSha = useRef<string>(undefined),
    sequence = useRef(0),
    busy = useRef(false);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    setChecking(true);
    setError(undefined);
    try {
      const data: UpdateStatus = await jsonResponse(
        await fetch("/api/updates/", { cache: "no-store" }),
      );
      if (current !== sequence.current) return;
      if (data.deployedSha) {
        initialSha.current ??= data.deployedSha;
        setReady(initialSha.current !== data.deployedSha);
      }
      setStatus(data);
    } catch (e) {
      if (current === sequence.current) setError(errorKey(e));
    } finally {
      if (current === sequence.current) setChecking(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !busy.current)
        void refresh();
    }, 300000);
    return () => {
      clearInterval(timer);
      ++sequence.current;
    };
  }, [refresh]);
  async function sync() {
    if (!status?.canSync || !status.upstreamSha || busy.current) return;
    busy.current = true;
    setSyncing(true);
    setError(undefined);
    try {
      await jsonResponse(
        await fetch("/api/updates/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ upstreamSha: status.upstreamSha }),
        }),
      );
      setSynced(true);
      await refresh();
    } catch (e) {
      setError(errorKey(e));
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }
  return (
    <Context.Provider
      value={{ status, error, checking, syncing, synced, ready, refresh, sync }}
    >
      {children}
    </Context.Provider>
  );
}
export function useUpdates() {
  return useContext(Context);
}
