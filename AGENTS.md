<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Agent rules for MyShotLog

These rules apply to every change, however small. When rules conflict, the
order of priority is: **security and data integrity → correctness and tests →
consistency with the codebase → performance → brevity**.

## 1. Security and integrity first

MyShotLog stores private shooting records in a Git-backed journal. Never trade
security or data integrity for convenience or speed.

- Before writing code, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
  [SECURITY.md](SECURITY.md). Keep the documented guarantees intact.
- **Trust nothing from the client.** Validate every external input on the
  server with `zod` schemas (see `lib/validation.ts`). Read request bodies only
  through the size-limited helpers in `lib/request-body.ts`.
- **Ownership is server-decided.** The server always selects the owner's UUID
  and journal prefix from the verified session. Never derive data paths, user
  IDs, or repository targets from request data, usernames, or query strings.
- Keep the existing auth model: OAuth with state + S256 PKCE, HMAC-signed
  HttpOnly/SameSite cookies, Origin checks on writes, allowlist checks, and
  `no-store` on private responses. Never weaken, bypass, or short-circuit them.
- Never log, return, or expose tokens, secrets, cookies, provider error bodies,
  or personal data. Client-facing errors must be generic.
- Never commit secrets, real user data, or real repository contents. Tests and
  examples use fictional data only (see `tests/fixtures.ts`).
- Preserve Git write guarantees: atomic commit chains, revision-conflict
  detection, bounded retries, cache invalidation around `publish`, and
  per-user isolation. Writes must never partially succeed or silently overwrite
  newer data.
- Keep the Content Security Policy strict. Do not add `unsafe-*` directives,
  inline scripts, or new third-party origins.
- Uploaded files (photos) must be validated by content, size, dimensions, and
  hash on the server. Never trust the client's MIME type or filename.
- Backward compatibility of stored data is an integrity requirement. Existing
  journals, exports, legacy prefixes, and older photo formats must remain
  readable. Any change to stored formats needs a migration path and tests.
- When unsure whether something is safe, stop and ask instead of guessing.

## 2. Well tested

- Every behavior change ships with tests in `tests/` (Vitest). New features get
  new tests; bug fixes get a regression test that fails without the fix.
- Cover the failure paths, not just the happy path: invalid input, oversized
  bodies, unauthorized and cross-user access, wrong Origin, expired sessions,
  Git conflicts, and provider errors.
- Security-sensitive code (auth, sessions, request parsing, storage, photos,
  witness signing) needs explicit negative tests that prove access is denied.
- Tests must be deterministic and offline: use the existing fixtures, mocked
  providers, and temporary local bare Git repositories. No network calls, no
  real secrets, no reliance on time zones or OS-specific paths.
- Do not delete, skip, or weaken existing tests to make a change pass. If a test
  is genuinely obsolete, explain why in the change.
- Before finishing, all of these must pass:

  ```sh
  npm test
  npm run typecheck
  npm run format:check
  npm run build
  ```

## 3. Consistent with the codebase

- Study neighboring code first and follow its patterns, naming, file layout,
  and error handling. Reuse existing helpers in `lib/` instead of writing new
  ones that do the same thing.
- Place code where it belongs: domain and server logic in `lib/`, UI in
  `components/`, routes in `app/`, scripts in `scripts/`, tests in `tests/`.
- TypeScript is `strict` with `noUnusedLocals` and `noUnusedParameters`. Do not
  use `any`, non-null assertions, or `@ts-ignore` to silence the compiler; fix
  the types instead.
- All user-facing text goes through i18n. Add every new key to both
  `lib/locales/sv.json` and `lib/locales/en.json` with identical key sets.
  Swedish is the default language.
- Follow the design and brand rules in [docs/DESIGN.md](docs/DESIGN.md) and
  [docs/BRANDING.md](docs/BRANDING.md).
- Format with Prettier (`npm run format`). Do not hand-format against it.
- Update the relevant document in `docs/` (written in Swedish) and the README
  whenever behavior, setup, configuration, or guarantees change.

## 4. Well structured

- Keep modules small and focused on one responsibility. Prefer pure functions
  for domain logic so it can be tested without I/O.
- Keep server-only code (secrets, Git access, tokens) out of client components.
  Never import server modules into `"use client"` files.
