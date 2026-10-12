# MyShotLog security audit — 2026-10-12

Audited application commit: `e4779ba`. This is a repository audit with local tests, not a penetration test of a deployed installation. The findings below describe that original commit. Subsequent remediation addresses S1–S6; see the remediation section and updated setup guide.

## Scope and result

Reviewed GitHub authentication, session cookies, authorization, API writes and exports, both Git database adapters, target photos, browser rendering, dependency advisories, CI and tracked secrets. The threat model includes unauthenticated internet clients, malicious authenticated clients and replay of an already stolen session cookie. Operator-controlled Git remotes and API URLs are trusted configuration.

No critical or high severity issue, authentication bypass or cross-user data disclosure was identified in the reviewed paths. This does not establish their absence. There are two medium findings, three low findings and one informational dependency cleanup item. Severity reflects this personal-use application's exposure and each finding's prerequisites.

| ID  | Severity                     | Finding                                                                | Source                                                                                                   |
| --- | ---------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| S1  | Medium                       | Logout does not revoke copied session cookies                          | `lib/auth/server.ts:35`, `lib/auth/session.ts:88`                                                        |
| S2  | Medium, deployment dependent | Public OAuth attempts lack application throttling and flow consumption | `lib/auth/github.ts:114`, `lib/auth/github.ts:136`, `app/auth/github/callback/route.ts:48`, `proxy.ts:2` |
| S3  | Low, deployment dependent    | Request size is checked after buffering                                | `app/api/records/route.ts:114`                                                                           |
| S4  | Low hardening                | No application Content Security Policy                                 | `next.config.ts:8`                                                                                       |
| S5  | Low hardening                | GitHub Actions use mutable major tags                                  | `.github/workflows/tests.yml:24`, `.github/workflows/tests.yml:29`                                       |
| S6  | Informational                | Unused production dependency                                           | `package.json:21`                                                                                        |

## Findings

### S1 — Logout does not revoke copied session cookies

`endSession()` deletes the browser cookie. Verification checks its signature, purpose, expiry and current allowlist, but has no session identifier or revocation state. A copied cookie therefore remains valid after logout until its original eight-hour expiry. The attacker must already possess a valid cookie; this finding does not demonstrate cookie theft or login bypass. This limitation is already documented in the setup guide.

A local test signed a fixture cookie, called logout, then verified the original cookie successfully one second later. Verification rejected it at expiry.

