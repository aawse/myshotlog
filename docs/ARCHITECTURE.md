# Arkitektur

## Webbapp och inloggning

Next.js App Router autentiserar den privata appens skal på servern. Journalvyer renderas från en gemensam browser-cache och väntande ändringar i IndexedDB; records/photo/sync-API:erna och Git-åtkomst körs på servern. GitHub OAuth använder authorization-code-flödet med slumpmässig state, S256 PKCE och en signerad HttpOnly-flödescookie med tio minuters livslängd. Flödet registreras i Git och förbrukas atomiskt före kodutbyte. Callback använder en konfigurerad origin och hämtar identiteten från GitHubs `/user`-API. OAuth-tokenen används tillfälligt och sparas inte.

Numeriska GitHub-ID:n i tillåtelselistan får en HMAC-signerad sessionscookie med slumpmässigt sessions-ID. Cookie har HttpOnly, SameSite=Lax och Secure i produktion och gäller högst åtta timmar. Privat åtkomst verifierar HMAC-signatur, origin, version, utfärdande/utgång och aktuell tillåtelselista lokalt. Sessionskontroller och utloggning gör inga Git-anrop. Utloggning tar bort cookien i webbläsaren; en kopierad cookie lever till utgångstiden om inte hemligheten roteras eller ID:t tas bort ur tillåtelselistan. Äldre tokenversioner från Git-registret accepteras inte. En deterministisk UUID från GitHub-ID väljer journalprefix; en explicit unik mapping kan välja ett befintligt UUID. Användarnamn väljer aldrig data.

Databasåtkomst använder en separat server-token eller serverns Git-autentisering. Användarnas OAuth-konton behöver inte repository-åtkomst. API-skrivningar jämför Origin med den konfigurerade webbplatsen, och servern väljer alltid ägarens UUID. Privata svar använder no-store. Provider-fel och tokens visas inte i klienten.

## Git-lagring

`lib/git-database/types.ts` definierar adaptergränsen: läs ett branch-snapshot och publicera en kedja av postcommits. GitHub-adaptern använder HTTPS API och kräver ett privat repository. Saknad branch ger ett tomt snapshot endast när branchlistan bekräftar att hela repositoryt är tomt. Första skrivningen initierar då en metadatacommit via Contents API innan den ordinarie atomiska postkedjan publiceras. Konkurrerande initiering ger en konflikt och läses om. Git-adaptern använder objektkommandon i tillfälliga bare repositories, utan checkout, och städar katalogerna efter anropet. Den kan initiera en tom databranch.

Nya standardjournaler använder prefixet `myshotlog/v1`. Uttryckligen konfigurerade prefix och befintliga UUID:n bevaras; utan prefixinställning upptäcks journaler under den äldre standardsökvägen per användare.

Journalposter ligger under `<prefix>/users/<UUID>/`. Profil, vapen, pass och okopplade snabbserier har egna JSON-filer. En sparning skapar en commit per post, med passets resultat och bedömningsunderlag tillsammans. Import och koppling av snabbserier publicerar hela commit-kedjan atomiskt. Föråldrade passrevisioner avvisas, och branchkonflikter bygger om planen med ett begränsat antal försök. Varje skrivförsök får också en slumpmässig transaktionsmarkör i commitmeddelandets avslutning. Därmed blir samtidiga, identiska ändringar olika commitobjekt även under samma sekund, och branchens konfliktkontroll kan inte kringgås genom en redan uppdaterad referens. Git bevarar historiska filversioner även efter radering.

Foton ligger separat under `<prefix>/photos/users/<UUID>/<bildhash>/image.json`. Webbläsaren rasteriserar och komprimerar före uppladdning. Befintliga WebP-foton förblir läsbara och bevaras i JSON-export/import. Nya uppladdningar lagras som JPEG; äldre foton och deras Git-historik ändras inte. Servern validerar JPEG-byten, dimensioner, storlek, metadata och SHA-256 utan att komprimera om bilden. Identiska bilder återanvänds per användare. Bildändringar och journalposter publiceras atomiskt. Privata bildanrop hämtar samma användares foto från Git; ingen permanent upload-katalog används.

## Läscache

`ReadCachedDatabase` återanvänds per serverkonfiguration och erbjuder en separat `readSnapshot` för visning, export och fotohämtning. Prefixet innehåller ägarens UUID; cacheinstansen är isolerad efter provider, repo/remote, branch, API-host och token. Den har konfigurerbar livslängd (15 sekunder som standard), LRU-utkastning, gränser på 64 poster/32 MiB och samordning av samtidiga läsningar. Returnerade maps är kopior. Fel cachelagras inte och utgångna poster används inte vid fel.

