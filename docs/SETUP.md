# Installation av MyShotLog

## Förbered lokal utveckling

Installera **Node.js 24** och **Git** och kontrollera `node --version`, `npm --version` och `git --version` i en ny terminal. Node.js 24 används även i CI. Om du väljer Node.js 22 kräver testverktygen minst 22.12.0. På Windows fungerar PowerShell eller cmd med Git for Windows i PATH; WSL och OpenSSL behövs inte.

Kör från projektets rot:

```sh
npm ci
npm run setup:local
```

`setup:local` kopierar `.env.example` till `.env.local` om filen saknas. En befintlig fil skrivs inte över. Fyll i konfigurationen nedan innan du startar appen. Tester och byggen kräver inga riktiga konton eller lagringshemligheter, men inloggning och användning av journalen kräver konfigurerad Git-lagring och GitHub OAuth.

## GitHub som databas

1. Skapa ett separat **privat GitHub-repository** för journaldata. Repositoryt kan vara tomt. MyShotLog skapar en första metadatacommit vid första skrivningen, normalt när inloggningen startas. Om repositoryt redan har commits måste vald branch finnas. Datarepot ska inte vara kodrepot eller utlösa nya app-deployments vid journaländringar.
2. Skapa en fine-grained personal access token begränsad till datarepot med **Contents: read and write**. Organisationer kan behöva godkänna token. Branchregler måste tillåta appens direkta commits.
3. Ange lagringsvariablerna i `.env.local`:

```dotenv
GIT_DATABASE_PROVIDER=github
GIT_DATABASE_REPOSITORY=YOUR_OWNER/YOUR_PRIVATE_DATA_REPO
GIT_DATABASE_BRANCH=main
GIT_DATABASE_PREFIX=myshotlog/v1
GIT_DATABASE_TOKEN=YOUR_REPOSITORY_SCOPED_TOKEN
GIT_DATABASE_API_URL=https://api.github.com
```

Ersätt platshållarna. Ange prefixet uttryckligen; behåll det befintliga värdet om installationen redan har data. Ett annat prefix väljer en annan plats i repositoryt och flyttar inga filer.

GitHub-adaptern behöver ingen Git-binär eller beständig serverdisk när appen körs. Git behövs fortfarande lokalt för utveckling och integrationstester. Repository-åtkomst ger tillgång till hela datahistoriken; begränsa även medlemmar, integrationer och backups.

## Avslutande snedstreck

Både `next.config.ts` och `vercel.json` använder `trailingSlash: true`. Behåll inställningarna lika för att undvika redirect-loopar. Appens sidor och API-rutter använder avslutande snedstreck, exempelvis `/sessions/` och `/api/records/`. Statiska filer som `/brand/MyShotLog-logo.svg` får inget extra snedstreck.

Vid uppgradering ska GitHub OAuth-appens **Authorization callback URL** ändras till `https://YOUR_SITE/auth/github/callback/`. `NEXT_PUBLIC_SITE_URL` förblir endast origin. Publicera om appen efter konfigurationsändringen.

## Läscache

Journal- och fotoläsningar använder en minnescache per serverinstans. Standardlivslängden är **15 sekunder**, med högst **64 snapshots och 32 MiB filinnehåll/sökvägar**. Samtidiga läsningar av samma prefix delar en hämtning. Cachen kräver ingen extra tjänst och skriver ingen journal- eller bilddata till serverdisk.

```dotenv
GIT_DATABASE_READ_CACHE_SECONDS=15
```

Ange ett heltal mellan **0 och 300**; `0` stänger av läscachen. Appens skrivningar tömmer berörda cacheposter före och efter publicering, inklusive profil, pass, vapen, snabbserier, importer och foton. Transaktioner, OAuth-engångsflöden och trafikräknare läser alltid ett färskt Git-snapshot. Privata HTTP-svar behåller `no-store` och autentisering görs för varje begäran.

Minnet delas inte mellan Vercel-instanser. Ändringar från en annan instans eller direkt i Git blir synliga när den lokala cacheposten löper ut; en kallstart börjar med tom cache. Ändrad token, repository, branch, API-host eller Git-remote ger en separat cache. Efter utgång används ingen gammal post som reserv vid lagringsfel. API:s trafikbegränsning kan fortfarande kräva Git-anrop även när journal- eller fotoläsningen träffar cachen.

