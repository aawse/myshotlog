import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/witness/",
}));
import { LanguageProvider } from "../components/language-provider";
import { WitnessPanel } from "../components/witness-panel";
import { WitnessReviewView } from "../components/witness-review";
import { AppTelemetry } from "../components/app-telemetry";
import { filterAnalyticsEvent } from "../lib/telemetry";
import { redactPerformanceEvent } from "../lib/performance";
import { reviewSession } from "../lib/witness/model";
import { session } from "./fixtures";
it("renders bilingual owner controls and preserves user entered witness summary text", () => {
  const html = renderToStaticMarkup(
    <LanguageProvider language="en">
      <WitnessPanel
        sessionId={session.id}
        results={session.results}
        signoffs={[]}
        invitations={[]}
      />
      <WitnessReviewView
        review={reviewSession({ ...session, location: "Översikt" }, null)}
      />
    </LanguageProvider>,
  );
  expect(html).toContain("Request witness sign-off");
  expect(html).toContain("Entire session");
  expect(html).toContain("Översikt");
  expect(html).not.toContain("birthDate");
});
it("disables telemetry on witness pages and filters late events from existing SDK scripts", () => {
  expect(renderToStaticMarkup(<AppTelemetry speedEnabled />)).toBe("");
  const url = "https://example.test/witness/#token=secret";
  expect(filterAnalyticsEvent({ type: "pageview", url })).toBeNull();
  expect(
    redactPerformanceEvent({ type: "vital", url }, "https://example.test"),
  ).toBeNull();
  expect(
    filterAnalyticsEvent({
      type: "pageview",
      url: "https://example.test/login/?code=secret#token",
    }),
  ).toEqual({ type: "pageview", url: "https://example.test/login/" });
});

it("reuses the photo thumbnail and modal for the scoped witness photo", () => {
  const html = renderToStaticMarkup(
    <LanguageProvider language="en">
      <WitnessReviewView
        review={reviewSession(session, session.results[0].id)}
        photo={{
          mediaType: "image/jpeg",
          width: 20,
          height: 20,
          data: "aGVsbG8=",
        }}
      />
    </LanguageProvider>,
  );
  expect(html).toContain("data:image/jpeg;base64,aGVsbG8=");
  expect(html).toContain("Open target photo for Serie");
  expect(html).toContain("<dialog");
  expect(html).toContain("photo-overlay");
});
