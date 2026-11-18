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
- Rubrikerna i appen och på webbplatsen använder samma 32 px målikon och
  ordbild. För export och installation finns separata logofiler och ikoner
  som genereras från samma färgpalett.
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

## Journalvyer

Journalen visar månadens pass och skott enligt profilens tidszon, det senaste
passet och en länk till passlistan. Utvecklingsvyn visar en linjegraf med en
utfällbar tabell. På större skärmar finns navigeringen i sidopanelen. På telefon
ligger den nedtill, med bland annat inställningar och utloggning under **Mer**.
Synkstatus och feedback har reserverad plats ovanför navigeringen.

Snabbseriens poängfält går att skriva i och justera stegvis. Passvyn visar
totalpoäng och snitt för poänggrenar samt antalet skott. Seriernas bedömningar,
regelutgåvor och vittnesuppgifter finns kvar i passvyn.

Valörerna visas som färgade textblock för guld, silver och brons. Passlistan visar också antalet serier per valör. Appen och demon använder samma färger.

Journalens statistik och senaste pass delar CSS med webbplatsens illustration
och demo. Illustrationens passlista använder samma valörblock.
