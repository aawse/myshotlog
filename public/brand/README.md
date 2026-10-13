# MyShotLog identity

A minimal shield protects a single target ring and centre dot. The horizontal wordmark uses Helvetica Neue Medium, converted to vector outlines so the logo renders identically on every device.

- `MyShotLog-logo.svg`: horizontal logo, 685 × 256, transparent background.
- `MyShotLog-icon.svg`: standalone shield and target, 256 × 256.
- `MyShotLog-logo-monochrome.svg`: one-colour logo using `currentColor`; target details are transparent cut-outs.
- Matching PNG files: transparent, 2400 pixels wide. The icon is 2400 × 2400.
- `MyShotLog-preview.png`: colour, standalone icon and reversed monochrome examples.
- `app/favicon.ico`: browser favicon with 16, 32 and 48 pixel images; Next.js adds its metadata automatically. The SVG icon is also linked in the page metadata.
- `MyShotLog-apple-touch-icon.png`: opaque 180 × 180 icon for Apple home screens.

Colours: forest green `#315d43`, charcoal `#233329`, muted gold `#bc9864`. Use the colour logo on light backgrounds and a contrasting monochrome version elsewhere. Preserve proportions and leave clear space around the mark. The SVGs contain only vector artwork and outlined lettering; no font files or raster images are embedded.

Site typography prefers `Helvetica Neue`, followed by `Helvetica`, `Arial` and `sans-serif` for devices without those fonts. No font download is required.

Regenerate all assets on any operating system with `node scripts/generate-brand.mjs`. The script uses the saved outlines in `scripts/brand-wordmark.json`. To regenerate the lettering itself, set `MYSHOTLOG_BRAND_FONT` to a locally licensed Helvetica Neue Medium font file before running the script. The font file is not copied into the project or served to visitors.
