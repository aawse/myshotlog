# MyShotLog

Svensk träningsjournal för personligt pistolskytte, byggd med Next.js och React. Inloggning sker med GitHub-konton. Journalen lagras i ett **konfigurerbart privat Git-repository**, med en commit per sparad post. GitHub API används på Vercel; en Git-adapter finns för egen server och lokala bare repositories.

## Funktioner

- Vapen med tillverkare, modell, kaliber och förvald gren.
- Pass med platsförslag, starttid och gemensamt avstånd, måltyp och skjuttid för serierna.
- Resultat med brons-, silver- och guldmarkeringar för precision och tillämpning. Regelversion väljs efter passdatum; övriga grenar kan registreras utan automatisk märkesbedömning.
- Födelsedatum i profilen för precisionens åldersavdrag. Sparade födelseuppgifter används när de finns i seriens underlag; annars används profilen.
- Mobilanpassad **Snabbserie** som sparas direkt och senare kan kopplas till ett pass med samma datum och gren. Nätanslutning krävs.
- Ett valfritt tavelfoto per serie, optimerat till WebP i webbläsaren före uppladdning.
- JSON-export/import med profil, vapen, pass, bedömningar, okopplade serier och foton. CSV exporterar resultat från pass till kalkylblad.
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

## Lagring och foton

Profiler, vapen, pass och okopplade serier lagras som JSON. Foton ligger i ett separat användarprefix och publiceras atomiskt med tillhörande poster. Bilden får en egen commit; identiska optimerade bilder återanvänds per användare. Webbläsaren begränsar bilder till **1600 pixlar på längsta sidan och 180 kB**. Ett original får vara högst **25 MB**; högst **tio nya foton** kan skickas i ett anrop. Servern validerar bilden utan att komprimera om den och behåller ingen permanent upload-kopia.

Git lagrar även gemensamt säkerhetstillstånd för sessioner, engångsflöden för OAuth och trafikgränser. Det innebär ytterligare Git-läsningar och säkerhetscommits. Utloggning återkallar sessionen på servern innan cookien tas bort.

Radering tar bort uppgifter från aktuell journal; **tidigare versioner finns kvar i Git-historiken och dess kopior**. JSON-export är en flyttbar journalbackup, medan Git-backup även bevarar historiken. Import är begränsad till **3 MB per anrop**, inklusive bilddata.

## Dokumentation

- [Installation, GitHub-ID och Vercel](docs/SETUP.md)
- [Arkitektur och lagring](docs/ARCHITECTURE.md)
- [Regelkällor och nya upplagor](docs/RULES.md)
- [Tester och kontroller](docs/TESTING.md)
- [Säkerhetsgranskning och åtgärder](docs/SECURITY-AUDIT-2026-10-12.md)