## GitHub-inloggning

1. Registrera en **GitHub OAuth App** via GitHub → Settings → Developer settings → OAuth Apps. Detta är separat från datarepo-tokenen.
2. För lokal utveckling, använd `http://localhost:3000` som Homepage URL och `http://localhost:3000/auth/github/callback/` som Authorization callback URL. Skapa en separat OAuth-app för produktion med din stabila HTTPS-domän och samma callback-sökväg med avslutande snedstreck (`/auth/github/callback/`). Se [GitHubs OAuth-guide](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).
3. Generera OAuth-appens klienthemlighet och fyll i följande:

```dotenv
GITHUB_CLIENT_ID=YOUR_OAUTH_CLIENT_ID
GITHUB_CLIENT_SECRET=YOUR_OAUTH_CLIENT_SECRET
GITHUB_ALLOWED_USER_IDS=YOUR_GITHUB_NUMERIC_USER_ID
AUTH_SESSION_SECRET=YOUR_RANDOM_SECRET_AT_LEAST_32_BYTES
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Generera sessionshemligheten med detta kommando på alla tre operativsystem:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

`NEXT_PUBLIC_SITE_URL` ska vara webbplatsens exakta origin, utan sökväg, query eller fragment. Använd samma adress i webbläsaren och som bas för OAuth-appens callback. Produktion kräver HTTPS; utveckling tillåter HTTP för `localhost` och `127.0.0.1`. Blandning av adresserna kan ge fel vid inloggning eller sparande.

`GITHUB_ALLOWED_USER_IDS` innehåller ett eller flera numeriska personliga GitHub-ID:n, separerade med kommatecken. En tom lista stoppar inloggning. Användarnas OAuth-inloggning begär inga repository-scopes; datarepot nås med serverns separata token. Användarna behöver därför inte vara medlemmar i datarepot.

Alla Git-/auth-hemligheter är servervariabler. Ge dem aldrig `NEXT_PUBLIC_`-prefix och lägg dem inte i koden eller datarepot. `.env.local` är ignorerad av Git.

## Hitta användarens numeriska GitHub-ID

### I webbläsaren

1. Öppna personens GitHub-profil och kopiera användarnamnet från adressen.
2. Öppna `https://api.github.com/users/YOUR_LOGIN`, där `YOUR_LOGIN` ersätts med användarnamnet. Offentliga personliga konton kan slås upp utan token.
3. Kontrollera att `login` och `html_url` avser rätt profil och att `type` är `User`. Kopiera det numeriska fältet **`id`**, inte `node_id`.
4. Lägg ID:t i `GITHUB_ALLOWED_USER_IDS`. Upprepa för fler personer; organisations-ID:n ger ingen användarinloggning.

Exempel med fiktiva värden:

```json
{
  "login": "ditt-anvandarnamn",
  "id": 123456,
  "html_url": "https://github.com/ditt-anvandarnamn",
  "type": "User"
}
```

```dotenv
GITHUB_ALLOWED_USER_IDS=123456,789012
```

### I terminalen

Detta Node.js-kommando fungerar i PowerShell, cmd, bash och zsh. Ersätt `YOUR_LOGIN`:

```sh
node -e "fetch('https://api.github.com/users/YOUR_LOGIN').then(r=>{if(r.ok)return r.json();throw new Error('HTTP '+r.status)}).then(({login,id,type})=>console.log({login,id,type})).catch(e=>{console.error(e.message);process.exitCode=1})"
```

Om GitHub CLI är installerat och inloggat kan du visa ditt eget konto:

```sh
gh api user --jq "{login: .login, id: .id, type: .type}"
```

