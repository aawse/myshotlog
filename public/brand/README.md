# MyShotLog identity

Two concentric target rings and an exact centre dot express precision without decorative elements. The horizontal wordmark uses Didact Gothic, converted to vector outlines so the logo renders identically on every device.

- `MyShotLog-logo.svg`: horizontal logo, 671 × 256, transparent background.
- `MyShotLog-icon.svg`: standalone target, 256 × 256.
- `MyShotLog-logo-monochrome.svg`: one-colour logo using `currentColor`, with a transparent background.
- Matching PNG files: transparent, 2400 pixels wide. The icon is 2400 × 2400.
- `MyShotLog-preview.png`: colour, standalone icon and reversed monochrome examples.
- `app/favicon.ico`: browser favicon with 16, 32 and 48 pixel images; Next.js adds its metadata automatically. The SVG icon is also linked in the page metadata.
- `MyShotLog-apple-touch-icon.png`: opaque 180 × 180 icon for Apple home screens.

Colours: forest green `#315d43`, charcoal `#233329`, muted gold `#bc9864`. Use the colour logo on light backgrounds and a contrasting monochrome version elsewhere. Preserve proportions and leave clear space around the mark. The SVGs contain only vector artwork and outlined lettering; no font files or raster images are embedded.

Site typography uses locally bundled Didact Gothic through `next/font/local`, with Arial and sans-serif fallbacks. Fonts are served from the application; visitors make no requests to Google Fonts. The font and its SIL Open Font License are in `lib/fonts/`.

Regenerate all assets on any operating system with `node scripts/generate-brand.mjs`. The script outlines the bundled Didact Gothic font, so no system font installation or separately licensed font is needed.
