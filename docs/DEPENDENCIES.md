# Beroenden och uppdateringar

Den 18 november 2026 kontrollerades alla direkta beroenden mot npm-registrets
stabila `latest`-versioner. Lucide uppdaterades till 1.75.0 och Vitest till 5.1.1.

Den 16 november 2026 uppdaterades de sju direkta beroenden som låg efter
npm-registrets stabila `latest`-versioner. Exakta versioner finns i
`package.json` och hela beroendeträdet låses i `package-lock.json`. Kör
`npm ci` efter uppdatering och `npm run test:ui:install` för webbläsarna som
matchar den nya Playwright-versionen.

Next.js 16.4.6 innehåller säkerhetsrättningarna från
[Next.js 16.4.5](https://github.com/vercel/next.js/releases/tag/v16.4.5).
npm rapporterade inga sårbarheter i trädet före uppdateringen, trots
säkerhetsrättningarna i Next.js utgivningsnoteringar. Efter uppdateringen
rapporterade både `npm audit` och `npm audit --omit=dev` noll sårbarheter.
`npm update` uppdaterade indirekta beroenden inom tillåtna versionsintervall.

Den lokala säkerhetsgranskningen omfattade OAuth och sessionskontroller,
ägarskap vid journalåtkomst, Origin-kontroller, storleksbegränsad
begäransläsning och CSP. Granskningen avsåg appkoden och det låsta
beroendeträdet i detta repo.

TypeScript 7 används för typkontroll och produktionsbyggen. De befintliga
språktesterna behöver TypeScripts JavaScript-API för att upptäcka dubbla JSON-nycklar
och oöversatta JSX-texter. Microsofts officiella `@typescript/typescript6` 6.0.2
är därför ett separat utvecklingsberoende för dessa tester. Det ersätter inte
TypeScript 7 och ingår inte i klientkoden. Se [Microsofts beskrivning av
kompatibilitetspaketet](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).

Lucide 1 tar bort varumärkesikoner. Inloggning använder nu Lucides vanliga
inloggningsikon; GitHub-inloggningens funktion och knapptext är oförändrade.
Prettier-ändringar i befintliga filer följer den nya versionens formatering.
UI-testerna för saknad session och nekad användare körs i separata
webbläsarkontexter, så ett byte av testidentitet inte avbryter inloggningssidans
pågående förhämtning i WebKit. Kontrollen att webbläsaren saknar körfel behålls.

Utveckling och CI använder fortsatt Node.js 24; minimiversionen är 22.12.0 för
projektets verktyg. Den senaste `@types/node` är typdefinitioner och kräver inte
att driften flyttas till Node.js 26. Lägg inte till nyare Node-API:er utan att
kontrollera att de stöds i projektets driftruntime.

Vid kommande uppdateringar: kontrollera `npm outdated`, läs migrationsanvisningar,
uppdatera båda projekten, kör `npm audit`, enhetstester, typkontroll,
`format:check` och `test:ui`. Det sistnämnda bygger produktionen och provar alla
webbläsarprofiler. Uppdatera låsfilen tillsammans med paketversionerna och behåll
indirekta versionsgränser tills det överordnade paketet stöder en ny version.
