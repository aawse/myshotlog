# CodeQL finding review

Reviewed 2026-10-15 against the reported file locations. This is source-level
triage, not a claim that a new CodeQL run has passed. No query is disabled and no
alert is automatically dismissed.

## URL checks and HTML entity decoding

The rule-monitor test selects Google Drive entries using `new URL(url).hostname`
with an exact `drive.google.com` comparison. The baseline contains validated
absolute URLs, so a malformed entry should fail the test rather than be ignored.
Production document discovery already parses URLs and validates their hosts.

The rule-monitor decoder handles quote and apostrophe entities before ampersand
entities, so `&amp;quot;` remains `&quot;` after one pass. Regression tests cover
ordinary entities and nested named, decimal and hexadecimal ampersand forms.

## Password-hashing alerts

The recommendation in [CodeQL's insufficient-password-hash query](https://codeql.github.com/codeql-query-help/javascript/js-insufficient-password-hash/)
applies to stored human-chosen passwords. MyShotLog authenticates users through
GitHub OAuth and does not accept or store their GitHub passwords. The reported
operations have other purposes:

| File                         | Operation and input                                                                            | Assessment                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `tests/oauth.test.ts`        | SHA-256 of the cryptographically random PKCE verifier                                          | Required S256 protocol assertion, not password storage.                                                              |
| `lib/witness/store.ts`       | SHA-256 of an HMAC-signed invitation containing a 32-byte random nonce; SHA-256 of review JSON | Bearer-token lookup and snapshot integrity digests. Existing invitations and signoffs depend on these exact digests. |
| `lib/auth/session.ts`        | SHA-256 of a namespace and public numeric GitHub ID; HMAC-SHA-256 of session/cookie contents   | Stable journal ID and message authentication. The ID digest is not an access-control secret.                         |
| `lib/auth/security.ts`       | SHA-256 of site origin and the random application signing key                                  | Stable security-store namespace, not a password verifier.                                                            |
| `lib/auth/security-store.ts` | SHA-256 of a 32-byte random OAuth state; HMAC-SHA-256 of rate-limit identifiers                | One-time state lookup and keyed client identifiers, not password storage.                                            |

These reported operations are false positives for **password hashing** based on
the inspected inputs and uses. Confirm each alert's source-to-sink trace matches
this table before dismissing it as a false positive in GitHub. A different trace
or future password-handling feature needs a fresh review. Preserve the current
algorithms: changing them would alter stored identifiers/digests, and replacing
PKCE S256 would violate the protocol.

[PKCE S256 is specified by RFC 7636 §4.2](https://www.rfc-editor.org/rfc/rfc7636#section-4.2).
OAuth state and PKCE verifiers are generated with `randomBytes(32)`; witness
invitations contain an independently generated 32-byte nonce. Cookie signatures
use HMAC and constant-time comparison. The setup instructions generate the
application signing key from 32 random bytes; a human-chosen password must not be
used in its place.

If local password authentication is introduced later, use a suitable password
KDF (such as Argon2id or scrypt), unique salts and reviewed cost parameters. Do not
reuse these token or identifier digest helpers for passwords.
