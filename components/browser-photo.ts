"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useJournal } from "./journal-provider";
const subscribe = () => () => {};
const snapshot = () => null;
export function useBrowserPhoto(source: string, attempt = 0) {
  const journal = useJournal();
  const state = useSyncExternalStore(
    journal?.subscribe ?? subscribe,
    journal?.getSnapshot ?? snapshot,
    snapshot,
  );
  const id = source.match(/^\/api\/photos\/([a-f0-9]{64})\/$/)?.[1];
  const cached = id ? state?.state.photos[id] : undefined;
  const [loaded, setLoaded] = useState<{ source: string; data: string }>();
  useEffect(() => {
    if (!journal || !id || cached) return;
    let active = true;
    void journal
      .cachePhoto(id, source)
      .then((data) => {
        if (active) setLoaded({ source, data });
      })
      .catch(() => {
        if (active) setLoaded({ source, data: source });
      });
    return () => {
      active = false;
    };
  }, [source, id, cached, journal, attempt]);
  return (
    cached ??
    (loaded?.source === source
      ? loaded.data
      : journal && id
        ? undefined
        : source)
  );
}
