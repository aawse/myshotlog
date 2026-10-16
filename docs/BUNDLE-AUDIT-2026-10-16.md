# Paketstorlek och borttagning av oanvänd kod

Kontroll utförd 16 oktober 2026 för appen och den publika webbplatsen.
Next.js 16.4.2, React 19.3.1, Lucide 1.57.0 och produktionsbyggen med Webpack.

## Slutsats

Båda projekten tar redan bort oanvänd kod i produktionsbyggena. Lucides namngivna
ikonimporter optimeras dessutom automatiskt av Next.js. Inga extra
`optimizePackageImports`-inställningar eller globala `sideEffects: false` lades till.
De uppmätta experimenten gav inget skäl att ändra produktionskonfigurationen.

## Jämförelse

Två produktionsbyggen per projekt jämfördes med samma källkod, beroenden,
miljövärden och fasta byggcommit. Minifiering, koduppdelning och Next.js inbyggda
paketimportoptimering var aktiva i båda varianterna. I jämförelsevarianten
stängdes endast Webpacks `optimization.usedExports` och `optimization.sideEffects`
av för klientbygget genom en tillfällig `webpack`-funktion i `next.config.ts`.

Samtliga genererade `.js`-filer under `.next/static/chunks/` räknades, inklusive
underkataloger och kompatibilitetsfiler. Källkartor, CSS, HTML/RSC, typsnitt,
bilder och serverfiler ingår inte. Gzip summerar varje fils komprimerade storlek
med Nodes `gzipSync`, nivå 9. Detta är hela mängden genererad klient-JavaScript,
**inte** en sidas första nedladdning eller uppmätt nätverkstrafik. En besökare
laddar inte automatiskt ned alla dessa filer.

| Projekt   | Oanvänd kod tas bort        | JavaScript, byte | Gzip, byte |
| --------- | --------------------------- | ---------------: | ---------: |
| App       | Ja, ordinarie inställningar |        1 718 364 |    509 350 |
| App       | Nej, jämförelsevariant      |        1 723 369 |    510 514 |
| Webbplats | Ja, ordinarie inställningar |        1 009 326 |    313 208 |
| Webbplats | Nej, jämförelsevariant      |        1 009 631 |    313 151 |

Appen minskar med 5 005 byte JavaScript och 1 164 byte gzip, ungefär 1,14 KiB
eller 0,23 procent av jämförelsevariantens komprimerade totalstorlek.
Webbplatsen minskar med 305 byte JavaScript, men gzip blir 57 byte större.
En mindre okomprimerad fil behöver inte komprimeras bättre; den skillnaden
ger ingen praktiskt betydande förbättring.

Resultatet isolerar inte hela nyttan av Next.js optimeringar: bland annat
Lucides importoptimering är aktiv även i jämförelsevarianten. Det visar den
ytterligare effekten av just dessa två Webpack-inställningar i dagens kod.

## Övriga kontroller

- Lucide deklarerar `sideEffects: false` och används via namngivna importer.
  Hela ikonbiblioteket behöver därför inte tas med för ett fåtal ikoner.
- Appens journalvyer laddas som separata moduler. De förladdas efter en stund för
  navigering i en redan öppen app utan nät. Detta är avsiktligt och bevarades.
- QR-kodsgenerering för vittneslänkar laddas vid behov. PDF-generering och
  fontinbäddning används på servern och har inte flyttats till klienten.
- Webbplatsens demo och installationsguide har egna rutter; demoformulär och
  signeringsyta laddas separat. Språkfilerna för startsidans innehåll används
  på servern.
- Appens alternativa Zod-import, `import * as z from "zod"`, prövades också.
  Den gav 1 722 621 byte JavaScript och 509 378 byte gzip, alltså ingen
  förbättring jämfört med den befintliga importen. Ändringen återställdes.

Zods `jitless`-konfiguration och globala CSS-importer har avsiktliga sidoeffekter.
Det vore därför fel att försöka krympa paketen genom att generellt förklara all
appkod fri från sidoeffekter.

## Fortsatt mätning

Kör produktionsbyggen med `npm run build`, inte utvecklingsservern. Använd samma
paketlås, byggcommit och byggmiljö vid jämförelser. Mät både okomprimerad och
komprimerad storlek, och skilj hela mängden genererade filer från de filer en
viss rutt faktiskt laddar. Tillfälliga försöksinställningar återställdes och
ordinarie produktionsbyggen skapades igen efter jämförelsen.

Se [Next.js paketoptimering](https://nextjs.org/docs/app/guides/package-bundling)
och [inbyggd optimering av ikonimporter](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports).
