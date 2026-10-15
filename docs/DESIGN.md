# Shared visual design

The app and public website use the same Didact Gothic font, target logo, colours,
corner radii and spacing tokens. `lib/brand/design.json` in the app is the source
for these shared values; `app/brand.css` in both projects is generated.

After changing shared values, run `node scripts/sync-brand.mjs` from the app.
Run `node scripts/sync-brand.mjs --check` to verify both themes, fonts, logos and
favicons match. Do not edit generated brand CSS independently.

## Layout conventions

- Use `--space-*` tokens for shared component spacing. Repeated panels use 24 px
  gaps and padding, with 20 px padding on narrow screens. Form grids use 16 px
  gaps. Let the parent grid control spacing; cards inside it have no bottom margin.
- Controls have a 44 px minimum height; mobile app form inputs use 48 px and
  16 px text. Keep larger quick-entry controls for use at the range.
- Use the shared control/panel/overlay radius instead of introducing a new radius.
- Keep page-heading actions aligned with their title on wide screens and aligned
  to the content edge when stacked. Avoid adding action margins inside headings.
- Logo widths are 180 px, or 160 px in compact headers. Standalone login and
  promotional presentations can use larger variants of the same asset.
- Mobile session rows keep the date, location, firearm, medals, series and shots
  visible. Detailed score tables may scroll within their own container.
- Website marketing headings are larger than journal headings; inner website
  pages use a consistent smaller heading scale. Keep the underlying font and
  colours shared.

## Visual verification

Use fictional records and mocked data requests, never personal journal screenshots.
Check desktop, tablet and narrow phone widths (including 320 px), both languages,
long names, form fields, empty and populated views, navigation states, and open
dialogs. Check that focus outlines, complete labels and controls remain visible,
that no page-wide horizontal scrolling appears, and that nested grids do not add
extra card margins. Also verify the website demo and setup/training pages.
