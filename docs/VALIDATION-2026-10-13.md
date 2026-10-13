# Validation, performance and SEO — 13 October 2026

Both repositories were validated from their local production builds. No real journal records, tokens or provider settings were changed. These are local checks, not a claim that the latest code is deployed or that a production GitHub write has been tested.

## Validation

- App: 360 tests across 45 files; public website: 19 tests across 4 files. Both type checks, full formatting checks and production builds passed.
- `npm audit --omit=dev` reported zero production dependency vulnerabilities in either project. This is an advisory check, not a complete security guarantee.
- Shared theme, logos, favicons, original TTF and compressed WOFF2 match through `node scripts/sync-brand.mjs --check`. WOFF2 glyph order and character mapping were verified against the TTF. PDF font embedding remains covered by the existing PDF tests.
- No broken local Markdown documentation links were found. Twenty of twenty-one public reference URLs returned HTTP 200; GitHub signup denied the automated request with HTTP 403. Its official signup URL remains unchanged; interactive registration was not performed.
- GitHub OAuth registration, scoped token setup, Vercel system variables and GitHub's manual fork-sync flow were reviewed against official documentation. The website's reference review date and maintenance steps now include installation diagnostics and manual syncing.
- Production browser checks covered Swedish/mobile and English/desktop rendering, language switching, checklist interaction, one H1, internal anchors, horizontal overflow, canonical/alternate/social metadata, nonced JSON-LD, static crawler routes and browser errors. The app's anonymous login page sends noindex metadata and POST to the removed update endpoint returns HTTP 405.

## Performance changes

- Web font: original TTF 194,200 bytes; full WOFF2 61,384 bytes, a 68% reduction before transfer compression. Both websites use WOFF2; PDFs retain the original TTF and the same typography. No font conversion dependency was added to either application.
- Journal assessment reads now index the first historical assessment per session/series once. This replaces repeated full-history scans with map lookups, preserving captured birth information and original timestamps. Existing journal and import regressions pass.
- Public GitHub repository metadata is cached for one hour and concurrent reads coalesce. Live heads and comparisons remain fresh when the five-minute status cache expires. Tests cover cache reuse, expiry and retry after failures. Once metadata is warm, a usual check needs three requests instead of five; a separate fork-head comparison needs four instead of six.
- Settings loads export serialization utilities only when an export is requested. The production Settings client-reference chunks decreased from 103,867 to 101,962 gzip bytes in this build comparison. This is a bundle measurement, not a page-load speed claim.
- The website already renders its guide and translations on the server and limits client behavior to preference/checklist/copy/monitoring controls. Static sitemap and robots responses now bypass nonce generation; personalized HTML remains private/no-store to preserve CSP and language isolation.

## Website SEO analysis and changes

The original website lacked canonical URLs, language alternates, crawl discovery routes and social sharing images. It also offered language selection only through a select control.

- Added distinct language canonicals at `https://myshotlog.se/?lang=en` and `?lang=sv`, reciprocal `hreflang` alternates and an `x-default` browser-language entry point.
- Added crawlable footer language links, a sitemap containing canonical translations, and robots rules advertising that sitemap.
- Added localized titles/descriptions, absolute Open Graph URLs, a shared preview image, Twitter large-image cards and image alt text from the language files.
- Added CSP-nonced, safely escaped WebApplication JSON-LD using real visible product information. No ratings are invented, and eligibility for Google's software rich results is not claimed.
- Vercel previews are excluded from indexing. The personal journal app also sends noindex metadata. Private content remains protected by authentication; noindex is not access control.

After deploying, submit `https://myshotlog.se/sitemap.xml` in Google Search Console and inspect both canonical translations. Check real-user Core Web Vitals through the enabled Vercel Speed Insights project. Search engines decide whether and when to index pages; local builds and browser timings do not establish rankings, field LCP/INP/CLS or provider deployment behavior.

Sources: [Google localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions), [Google canonicalization](https://developers.google.com/search/docs/crawling-indexing/canonicalization), [Google sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [GitHub fork syncing](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/syncing-a-fork), [GitHub OAuth registration](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app), [GitHub personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens), [Vercel system variables](https://vercel.com/docs/environment-variables/system-environment-variables).
