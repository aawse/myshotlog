# MyShotLog

Personlig journal för skytte, träning och tävling, byggd med Next.js och React. Inloggning sker med GitHub-konton. Journalen lagras i ett **konfigurerbart privat Git-repository**, med en commit per sparad post. GitHub API används på Vercel; en Git-adapter finns för egen server och lokala bare repositories.

## Funktioner

- Svenska och engelska, med språkval sparat i profilen. Svenska används om inget språk har valts. Egna namn, platser och anteckningar översätts inte.
- Vapen med tillverkare, modell, kaliber och förvald gren.
- Pass med platsförslag, starttid och gemensamt avstånd, måltyp och skjuttid för serierna.
- Resultat med brons-, silver- och guldmarkeringar för precision och tillämpning. Regelversion väljs efter passdatum; övriga grenar kan registreras utan automatisk märkesbedömning.
- Födelsedatum i profilen för precisionens åldersavdrag. Sparade födelseuppgifter används när de finns i seriens underlag; annars används profilen.
- Mobilanpassad **Snabbserie** som sparas direkt och senare kan kopplas till ett pass med samma datum och gren. Nätanslutning krävs.
- Ett valfritt tavelfoto per serie. Välj en bild; formatet avgör automatiskt om den kan användas direkt eller behöver konverteras och optimeras i webbläsaren före uppladdning.
- Lokal IndexedDB-cache med köade sparningar, batchsynkning, commit-kontroll och konfliktgranskning. En öppen app kan läsa och spara offline; synkstatus visar vad som nått GitHub.
- Konfigurerbar servercache och återanvändning av immutabla Git-blobbar för snabbare läsningar.
- JSON-export/import med profil, vapen, råresultat, seriens födelseuppgifter, okopplade serier, foton och vittnesintyg. Bedömningar exporteras inte; vid import beräknas de med reglerna för passdatumet. CSV exporterar resultat från pass till kalkylblad.
- Valfria vittnesintyg för en serie eller ett helt pass. Dela en engångslänk eller QR-kod; vittnet skriver sitt namn och ritar en namnteckning utan konto. Intyget gäller resultaten som visades vid underskriften och ändrar inte märkesbedömningen. Se [vittnesfunktionen](docs/WITNESSES.md).
- PDF-utskrift från passets sida med tydligt datum och plats, resultat, regelversioner och vittnesnamn samt namnteckningar. Tidigare intyg efter en ändring märks och visar de ursprungliga uppgifterna. Tavelfoton ingår inte. QR-koden länkar till passet och kräver vanlig inloggning. PDF-filen skapas i minnet och sparas inte i Git eller på serverns disk.
- Uppdateringsnotis när den driftsatta appen saknar ändringar från uppströmsversionen. Kodforken synkroniseras manuellt via GitHubs Sync fork; Vercel driftsätter via Git-integrationen. Se [appuppdateringar](docs/UPDATES.md).
- Vercel Web Analytics och Speed Insights via rotlayouten; aktiveras för projektet i Vercels dashboard. Speed Insights rapporterar sidkategorier utan journal-ID:n, frågeparametrar eller fragment.

Appen används för personlig resultatuppföljning. Serier behöver inga signaturer eller verifieringar. Regelunderlag och begränsningar finns i [regeldokumentationen](docs/RULES.md).

Designen delas med den publika webbplatsen och PDF-utskrifterna. Se [varumärkes- och designsynkronisering](docs/BRANDING.md) för uppdateringar och kontroll av typsnitt, färger och logotyper.

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

Se även [beroenden och uppdateringar](docs/DEPENDENCIES.md) samt [validering, prestanda och SEO, 13 oktober 2026](docs/VALIDATION-2026-10-13.md).

Resultat för oanvänd kod och komprimerad JavaScript-storlek finns i [paketgranskningen, 16 oktober 2026](docs/BUNDLE-AUDIT-2026-10-16.md).

## Språk och UI-texter

Alla fasta UI-texter finns i `lib/locales/sv.json` och `lib/locales/en.json`, med samma nycklar i båda filerna. Profilens `language` i den lokala journalvyn styr UI:t och synkas till `profile.json`. Serverns skal använder en kontobunden språkledtråd utan att läsa Git. Ändra språk under **Inställningar → Din profil → Språk** och spara profilen. Befintliga profiler utan språkfält använder svenska; webbläsarens språk ersätter inte profilvalet.

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
- [Lokal lagring, synkning och återhämtning](docs/BROWSER-SYNC.md)
- [Regelkällor och nya upplagor](docs/RULES.md)
- [Tester och kontroller](docs/TESTING.md)
- [Säkerhetsgranskning och åtgärder](docs/SECURITY-AUDIT-2026-10-12.md)

## Säkerhetskontakt

