# MyShotLog

Svensk träningsjournal för personligt pistolskytte, byggd med Next.js och React. Inloggning sker med GitHub-konton. Journalen lagras i ett **konfigurerbart privat Git-repository**, med en commit per sparad post. GitHub API används på Vercel; en Git-adapter finns för egen server och lokala bare repositories.

## Funktioner

- Svenska och engelska, med språkval sparat i profilen. Svenska används om inget språk har valts. Egna namn, platser och anteckningar översätts inte.
- Vapen med tillverkare, modell, kaliber och förvald gren.
- Pass med platsförslag, starttid och gemensamt avstånd, måltyp och skjuttid för serierna.
- Resultat med brons-, silver- och guldmarkeringar för precision och tillämpning. Regelversion väljs efter passdatum; övriga grenar kan registreras utan automatisk märkesbedömning.
- Födelsedatum i profilen för precisionens åldersavdrag. Sparade födelseuppgifter används när de finns i seriens underlag; annars används profilen.
- Mobilanpassad **Snabbserie** som sparas direkt och senare kan kopplas till ett pass med samma datum och gren. Nätanslutning krävs.
- Ett valfritt tavelfoto per serie. Välj en bild; formatet avgör automatiskt om den kan användas direkt eller behöver konverteras och optimeras i webbläsaren före uppladdning.
- JSON-export/import med profil, vapen, råresultat, seriens födelseuppgifter, okopplade serier och foton. Bedömningar exporteras inte; vid import beräknas de med reglerna för passdatumet. CSV exporterar resultat från pass till kalkylblad.
- Vercel Web Analytics via rotlayouten; aktiveras för projektet i Vercels dashboard.

Appen används för personlig resultatuppföljning. Serier behöver inga signaturer eller verifieringar. Regelunderlag och begränsningar finns i [regeldokumentationen](docs/RULES.md).

## Lokal utveckling

Installera **Node.js 24** och **Git**. Samma npm-kommandon används på Windows, macOS och Linux; WSL krävs inte. Kör från projektets rot:

```sh
npm ci
npm run setup:local
```

Fyll sedan i `.env.local` enligt [installationsguiden](docs/SETUP.md). Setup-kommandot skapar filen från `.env.example` och bevarar en befintlig fil. Konfigurera Git-lagring, GitHub OAuth, tillåtna numeriska GitHub-ID:n, sessionshemlighet och webbplatsens origin innan du loggar in.

```sh
npm run dev
```

Öppna `http://localhost:3000`. Använd samma adress i `NEXT_PUBLIC_SITE_URL` och OAuth-appens callback. Starta om utvecklingsservern efter ändrade miljövariabler.

Kopiera inte `node_modules` eller `.next` mellan operativsystem. Kör `npm ci` på varje utvecklingsdator; native beroenden som Sharp väljs för rätt plattform.

## Kontroller och CI

```sh
npm run typecheck
npm test
npm run format:check
npm run build
```

Git måste finnas i PATH för integrationstesterna. Tester och byggen behöver inga riktiga databas- eller OAuth-hemligheter. `npm run start` startar ett färdigt produktionsbygge; produktion kräver en konfigurerad HTTPS-origin.

GitHub-workflowen **Tests** kör installation, samtliga tester, typkontroll och produktionsbygge på **`ubuntu-latest` med Node.js 24**. Den startar vid pull requests, pushar till `main` och manuellt via **Actions → Tests → Run workflow**. Actions är fästa vid commit-SHA:n och uppdateras genom Dependabot.

## Språk och UI-texter

Alla fasta UI-texter finns i `lib/locales/sv.json` och `lib/locales/en.json`, med samma nycklar i båda filerna. Profilens `language` i `profile.json` styr både serverrenderade sidor och interaktiva formulär. Ändra språk under **Inställningar → Din profil → Språk** och spara profilen. Befintliga profiler utan språkfält använder svenska; webbläsarens språk ersätter inte profilvalet.

Återanvänd befintliga nycklar för samma text och låt CSS styra casing i rubriker och enheter. Testerna kontrollerar att filerna saknar dubbla nycklar och dubbla texter, även varianter som bara skiljer i casing.

Vid nya texter lägger du till en nyckel i båda språken och använder `tr(...)` i gränssnittet. Översätt endast appens fasta texter; användarinmatade värden och historiska poster behålls. JSON-backup bevarar språkvalet och rådata. CSV-rubriker följer valt språk, medan resultatvärden förblir oförändrade.

## Lagring och foton

Profiler, vapen, pass och okopplade serier lagras som JSON. Foton ligger i ett separat användarprefix och publiceras atomiskt med tillhörande poster. Bilden får en egen commit; identiska optimerade bilder återanvänds per användare. Webbläsaren begränsar bilder till **1600 pixlar på längsta sidan och 180 kB**. JPEG som redan uppfyller gränserna och saknar metadata används utan omkomprimering. Andra bilder konverteras automatiskt till JPEG; för stora JPEG-bilder optimeras och metadata tas bort. Filvalet kräver inte ett visst format eller en MIME-typ, men webbläsaren måste kunna avkoda bilden. Ett original får vara högst **25 MB**; högst **tio nya foton** kan skickas i ett anrop. Servern validerar bilden utan att komprimera om den och behåller ingen permanent upload-kopia.

Inloggningssessioner använder stateless HMAC-signerade cookies med åtta timmars livslängd och kontroll av webbplatsens origin och aktuell tillåtelselista. Sessionskontroller och utloggning gör inga Git-anrop och kräver ingen extra tjänst. Utloggning raderar cookien i webbläsaren; en kopierad cookie är fortfarande giltig till utgångstiden. Rotera sessionshemligheten eller ta bort användarens ID ur tillåtelselistan för att återkalla åtkomst. Befintliga sessionscookies från den tidigare Git-registret accepteras inte; logga in på nytt efter uppdateringen.

Git lagrar fortfarande engångsflöden för OAuth och gemensamma trafikgränser. OAuth-flöden och godkända records/photo-API-anrop kan därför skapa säkerhetscommits. Journalens poster och foton lagras fortsatt i Git.

Radering tar bort uppgifter från aktuell journal; **tidigare versioner finns kvar i Git-historiken och dess kopior**. JSON-export är en flyttbar journalbackup, medan Git-backup även bevarar historiken. Import är begränsad till **3 MB per anrop**, inklusive bilddata.

Befintliga WebP-foton förblir läsbara och bevaras i JSON-export/import. Nya uppladdningar lagras som JPEG; äldre foton och deras Git-historik ändras inte.

## Dokumentation

- [Installation, GitHub-ID och Vercel](docs/SETUP.md)
- [Arkitektur och lagring](docs/ARCHITECTURE.md)
- [Regelkällor och nya upplagor](docs/RULES.md)
- [Tester och kontroller](docs/TESTING.md)
- [Säkerhetsgranskning och åtgärder](docs/SECURITY-AUDIT-2026-10-12.md)