Vid `404`, kontrollera användarnamnet. Enterprise Managed Users kan kräva autentiserad uppslagning med organisationsåtkomst. Vid API-gräns, vänta eller använd autentiserad GitHub CLI. GitHubs numeriska ID består vid namnbyte; se [användar-API:t](https://docs.github.com/en/rest/users/users).

## Starta och kontrollera lokalt

Efter konfigurationen:

```sh
npm run dev
```

Öppna `http://localhost:3000` och välj **Logga in med GitHub**. Vid ofullständig konfiguration visar startsidan installationsguiden. Starta om servern efter ändrade miljövariabler.

Kör kontrollerna före en ändring publiceras:

```sh
npm run typecheck
npm test
npm run format:check
npm run build
```

`npm run build` skapar produktionsbygget; `npm run start` kör det. För en egen produktionsserver behöver du en HTTPS-proxy och korrekt HTTPS-origin redan när bygget skapas, eftersom `NEXT_PUBLIC_`-värden byggs in i appen. Använd `npm run dev` för HTTP-utveckling på localhost.

Kör `npm ci` på varje utvecklingsdator och kopiera inte `node_modules` mellan operativsystem. Vid byte av plattform i samma checkout kan byggcachen tas bort med:

```sh
node -e "require('node:fs').rmSync('.next', { recursive: true, force: true })"
```

## Publicera på Vercel

1. Importera **kodrepot** som ett Next.js-projekt. Välj Node.js 24 och projektets rot som Root Directory.
2. Ange lagrings- och OAuth-variablerna ovan i rätt Vercel-miljö. Använd GitHub-adaptern och den separata produktions-OAuth-appen. `NEXT_PUBLIC_SITE_URL` måste vara din stabila HTTPS-origin.
3. Kopiera miljövärden utan eventuella omgivande shell-citat från `.env.local`. Publicera om efter ändringar.
4. Kontrollera inloggning, sparande, utloggning och export på den konfigurerade domänen. Preview-installationer som ska användas behöver egna matchande origin-/OAuth-inställningar; miljövärden från en annan origin räcker inte.

Vercels tillfälliga filsystem ska inte användas som lokal databas. GitHub-lagringen och säkerhetstillståndet delas mellan instanser med samma konfiguration. Plattformens trafikskydd kan stoppa större attacker innan de når appen.

### Vercel Web Analytics

`@vercel/analytics/next` finns i rotlayouten. Aktivera **Web Analytics** för kodprojektet i Vercels dashboard och gör en ny deployment. Inga ytterligare miljövariabler behövs för standardintegrationen. Kontrollera därefter sidvisningar i dashboarden enligt [Vercels snabbstart](https://vercel.com/docs/analytics/quickstart). Lokal utveckling använder SDK:ns utvecklingsläge. Den befintliga CSP:n stödjer det dynamiska scriptet och insamling via samma origin.

### Vercel Speed Insights

`@vercel/speed-insights/next` mäter webbläsarens prestanda via rotlayouten. Aktivera **Speed Insights** i kodprojektets Vercel-dashboard och gör en ny deployment enligt [Vercels snabbstart](https://vercel.com/docs/speed-insights/quickstart). Inga nya miljövariabler eller apphemligheter behövs. Komponenten körs bara när Vercel sätter `VERCEL=1`, så vanlig lokal utveckling och CI skickar inga prestandamätningar.

Rapporterade adresser och routes innehåller endast sidkategorier: pass- och vapen-ID:n ersätts med `[id]`, och frågeparametrar samt fragment tas bort. OAuth-callbacks, foto-/API-adresser och okända sidor rapporteras inte. Filtreringen gäller Speed Insights; Web Analytics behåller sin befintliga integration. Den befintliga CSP:n stödjer scriptet och insamling via samma origin. Kontrollera mätningarna i dashboarden efter deployment.

### Vittnesintyg utan inloggning

Vittnesfunktionen använder samma privata Git-repository, origin, tillåtelselista och `AUTH_SESSION_SECRET` som resten av appen. Inga nya tjänster eller miljövariabler behövs. Rotering av sessionshemligheten gör befintliga inbjudningar ogiltiga. Använd den stabila produktionsdomänen; vittnet måste kunna öppna `/witness/` och posta till `/api/witness/` utan extra skyddsinloggning hos hostingplattformen.

Vittnessidor skickar inga Analytics- eller Speed Insights-händelser. Namn, PNG-namnteckning och resultatögonblicksbild lagras i den privata journalen. Se [användning och livscykel](WITNESSES.md).

## Annan Git-server eller lokal databas

För egen server, ange `GIT_DATABASE_PROVIDER=git` och `GIT_DATABASE_REMOTE` till ett SSH-/HTTPS-remote eller en absolut sökväg till ett bare repository. Ange också branch och prefix. GitHub OAuth-konfigurationen behövs även med denna lagringsadapter.

Servern måste ha Git och autentisering utan interaktiva frågor. Använd SSH-nyckel eller credential helper för remotes; lägg inte tokens i remote-URL:en. För lokalt bare repo:

```sh
git init --bare /ABSOLUTE/PERSISTENT/PATH/myshotlog-data.git
```

På Windows kan du exempelvis använda `git init --bare "C:/Users/YOUR_NAME/myshotlog-data.git"`. Ange samma absoluta sökväg med snedstreck i `GIT_DATABASE_REMOTE`. Sökvägar med mellanslag stöds; omge värdet med citattecken i `.env.local`.

Ett tomt bare repo får sin första commit när appen registrerar det första OAuth-flödet. Det behöver ingen manuell initial commit. Lagra repot utanför källkoden på beständig disk och skydda det som journaldata. Denna adapter är avsedd för en egen server med Git, inte Vercels standardruntime.

## Konton och befintliga Git-journaler

Journalens UUID härleds från GitHub-kontots numeriska ID. Byten av användarnamn eller e-post flyttar inte data. För att koppla ett konto till ett redan befintligt journalprefix kan du ange den aktuella, valfria inställningen:

```dotenv
GITHUB_USER_ID_MAP='{"123456":"EXISTING_JOURNAL_UUID"}'
```

Hämta UUID:t från `<prefix>/users/<UUID>/` och kontrollera kopplingen manuellt. Varje tillåtet konto måste få ett unikt journal-UUID. Behåll mappingen så länge samma koppling ska gälla. Att ändra mapping eller prefix flyttar inga poster utan ändrar vilken journal kontot öppnar.

Ta bort ID:t ur tillåtelselistan och starta om/publicera om för att återkalla åtkomst. Roterad `AUTH_SESSION_SECRET` ogiltigförklarar samtliga sessioner. Avaktivera äldre deployment-URL:er med gammal konfiguration vid återkallad åtkomst.

Sessioner är stateless och gäller högst åtta timmar. Signatur, tokenversion, utfärdandetid, utgångstid, origin och aktuell tillåtelselista kontrolleras lokalt, utan Git-läsning eller extra tjänst. Utloggning raderar webbläsarens cookie utan Git-skrivning. En kopierad cookie kan fortfarande användas fram till utgångstiden; utloggning är inte återkallelse på servern. Ändrat GitHub-lösenord eller återkallad OAuth-auktorisering återkallar inte appens befintliga sessioner omedelbart. Använd tillåtelselistan eller sessionshemligheten för omedelbar avstängning. OAuth-tokenen används för identitetskontroll och sparas inte.

Efter uppdateringen till stateless sessionscookies måste befintliga användare logga in på nytt. Äldre cookies med Git-registrets tokenversion accepteras inte, så tidigare utloggade tokens blir inte giltiga igen. Gamla sessionshashar ignoreras och utelämnas vid nästa skrivning av säkerhetstillstånd; journaldata påverkas inte.

## Säkerhetstillstånd och trafikgränser

Engångsflöden för OAuth och trafikräknare ligger under `<prefix>/security/<installationshash>/state.json`. Inga bearer-cookies, OAuth-koder, PKCE-hemligheter eller råa IP-adresser sparas. IP-baserade räknarnycklar använder HMAC. Installationshashen beror på origin och sessionshemlighet. Alla instanser som ska dela tillstånd måste använda samma origin, hemlighet, lagringsrepo, branch och prefix.

OAuth-flöden och godkända API-anrop kan skapa säkerhetscommits utöver journalens postcommits. Utfärdande av sessionscookies efter godkänd OAuth, sessionskontroller och utloggning använder inget Git-register. OAuth-flöden förbrukas atomiskt före kodutbyte, även om GitHub avvisar koden. Utgångna poster rensas vid nästa säkerhetsskrivning. Lagringsfel stoppar åtgärden; appen använder ingen oskyddad lokal fallback.

Fasta fönster börjar vid första godkända anropet:

| Åtgärd                     | Per klient/användare | Hela installationen |
| -------------------------- | -------------------- | ------------------- |
| Starta OAuth               | 5 per 10 minuter     | 20 per 10 minuter   |
| Förbruka OAuth-flöde       | 10 per 10 minuter    | 40 per 10 minuter   |
| Läsa via records/photo-API | 60 per minut         | 300 per minut       |
| Skriva via records-API     | 30 per minut         | 120 per minut       |

Gränserna finns i `lib/auth/security-store.ts`. För många anrop ger HTTP 429 och `Retry-After`. Export och bildhämtning räknas också som API-läsningar. Git innebär extra API-anrop; även avvisad trafik kan kräva läsningar.

Vercel använder plattformens `x-vercel-forwarded-for`. På egen server delar klienter inloggningsgräns tills en säker proxy konfigureras. Ange `AUTH_TRUSTED_IP_HEADER=x-real-ip` endast om proxyn **ersätter** inkommande värden och direktåtkomst till servern är blockerad. Användarbaserade API-gränser gäller oberoende av klient-IP. Se [Vercels headerdokumentation](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for).

Sidornas CSP använder en ny script-nonce och dynamisk rendering. Script får inte använda inline-kod utan nonce eller eval i produktion; dynamiskt laddade script från betrodda script stöds genom `strict-dynamic`. Diagrammens stilattribut och fotoförhandsvisningar stöds. Zod använder `jitless`-läge. Records-API kräver Origin som motsvarar `NEXT_PUBLIC_SITE_URL` och läser högst **3 MB** från originalströmmen; API-rutter går förbi Proxy:s body-buffring.

## Uppgradering av appnamnet

Nya standardlagringar använder `myshotlog/v1`. Ett uttryckligt `GIT_DATABASE_PREFIX` behålls som angivet; ändra inte sökvägen för en befintlig journal utan att flytta data. Om variabeln saknas använder appen en befintlig journal under den äldre standardsökvägen när ingen journal finns under den nya. Journalernas deterministiska UUID:n behålls. Den ursprungliga ID-namnrymden och läsning av äldre backupformat/sökvägar är interna kompatibilitetsundantag, så att befintliga data förblir åtkomliga.

Inloggnings- och OAuth-cookies använder nu MyShotLog-namn. Logga in igen efter uppgraderingen.

## Tom journal och första import

Efter inloggning visar en journal utan vapen, pass eller snabbserier en importpanel på **Översikt**. Välj en MyShotLog JSON-backup för att återställa data, eller registrera ett första pass. Profilen behöver inte sparas först; då kan importen använda backupens profil. Import finns också under **Inställningar** och använder samma validering, storleksgräns och daterade regelbedömning.

Ett helt tomt privat GitHub-repository stöds. Första skrivningen skapar `.myshotlog.json` via [GitHubs Contents API](https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-your-git-database), därefter publiceras postcommits atomiskt. Inga journalposter finns i metadatacommitten. En felaktig branch i ett befintligt repo, saknad behörighet och anslutningsfel visas fortfarande som fel; de behandlas inte som en tom journal.

## Export, import och backup

Exportera från **Inställningar**. `myshotlog-v2.json` använder `format: "myshotlog"` och `version: 2`. JSON innehåller profil, vapen, passens råresultat, födelseuppgifter fångade per serie (`recordingContexts`), okopplade serier och foton. Bedömningar, regelversioner och regelsnapshots exporteras inte. CSV innehåller passens resultat och kan inte användas som fullständig import.

Vid import skapas nya brons/silver/guld-bedömningar med katalogversionen som gällde på passdatumet. Datum utanför katalogens täckning blir ej bedömda. De exporterade födelseuppgifterna används även om destinationsprofilen har korrigerats; okända födelseuppgifter förblir okända. Behåll formatfält, post-ID:n och seriens födelseuppgifter oförändrade. Äldre version 1-backuper accepteras för kompatibilitet, men deras bedömningar och regelsnapshots återanvänds inte.

Import är atomär och begränsad till **3 MB per anrop**, inklusive bilddata. Befintliga poster med samma ID hoppas över; de skrivs inte över. Profilen importeras endast om ingen profilfil redan finns. Importera därför innan du sparar en ny profil om den exporterade profilen ska användas. En stor fullständig export kan vara för stor för återimport och kräver en mindre, giltig export eller separat repository-hantering.

Git-backup bevarar även historiken:

```sh
git clone --mirror REMOTE BACKUP_DIRECTORY
```

Radering i appen tar bort aktuella journalposter men Git behåller äldre versioner och foton. Backups och kloner måste skyddas lika noggrant som originalet. Fullständig historikradering kräver separat repository-administration.

Behåll en framåtgående databranch och undvik force-push eller manuella filändringar under appskrivningar. Efter återställning av en backup eller säkerhetshistorik ska `AUTH_SESSION_SECRET` roteras, för att ogiltigförklara befintliga cookies och undvika återanvändning av återställt OAuth-tillstånd. GitHub API-gränser, trädstorlek och funktionernas körtid begränsar kapaciteten; installationen är avsedd för små personliga journaler.

## Foton och passvillkor

Vapen kan ha en förvald gren. Avstånd, måltyp, starttid och skjuttid anges på passet. Måltyp och kaliber väljs i dropdowns. Platsfältet föreslår tidigare sparade platser. Nya precisionspass börjar med 25 meter, pistoltavla precision och 300 sekunder som ändringsbara standardvärden.

Varje serie kan ha ett tavelfoto. Klicka på en miniatyr för att visa fotot i ett överlägg. En laddningsindikator visas tills bilden har hämtats. Stäng med kryssknappen, Escape eller genom att klicka utanför överlägget; vid hämtningsfel kan du försöka igen. Val av bild startar automatiskt en separat förberedelse före uppladdning. JPEG inom gränserna och utan metadata används direkt, medan andra bildformat konverteras och för stora bilder optimeras. Ingen extra knapp behövs, och filvalet begränsas inte till JPEG eller en viss MIME-typ. Webbläsaren måste kunna öppna originalet och skapa JPEG; format som den inte kan avkoda visas med ett felmeddelande. Befintliga WebP-foton förblir läsbara och bevaras i JSON-export/import. Nya uppladdningar lagras som JPEG; äldre foton och deras Git-historik ändras inte. Originalgränsen är **25 MB**; uppladdningen begränsas till **1600 pixlar på längsta sidan och 180 kB** per foto. Högst **tio nya foton** kan skickas samtidigt. Servern validerar format, mått, storlek, metadata och hash utan att komprimera om bilden. Bilder lagras i Git och visas genom en privat användarstyrd rutt. Appservern behåller ingen permanent fotokopia; Git-adaptern städar sina tillfälliga repositories även vid fel.

## Kalibrar, mål och regelupplagor

`lib/data/calibers.json` är en JSON-array med unika `value` (lagringsvärden) och `labelKey` (översättningsnycklar). Lägg till exempelvis:

```json
{ "value": ".41 Magnum", "labelKey": "caliber.magnum41" }
```

Lägg samma nyckel `caliber.magnum41` med visningstexten i både `lib/locales/sv.json` och `lib/locales/en.json`. Namn som `.41 Magnum` kan vara identiska i båda språken. Återanvänd befintliga nycklar när visningstexten redan finns. Appen validerar nycklarna vid inläsning, så ett nytt alternativ måste ha text i båda språkfilerna.

Måltyper ligger i `lib/data/targets.json` och använder samma `value`/`labelKey`-format. Behåll koderna `precision25`, `B100`, `C30` och `sixth`, eftersom regelmotorn använder dem. Nya listalternativ lägger inte automatiskt till beräkningsregler. Ändra inte befintliga `value` när du översätter etiketter; de finns i lagrade vapen, historiska ögonblicksbilder och pass. Okända eller egna värden visas oförändrade även om de saknas i katalogen. Starta om utvecklingsservern eller bygg/publicera om efter ändringar.

Regelkatalogen är `lib/rules/versions.json`. Automatisk märkesbedömning finns för precision och tillämpning; andra grenar eller datum utan katalogversion kan visas som ej bedömda. Den nuvarande katalogperioden är `2026-01-01` till före `2028-01-01`. Detta är appens konfigurerade täckning, inte en garanti att alla efterföljande regeländringar är införda. Se [regelkällor och täckning](RULES.md).

Lägg till nya regelversioner med unikt ID och giltighetsperiod utan överlapp. Behåll tidigare perioders regler och trösklar för att bevara historiska beräkningar. Kör:

```sh
npm run rules:sync
npm run typecheck
npm test
npm run build
```

`rules:sync` kontrollerar reglerna och uppdaterar `public/rule-versions.json`; det hämtar inte regler från nätet. Publicera om appen efter ändringen. Bedömningarna väljs efter passdatum; det finns ingen ombedömningsåtgärd eller signaturkontroll. Sparade födelseuppgifter används när de finns i seriens underlag, annars profilen. Precisionens åldersavdrag baseras på året före passåret, inte dagens ålder. Utan födelseuppgifter används ordinarie gränser.

## CI

Workflowen **Tests** i `.github/workflows/tests.yml` kör `npm ci`, `npm test`, typkontroll och produktionsbygge på **`ubuntu-latest` med Node.js 24**. Den utlöses av pull requests, push till `main` och `workflow_dispatch`. GitHub-hemligheter för appen eller åtkomst till datarepot behövs inte. Starta manuellt via **Actions → Tests → Run workflow**; workflowfilen behöver finnas på standardbranchen. Se [GitHubs guide](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

Actions är fästa vid commit-SHA:n. Dependabot kontrollerar GitHub Actions varje vecka och kan öppna uppdaterings-PR:er. Lokal utveckling och tester använder fortfarande samma npm-kommandon på Windows, macOS och Linux.

## Språk i profilen

Appen har svenska och engelska. Under **Inställningar → Din profil → Språk** väljer användaren **Svenska** eller **English** och sparar profilen. Valet lagras som `language: "sv"` eller `language: "en"` i användarens `profile.json` i Git-databasen och gäller hela webbplatsen efter sparandet. Svenska är standard om fältet saknas. Ingen extra miljövariabel eller webbläsarinställning behövs. Inloggningssidor utan en autentiserad profil använder svenska.

Egna namn, vapenuppgifter, platser, program, seriebeteckningar och anteckningar översätts inte. JSON-export bevarar profilens språkval; CSV använder valt språk för rubrikerna. Fasta UI-texter underhålls i `lib/locales/sv.json` och `lib/locales/en.json`; lägg till samma nyckel med en svensk och en engelsk text vid nya kontroller.

## Uppdateringar i appen

MyShotLog visar en notis när den driftsatta installationen är efter uppströmsversionen. Öppna **Inställningar → Appuppdateringar → Öppna fork på GitHub** och välj **Sync fork → Update branch** på GitHub. Vercel driftsätter sedan den anslutna produktionsbranchen. Appen kontrollerar endast versioner och ändrar aldrig kodforken. Fork och driftsättning kontrolleras var för sig.

Se [engångsinställning, behörigheter och uppdateringsflöde](UPDATES.md). Kodtoken ska endast nå kodforken, med Contents och Workflows: Read and write, och ligga i Vercels Production-miljö. `GIT_DATABASE_TOKEN` och journalrepositoryt är separata. Förhandsversioner kan inte synkronisera. Egna konflikter och branchskydd hanteras utan force-push.

## Kontrollera installationen

Öppna **Inställningar → Installationskontroll → Kontrollera installation** när du är inloggad. Kontrollen visar saknade eller ogiltiga miljöinställningar, en webbplatsadress som inte matchar den aktuella adressen, journalrepositoryts sekretess och branchåtkomst samt inställningar för appuppdateringar. Ett tomt repository markeras som redo att initieras, inte som ett åtkomstfel. Om journalen inte kan läsas visas kontrollen ändå på inställningssidan.

Kontrollen gör endast läsanrop; inga poster eller testcommits skapas och hemliga värden visas aldrig. Skrivbehörighet, OAuth-appens registrerade returadress och Vercels projektinställningar behöver bekräftas manuellt enligt resultatet. Efter att du ändrat miljövariabler måste du driftsätta om och köra kontrollen på nytt. Kontrollpanelen kräver fungerande inloggning; om grundläggande inloggningsinställningar saknas går appen till installationssidan. Upprepade kontroller begränsas per användare och serverinstans, med samma trafikgräns som appuppdateringskontroller.

## Hjälp och felrapporter

Appens **Rapportera ett problem**-länk öppnar ett formulär för fel eller förbättringar. Beskriv så utförligt som möjligt och öppna det förifyllda GitHub-utkastet med **Fortsätt på GitHub**. Du skickar det först när du själv skapar ärendet på GitHub. Granska rapporten innan du publicerar den; inkludera inga tokens eller personliga journaluppgifter. För rapporter som är för långa för länken får du hela texten att kopiera till GitHubs **Additional details**. Funktionen behöver inga nya installationssteg eller extra behörigheter. Se [README](../README.md#rapportera-problem-och-föreslå-förbättringar).
