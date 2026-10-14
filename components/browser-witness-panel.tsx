"use client";
import { useEffect, useState } from "react";
import { WitnessPanel } from "./witness-panel";
import { useJournalState } from "./journal-provider";
import type { ComponentProps } from "react";
export function BrowserWitnessPanel(
  props: Omit<ComponentProps<typeof WitnessPanel>, "invitations">,
) {
  const { state } = useJournalState();
  const [invitations, setInvitations] = useState<
    ComponentProps<typeof WitnessPanel>["invitations"]
  >([]);
  useEffect(() => {
    if (state.pending.length) return;
    const controller = new AbortController();
    void fetch(
      "/api/witness/?sessionId=" + encodeURIComponent(props.sessionId),
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        if (response.ok) {
          const result = await response.json();
          if (Array.isArray(result.invitations))
            setInvitations(result.invitations);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [props.sessionId, state.head, state.pending.length]);
  return <WitnessPanel {...props} invitations={invitations} />;
}
