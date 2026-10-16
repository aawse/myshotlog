# Beroenden och uppdateringar

Den 16 oktober 2026 kontrollerades alla direkta beroenden mot npm-registrets
senaste stabila `latest`-versioner. Exakta versioner finns i `package.json` och
hela beroendeträdet låses i `package-lock.json`. Kör `npm ci` efter uppdatering.

Next.js 16.4.2, React 19.3.1, Lucide 1.57.0, Zod 4.6.7, TypeScript 7.0.2,
Vitest 5.0.5 och Prettier 3.9.10 ingår. Övriga direkta paket kontrollerades också;
paket som redan var aktuella behölls. `npm update` uppdaterade indirekta beroenden
inom respektive pakets tillåtna intervall. Inga tvingande `overrides` används:
exempelvis Next.js och PDF-biblioteken väljer egna kompatibla underversioner.

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