Recommended change: introduce revocable session IDs or a per-user session epoch checked on requests. Logout must invalidate the relevant server-side state. Keep allowlist removal and signing-key rotation as emergency revocation options. See [OWASP session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

### S2 — Public OAuth attempts lack application throttling and flow consumption

Anyone can start an OAuth flow and receive a signed ten-minute flow cookie. A client that retains this cookie and matching state can repeatedly call the callback with invalid codes. Each otherwise valid attempt reaches GitHub's token endpoint. Clearing the flow cookie in the response does not prevent a raw HTTP client from replaying it. No application rate limiter or server-side consumed-flow record was found.

A local test submitted the same fixture flow and invalid code three times to a mocked provider: all three attempts made outbound token requests. GitHub's valid authorization code, PKCE and the numeric-ID allowlist still protect login. The impact is avoidable outbound requests, function resource consumption and possible provider throttling. Deployed edge rate limits were not inspected and may mitigate exposure.

Recommended change: apply distributed or edge throttling to login and callback endpoints, with limits per client and flow, plus bounded retries or server-side flow consumption. Also set per-user limits for expensive Git operations. See [OWASP API resource-consumption guidance](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/).

### S3 — Request size is checked after buffering

The records POST handler calls `request.text()` before applying its 3 MB limit. Origin validation and authentication happen first, so this is an authenticated resource-consumption concern. On a self-hosted deployment without an upstream body cap, an authorized client can cause allocation above the intended limit. Actual Vercel or proxy body limits were not tested.

A mocked request returning 3,000,001 bytes was read before the handler returned 413; no database mutation occurred. Recommended change: reject an oversized declared Content-Length early and enforce a bounded streaming read as well. Content-Length alone cannot be trusted.

### S4 — No application Content Security Policy

The configured headers provide nosniff, frame denial, a referrer policy and restricted permissions, but no CSP. No executable HTML injection sink was found in the reviewed application. This is defense-in-depth, not a demonstrated XSS exploit; a deployment could also supply its own policy.

Recommended change: introduce a Next-compatible nonce-based policy, initially in report-only mode. Verify hydration and target-photo previews before enforcing it. See [OWASP CSP guidance](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html).

### S5 — GitHub Actions use mutable major tags

Checkout and setup-node are referenced as `@v7`, so their implementation can change without a repository diff. Current protections reduce impact: workflow token permissions are read-only, checkout does not persist credentials, no application secrets are supplied, and the PR trigger is not `pull_request_target`. No compromised action was identified.

Recommended change: pin reviewed full commit SHAs and use an update mechanism to keep them current. See [GitHub's secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use).

### S6 — Unused production dependency

`approve` is installed but has no application imports. Its installed entry point is a placeholder logging that the package is coming. No malicious behavior or known advisory was identified. Remove it if it has no intended use to reduce unnecessary dependency surface.

## Protections reviewed

- Signed cookies use purpose separation, bounded parsing, expiry checks and timing-safe signature comparison. Production cookies use Secure, HttpOnly and SameSite=Lax. Allowlist membership is checked on authenticated requests.
- OAuth uses random state, PKCE S256 and a configured callback URL. Identity tokens remain server-side; login does not request repository scopes.
- Writes validate Origin. Record ownership comes from the authenticated identity, with validated owner IDs and paths. Photo reads are scoped to that owner and marked private/no-store.
- Uploaded photos are limited by size and dimensions, checked as canonical WebP with full decoding and SHA-256 verification, and reject retained EXIF/XMP/ICC metadata. Browser optimization precedes upload.
- GitHub storage requires a private repository and publishes atomic, non-forced updates. Native Git uses argument arrays, avoids checkout and cleans temporary repositories after success and failures.
- React renders user data without raw HTML sinks in the reviewed paths. CSV exports neutralize formula-leading values.
- Git history intentionally retains prior records and photos. Removing current records is not historical erasure; the setup documentation explains this retention model.

## Validation and limits

`npm audit --json` returned zero known advisories for the current lockfile. This is advisory coverage, not proof that every dependency is secure.

`npm test` passed all 200 tests: 197 existing tests plus three temporary local reproduction tests for S1–S3. They used fake identities, mocked cookies/provider requests and a mocked body; no real accounts, production data or live endpoints were exercised. The temporary tests were removed after recording the evidence.

A tracked-file scan across eight reachable commits found no matches for GitHub token patterns, AWS access-key IDs or private-key headers. Only `.env.example` is tracked among environment files; no tracked ZIP or history for `.env`/`.env.local` was found. Secret values were not printed or read from `.env.local`. This limited pattern scan does not cover arbitrary credentials, unreachable commits, external clones, deployment logs or the separate data repository.

Not inspected: deployed TLS/security headers, Vercel firewall and body limits, actual GitHub token permissions, OAuth app settings, branch protection, remote data-repository access, backups, or operating-system/native-code vulnerabilities. The review and tests do not constitute a complete independent security certification.

## Remediation — 2026-10-12

All six recorded findings have been addressed in source:

- **S1:** Random session IDs and a shared Git-backed active-session registry. Logout removes the cookie hash atomically before deleting the local cookie. Unregistered legacy cookies are rejected.
- **S2:** OAuth flow hashes are registered and consumed atomically before the provider request, including failed exchanges. Shared fixed-window limits protect flow creation/consumption and authenticated records/photo APIs. Replays cannot exchange another code. Limits and proxy trust settings are documented in [SETUP.md](SETUP.md#säkerhetstillstånd-och-trafikgränser).
- **S3:** Content-Length preflight and bounded byte-stream reading stop oversized bodies without first buffering the entire request. Authentication/origin checks remain before body reading.
- **S4:** Enforced nonce-based CSP via Proxy and dynamic root rendering; production scripts exclude unsafe-inline/eval. Photo previews and computed chart style attributes remain supported. Zod runs with `jitless: true` to avoid dynamic Function compilation and eval probing.
- **S5:** Both CI actions are pinned to verified commits from their official repositories; weekly Dependabot updates track newer versions.
- **S6:** Removed `approve` and the redundant direct `fsevents` declaration. Vite retains its own optional macOS dependency. Remaining direct dependencies serve application, native photo validation, framework, types, tests or formatting.

Regression tests cover post-logout cookie replay, concurrent one-time flow consumption, provider-failure replay, durable registration failures, shared budgets, expiry, malformed state, request-stream cancellation and CSP headers. Real temporary Git integration verifies that security commits preserve unrelated journal data and that independent instances observe revocation. No live repository or deployment was modified during validation.

Git-backed limits add repository traffic; upstream firewall protection remains appropriate for volumetric attacks. Restoring old security state can undo revocation, so rotate the signing secret after a repository restore. Deployment configuration and external controls retain the original audit's unverified scope.

Final verification: all **225 tests passed**, production build/type checking passed, formatting/whitespace checks passed, and `npm audit` returned zero known advisories. An isolated headless Chrome test of the production server verified nonce-bearing scripts, hydrated chart rendering, browser photo optimization/previews, authenticated API access, HTTP 413 for an oversized body, and HTTP 401 when replaying a copied cookie after logout. It reported zero browser errors or CSP violations. Temporary test repositories and scripts were removed.
