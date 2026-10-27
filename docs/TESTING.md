# Tester och kontroller

Kör från projektets rot med Node.js 24 och Git i PATH:

```sh
npm test
npm run typecheck
npm run format:check
npm run build
```

Typkontrollen avvisar oanvända lokala deklarationer och parametrar.

Tester använder fiktiva journaler, mockade provider-svar och lokala temporära bare Git-repositories. Inga riktiga apphemligheter eller anslutningar till datarepot behövs. Ett lokalt test eller bygge verifierar inte den publicerade installationens GitHub-/Vercel-inställningar.

Kontrollerna täcker bland annat:

- Språkval från profilen, svensk standard, identiska översättningsnycklar och oförändrade användarinmatade värden.
- Läscachens användar-/konfigurationsisolering, utgång, samordnade läsningar, minnesgränser och invalidering vid samtidiga skrivningar. Transaktioner använder färska snapshots även med varm läscache.
- Postcommits, atomiska importer, samtidiga skrivningar, revisionskonflikter och användarisolering.
- Tomma GitHub-repositories, första metadatacommit, initieringskonflikter, verkliga branch-/behörighetsfel och importpanel på tom översikt.
- GitHub API, OAuth-state/PKCE, engångsflöden, stateless sessionskontroller utan Git, origin/version/utgång och gemensamma trafikgränser.
- Krypterad delimport över 3 MB mellan serverinstanser; utgångstid, ägarisolering, manipulerade delar, hashfel, storleksgränser och begränsade konfliktretries. Lokal export utan pagineringsloopar samt laddningsindikator i båda språk och browsermatrisen.
- Rå JSON/CSV-export utan bedömningar, import med daterade regler och fångade födelseuppgifter, äldre backupkompatibilitet, stabila journal-ID:n och prefixval.
- Fotovalidering, bildreferenser, deduplicering och städning av tillfälliga Git-repositories.
- Brons/silver/guld för A/B/C, åldersgränser, passdatum och regelversioner.
- Gemensamma passvillkor, vapenpreferenser, medaljräknare, platsförslag och snabbserier.
- Storleksbegränsad läsning av request-body och CSP, inklusive API-rutter som går förbi Proxy:s body-kloning.

Git-tester använder `node:os.tmpdir()` och `node:path.join()`, och simulerar push-avslag genom Git-inställningen `receive.maxInputSize` i stället för Unix-shellskript. Sökvägar med mellanslag samt svenska tecken och emoji i data testas. Temporära repository-namn hålls i ASCII för att undvika Git-versioners skillnader i Unicode-normalisering av katalognamn. Samma npm-kommandon kan användas lokalt på Windows, macOS och Linux.

## GitHub Actions

Workflowen **Tests** kör `npm ci`, Vitest-tester, typkontroll, formateringskontroll och produktionsbygge på **`ubuntu-latest` med Node.js 24**. Den startar vid pull requests, push till `main` och manuell körning. CI kör inte macOS- eller Windows-jobb.

Manuell körning finns under **Actions → Tests → Run workflow** när workflowfilen finns på standardbranchen. Actions är fästa vid commit-SHA:n och Dependabot kontrollerar uppdateringar varje vecka. Workflowen behöver inga apphemligheter eller datarepo-behörigheter.

Det separata arbetsflödet **UI tests** kör Playwrights dator- och mobilmatris med
ett eget produktionsbygge och samma triggers, oberoende av **Tests**. Felrapporter
sparas i sju dagar. Se [UI-tester och mobil användning](UI-TESTS.md).

## Kontroll efter publicering

Verifiera separat att GitHub-inloggning fungerar på den konfigurerade origin, att en post och ett foto kan sparas/hämtas och att utloggning, JSON-export och CSV-export fungerar. För Web Analytics ska projektet först aktiveras i Vercel och publiceras om; kontrollera sedan sidvisningar i dashboarden.

## Deterministisk säkerhetskonkurrens