`public/.well-known/security.txt` publiceras utan inloggning på `/.well-known/security.txt` enligt [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116.html). Säkerhetsrapporter skickas till `security@aaw.se`. Granska kontaktuppgifterna och förnya `Expires` före **1 oktober 2027**. Filen ska nås via HTTPS i produktion.

## Rapportera problem och föreslå förbättringar

Välj **Synpunkter** längst ned till höger i den inloggade appen. Knappen delar plats med den kompakta synkstatusen och visas som en ikon på små skärmar. Den finns inte på inloggnings-, installations- eller vittnessidan och tas bort tillsammans med ett öppet utkast om synkningen upptäcker en utgången session. Formuläret laddas först när du öppnar det och ditt utkast bevaras vid vanlig navigation mellan appens sidor. Beskriv problemet utförligt, ange steg, förväntat beteende och relevanta felmeddelanden. Du kan också välja förbättringsförslag. Rapporten öppnas som ett förifyllt utkast i originalrepositoryt `aawse/myshotlog`; granska och skapa ärendet på GitHub med ditt eget konto. Ingen ny token, OAuth-behörighet eller miljövariabel krävs.

Rapporten hålls bara i webbläsarens minne och sparas inte i journalen eller på appservern. Appen förifyller endast den publika byggcommitens korta SHA och webbläsarfamilj; du kan ändra eller ta bort båda. Installationens adress, privata repositorynamn, konto-ID:n, miljövärden och journaldata samlas inte in. För mycket långa rapporter visas hela texten för kopiering; klistra in den i **Additional details** i GitHubs formulär. Vid nekad clipboardåtkomst kan du kopiera texten manuellt.

GitHub-ärenden är offentliga. Granska skärmbilder och ta bort hemligheter och personliga uppgifter innan du skickar. Säkerhetsbrister rapporteras privat till `security@aaw.se`. Repositoryts formulär finns i `.github/ISSUE_TEMPLATE/bug.yml` och `feature.yml` och accepterar svenska och engelska. Mallarna blir tillgängliga när de publiceras på repositoryts standardbranch.

## Åtkomstgranskning

Under **Inställningar → Vem har åtkomst till dina data?** kan du granska GitHub-konton och behörigheter till datarepositoryt med din befintliga token. Publik åtkomst och ofullständiga kontolistor visas tydligt. Repositoryåtkomst gäller samtliga lagrade journaler och deras historik och är separat från appens inloggningslista. Se [åtkomstgranskning och begränsningar](docs/SETUP.md#granska-åtkomst-till-personliga-data).

## Grenar, regler och träning

Passvyn visar regelupplagans läsbara namn en gång för passet, med seriehänvisningar om flera upplagor förekommer. Tekniska ID:n finns kvar i det utfällbara beräkningsunderlaget.

Alla SPSF-grenar kan registreras, liksom IPSC, Nordic Steel Challenge, DMR och egna grenar. Ett pass har ett vapen och en gren. Skjutprogram fyller i serier, skottantal och kända villkor. PPC-program behåller varje etapps avstånd i meter eller yard. Optik och förvalda klasser per gren sparas på vapnet; tidigare vapenögonblicksbilder ändras inte.

**Träningsmaterial** innehåller egna A4-övningstavlor, råd om säker torrträning och länkar till aktuella regelböcker. En kontroll hos SPSF jämför den publicerade handboken med appens granskade dokument. Den läser inga journaluppgifter och bedömer inte om gamla resultat. Se [gren- och regeltäckning](docs/RULES.md) och [skjutprogram](docs/EVENTS.md).

**Check rule updates** kontrollerar dessutom SPSF, SRA, IPSC och SDSSF var sjätte månad och skapar ett GitHub-ärende med uppdateringsanvisningar när officiella dokument ändras. Det kan även startas manuellt. Se [schemalagd regelkontroll](docs/RULES.md#schemalagd-kontroll-i-github).

Lämna både felrapporter och förbättringsförslag via **Synpunkter** på valfri sida i den inloggade appen.

## UI-tester och mobil installation

Playwright testar Chromium, Firefox och WebKit på dator samt webbläsarprofiler
för Android, iPhone och iPad. Kör först `npm run test:ui:install` och sedan
`npm run test:ui`. Det befintliga Ubuntu-arbetsflödet kör samma tester och sparar
felrapporter. Testerna använder fiktiva lokala uppgifter; inga riktiga konton
eller hemligheter behövs. Mobilprofiler är emulering; kamera, installation och
operativsystem behöver också kontrolleras på riktiga enheter.
Se [UI-tester och mobil användning](docs/UI-TESTS.md).

Appen kan läggas till på hemskärmen i webbläsare som stöder installation via
HTTPS och öppnas då i ett eget fönster. Mobilvyer tar hänsyn till skärmens säkra
kanter och tangentbordets ändrade visningsyta. Nypzoom är fortsatt tillåten.
Detta tillför ingen service worker eller möjlighet att öppna en ny sida utan nät.