`snapshot` för transaktioner och säkerhetstillstånd går alltid till Git. `publish` invaliderar endast prefix som berörs av ändringarna, både före och efter publicering även vid konflikt/fel. Läsningar som startade före eller under skrivningen kan inte återfylla cachen efteråt. Säkerhetscommits tömmer inte oförändrade journalposter. Minnescachen är lokal för processen; ändringar på andra instanser eller utanför appen kan dröja upp till cachelivslängden. Privata HTTP-svar har fortsatt `no-store`. Se [konfigurationen](SETUP.md#läscache).

## Säkerhetstillstånd och trafik

`lib/auth/security-store.ts` lagrar engångsflöden och HMAC-baserade trafikräknare under ett separat installationsprefix i samma repo. Origin och sessionshemlighet bestämmer installationshashen. Uppdateringar använder icke-forcerad Git-publicering och läses om vid konflikter. Lagringsfel stoppar åtgärden. Minnescachen innehåller endast nekade trafikbeslut, aldrig beviljade sessioner.

Records/photo-API har gemensamma användar- och installationsgränser, medan OAuth har klient- och installationsgränser. Godkända API-läsningar kan därför skapa säkerhetscommits även om journalens beräkningsfunktion inte skriver data. Sessionskontroller kräver inga Git-läsningar. Äldre sessionshashar ignoreras och tas bort ur aktuell säkerhetsfil vid nästa säkerhetsskrivning. Gränser och proxykonfiguration finns i [installationsguiden](SETUP.md#säkerhetstillstånd-och-trafikgränser).

API-rutter går förbi Next.js Proxy:s body-kloning. Records-API läser högst 3 MB från originalströmmen efter origin- och autentiseringskontroll. Sidornas Proxy genererar CSP-nonces och rotlayouten renderas dynamiskt. Zod använder `jitless`-läge för att undvika dynamisk kodgenerering. Vercel Analytics integreras i rotlayouten för sidvisningar och navigering; datainsamling kräver aktivering i Vercel.

## Resultat och regler

Journalen beräknar brons/silver/guld från råresultat med regelkatalogen för passdatumet. Beräkningsfunktionen skapar inga commits och används för visning. Regel-ID och födelseunderlag följer sparade bedömningar; katalogen styr trösklarna vid läsning. Bevara därför historiska katalogperioder och trösklar när en ny upplaga läggs till.

Sparade födelseuppgifter från seriens underlag används när de finns; annars används profilen. Åldersavdrag baseras på året före passåret. Utan födelseuppgifter gäller ordinarie gränser. Automatisk märkesbedömning finns för precision och tillämpning; övriga grenar kan registreras. Se [regeltäckningen](RULES.md).

Passet har gemensamt avstånd, måltyp, starttid och skjuttid. En snabbserie kan sparas utan pass och kopplas senare till samma datum och gren. Vapen kan ha en förvald gren för nya pass. Kaliber- och mållistor kommer från JSON-kataloger. Passlistan grupperar serier efter högsta uppnådda valör och visar även antal serier och skott.

## Export och drift

En journal utan vapen, pass eller snabbserier erbjuder import direkt på översikten. Samma importkomponent används i inställningar.

JSON version 2 (`myshotlog`) omfattar profil, vapen, passens råresultat, födelseuppgifter fångade per serie, snabbserier och foton. Bedömningar och regelsnapshots ingår inte. Vid import beräknas nya bedömningar med katalogversionen för passdatumet och seriens födelseuppgifter; äldre version 1-backuper kan läsas men deras slutsatser ignoreras. Import är atomär, hoppar över befintliga ID:n och importerar profil endast om profilfil saknas. CSV exporterar passresultat. Git-backup innehåller även säkerhetstillstånd och historik; sessionshemligheten ska roteras efter en återställning.

CI kör tester, typkontroll och produktionsbygge på Ubuntu med Node.js 24. Lokal utveckling använder samma npm-kommandon på Windows, macOS och Linux. GitHub-adaptern behöver ingen Git-binär i driftruntimen, medan Git-adaptern och integrationstesterna behöver Git i PATH.

## Browser-cache och batchsynkning

Se [lokal lagring och synkronisering](BROWSER-SYNC.md) för användarbeteende, begränsningar och återhämtning. `BrowserJournal` samordnar en atomisk IndexedDB-kopia, kö, fotocache och commit-kontrollpunkt. `JournalProvider` är gemensam för alla privata vyer. Native History API uppdaterar `usePathname` och `useSearchParams` utan att hämta journalen eller en RSC-sida vid intern navigering; vyernas kod laddas separat och förladdas för en öppen apps offline-navigering. Serverlokalisering använder en kontobunden språkledtråd från profilen, så sidans skal inte behöver läsa Git. Profilen i browser-state styr UI-språket efter inläsning.

`/api/sync/` verifierar autentisering, scope och origin vid skrivning. `synchronize` bygger operationerna mot ett färskt snapshot i en staging-adapter och återanvänder `GitJournalStore.mutate` för validering och postplaner. Först efter att hela batchen passerat publiceras commitkedjan atomiskt. Beständiga kvittenser under användarens prefix gör osäkra nätverksretries idempotenta. Varje kvittens läggs till i operationens befintliga postcommit, så vanlig synkning inte behöver en separat kvittenscommit. GitHub-adaptern erbjuder en billig head-kontroll och en begränsad cache av immutabla blobbar (32 MiB/10 000 poster), isolerad av providerinstansen och dess tokenkonfiguration. Aktuell repositorysekretess kontrolleras före snapshot/head-läsning även när blobbar redan finns i minnet.