`npm test -- tests/security-store.test.ts` testar engångsflöden mot verklig Git. Testet låser Git-tidsstämplarna och samordnar två samtidiga skrivförsök så att den andra pushen startar efter den första. Inga godtyckliga pauser eller tester som kör om ett misslyckande används. Identiska skrivningar ska ha olika transaktionsmarkerade commitobjekt, och endast en callback får förbruka flödet. Både Git- och GitHub-adaptern använder samma commitmarkör.

## Browser-synkning

`sync.test.ts` verifierar batchpublicering, en commit per post, replay utan dubbla commits, konflikter utan delpublicering, samtidiga branchändringar och fångad födelseinformation. `sync-api.test.ts` kontrollerar autentisering, origin, scope, oförändrat head, validering och hemlighetsfria fel. `sync-controller.test.ts` verifierar lokal lagringskvittens, offlinekö, återöppning, samtidiga sparningar, nätverksfel, konfliktval, kvotfel, kontobundna backuper och samordning av flikar.

Browser-verifiering ska använda fiktiva konton och ett repository i minnet. Kontrollera riktig IndexedDB, native navigering, foton och overlay offline, lokal snabbserie som kopplas till pass, återupptagning efter stängd flik, förlorat svar efter publicering, födelsekorrigering efter lokal registrering, båda konfliktvalen, språkbyte, nekad browserkvot och byte av konto. Använd aldrig en verklig journal för sådana tester.


## CSP och HTTP-gränser

Browsermatrisen fångar `securitypolicyviolation` på varje sida; oväntade brott gör testet rött. WebKits Playwright-screenshotter injicerar en tom `body {}`-stylesheet utan nonce för animationssynkning. Endast den kända blockerade verktygsstilen (högst en per aktiv screenshot, tom källfil, rad 5 och `inline`) skiljs ut; produktionspolicyn ändras inte och övriga CSP-brott stoppar testet. Screenshot-wrappern väntar på både bilden och den kända CSP-händelsen innan undantaget stängs, även när konsolhändelsen kommer efter bilden. Saknad händelse ger timeout i stället för ett tyst undantag. Originalmetoden återställs när testets fixture avslutas, före Playwrights egen kontextstädning. Browserns request-händelser kontrollerar även ursprung efter omdirigeringar, där URL-routning inte alltid kan intercepta. Separata negativa prov kräver att externa formulär, externa fetch-anrop och inline-script blockeras. Inloggningsprovet behåller produktionspolicyn och följer den riktiga 307-omdirigeringen från `/auth/github/` till en lokal auktoriseringssida på ett annat ursprung. Testproxyn kontrollerar att den verkliga Location-headern pekar på GitHub och ändrar endast OAuth-destinationen till en lokal port; status, CSP och cookies bevaras. Därmed fångas även browserns kontroll av formuläromdirigeringar; inga omdirigeringar ersätts med ett lyckat svar på appens ursprung.

UI-servern använder ett nytt temporärt, lokalt bare Git-repository per körning för OAuth-säkerhetstillstånd och tar bort det när servern stängs. Privata vyer använder fortsatt fiktiva, mockade journaler. Endast testmiljön litar på `x-ui-client-ip`, med dokumentationsadresser per browserprojekt; verkliga trafikgränser ändras inte. GitHub-sidan ersätts av en lokal HTTP-server och inga GitHub/Git-provider-anrop lämnar datorn.

`request-coverage.test.ts` inventerar alla route-filer och exporterade HTTP-handlers och kräver motsvarande anrop i en testsuite. Nya routes eller metoder utan registrerad täckning gör testet rött. Riktiga HTTP-anrop i browsermatrisen verifierar att samtliga privata GET/HEAD- och POST-gränser nekar oinloggade, att skrivningar nekar fel Origin och att privata felsvar inte cachas. Publika vittnesanrop kräver en giltig capability och OAuth-callback utan giltigt flöde avvisas. Route-testerna täcker dessutom validering, storleksgränser, provider-fel och övriga domänspecifika avslag.
