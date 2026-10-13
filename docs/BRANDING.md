# Shared MyShotLog design

The app is the source of truth for the public website's brand assets. Colours, font identity, radii and type weights are defined in `lib/brand/design.json`. The generated `app/brand.css` is imported by both projects. Screen layouts keep their own density; both use the same theme, font and target mark.

The locally bundled Didact Gothic font is used by both Next.js sites and embedded in session PDFs. PDF hierarchy uses size and colour because Didact Gothic has a single regular face. PDFs use the same palette and logo, aligned numeric columns, restrained section headings and thin borders. Font redistribution terms are in `lib/fonts/OFL.txt`.

From the app repository root, regenerate and synchronize branding with:

```sh
node scripts/generate-brand.mjs
node scripts/sync-brand.mjs
node scripts/sync-brand.mjs --check
```

The website checkout defaults to `../myshotlog-website`. To use a different checkout location, pass its path as a positional argument. `--check` only compares files and exits with a failure if themes, fonts, logos or favicons differ. The sync command copies only an explicit list of brand assets; it never reads environment files or journal records. Both projects build independently after syncing.

When changing the font, update both root layouts' `next/font/local` declarations and the PDF route's `outputFileTracingIncludes` along with the design file. Verify the browser's loaded font and the embedded PDF font. Render Swedish and English samples, including a long session and witness sign-offs, to check pagination and readability.