- Validate at the boundary, then pass typed data inward. Do not re-validate or
  reshape the same data in multiple layers.
- Use clear names over comments. Comment only non-obvious reasoning, such as a
  security constraint or a concurrency edge case.
- Avoid premature abstraction. Introduce a shared helper only when it removes
  real duplication.

## 5. Optimized

- Prefer server components and server-side work; ship minimal client
  JavaScript. Do not add client-side state when the existing journal cache or
  provider already holds it.
- Respect the read cache design: use `readSnapshot` for display/export and a
  fresh `snapshot` for transactions and security state.
- Avoid redundant Git/API round trips, N+1 reads, and unbounded loops, memory,
  or payloads. Every input, list, and buffer needs an upper bound.
- Measure before micro-optimizing. Never optimize at the expense of
  correctness, readability, or security.

## 6. Prune as you go

Every feature should leave the codebase at least as lean as it found it.

- Remove code, exports, components, styles, translation keys, assets, scripts,
  config, and docs that the change makes unused. Do not leave dead code,
  commented-out code, or "temporary" fallbacks behind.
- When replacing an implementation, delete the old one in the same change
  rather than keeping both paths, unless stored-data compatibility requires
  the old reader (see section 1).
- Search for remaining references (code, tests, docs, locales) before deleting,
  and confirm with the full check suite afterwards.

## 7. Dependencies

- Prefer the platform, Next.js, React, and existing dependencies. Add a new
  package only when it is clearly justified, actively maintained, widely used,
  and has no known vulnerabilities. State the justification in the change.
- Pin runtime dependencies to exact versions, as in `package.json`, and commit
  the matching lockfile changes.
- When a dependency becomes unused, remove it from `package.json` and the
  lockfile in the same change. Do not leave unused `@types/*` packages behind.
- Run `npm audit` after dependency changes and do not introduce known
  vulnerabilities.
- GitHub Actions must stay pinned to full commit SHAs.

## 8. Definition of done

A change is complete only when:

1. It is secure, preserves data integrity, and keeps stored data compatible.
2. It is covered by tests, including failure and access-denied cases.
3. `npm test`, `npm run typecheck`, `npm run format:check`, and `npm run build`
   all pass.
4. It follows existing patterns, with i18n keys in both locales.
5. Obsolete code, keys, assets, and dependencies have been removed and bundle size has been optimized.
6. Related documentation is updated.


## 9. Working agreement and app/demo parity

- Work in this `myshotlog` checkout; the former `skytte` path is obsolete. The
  public website is the separate sibling `../myshotlog-website` repository.
- Carry authorized work through implementation, review and verification. Make
  small, coherent changes and verify each step. Do not ask again for choices or
  actions already authorized. Ask only when a missing decision blocks safe work.
- Keep the user informed with concise progress updates. Commit completed changes
  as work progresses; use separate commits for independent requested changes.
  Do not package ZIP files or push unless the user requests it.
- Preserve existing journal IDs and stored records. Profile birth-date changes
  must not retrospectively change a recorded series. Use the dated rules and
  captured birth information; all medal displays must share the same rating logic.
- Show readable rule editions once per session, grouping exceptions when needed.
  Assessment details use labelled fields, never raw JSON or internal rule IDs.
  Compact disclosure rows retain grade, full series name, score and date.
- Keep all information accessible while tightening layouts. Wrap long labels,
  preserve keyboard interaction and visible focus, and retain at least 44 px touch
  targets. Floating tools must have reserved space so they cannot cover actions.
- A session has one firearm and sport. Keep shared distance, target and time limit
  at session level, with explicit event-stage overrides where applicable. Event
  programs and firearm optics/defaults determine suggestions, not official class
  certification. Never auto-award medals for unsupported sports.
- When app features or design change, check the website demo and documentation
  for drift if they are in scope. The demo must stay independent and browser-only;
  do not copy authentication, server storage or credentials into the website.
- Use fictional records and mocked/offline requests for tests and visual review.
  For UI changes run the browser matrix as well as the required checks above;
  inspect desktop, phone and tablet screenshots in both languages, including
  320 px widths, long content, collapsed and expanded states.
- Run browser tests with their dedicated production build/configuration. Only
  use `UI_SKIP_BUILD=1` when the existing build used that same configuration;
  public build-time settings cannot be replaced merely by runtime test values.
