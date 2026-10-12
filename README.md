# MyShotLog

Svensk träningsjournal för nationellt pistolskytte, byggd med Next.js. Vapen med förvald gren, pass med gemensamt avstånd och måltyp, resultat, versionsbundna märkesbedömningar och JSON/CSV-export. Födelsedatum kan sparas i profilen. Serier beräknas direkt med regelversionen för passets datum, utan verifiering eller ombedömning. Regelunderlaget kan uppdateras när nya upplagor av Skjuthandboken kommer.

Journalen använder ett **konfigurerbart privat Git-repository som databas**. Varje profil, vapen och pass är en JSON-fil; varje sparning skapar en egen commit. Resultat och bedömningar följer passet i samma commit. GitHub API är standard för Vercel; en Git-adapter finns för lokala bare repositories och andra Git-servrar. Supabase behövs inte.

## Starta

```sh
npm install
cp .env.example .env.local
npm run dev
```

Fyll i privat GitHub-repository, repository-begränsad databas-token, GitHub OAuth-appens klientuppgifter, tillåtna GitHub-ID:n och en slumpmässig sessionshemlighet i `.env.local`. Repot måste vara privat och ha en initial commit på vald branch. Läs [installationsguiden](docs/SETUP.md) för exakta steg och Vercel-konfiguration.

Inloggning använder GitHub-konton via OAuth med PKCE och signerade sessionscookies. Instansägaren anger vilka GitHub-konton som får åtkomst. Lösenord och tvåfaktorsautentisering hanteras av GitHub. Radering tar bort uppgifter från aktuell journal; **tidigare versioner finns kvar i Git-historiken och kopior**.

Befintliga Supabase-journaler flyttas genom JSON-export från den gamla installationen och import i den nya. Ingen automatisk migrering eller anslutning till en verklig databas har utförts.

- [Installation och migrering](docs/SETUP.md)
- [Arkitektur och lagring](docs/ARCHITECTURE.md)
- [Regelkällor och nya upplagor](docs/RULES.md)
- [Verifiering](docs/TESTING.md)

```sh
npm run typecheck
npm test
npm run format:check
npm run build
```

### Snabbserier på banan

Öppna **Snabbserie** i menyn för ett mobilanpassat formulär med stora sifferfält. Ange datum, gren, skott och poäng/träffar och tryck **Spara serie & nästa**. Varje serie sparas direkt i Git-journalen med en egen commit; formuläret behåller datum, gren och skottantal för nästa serie. En nätanslutning krävs för att spara. Om sparandet misslyckas behålls uppgifterna i formuläret medan sidan är öppen.

Under **Okopplade serier** väljer du en eller flera serier från samma datum och gren. Skapa ett nytt pass med dem eller koppla dem till ett befintligt pass. Vapen, plats, avstånd, måltyp och skjuttid anges på passet. Kopplingen sparar passet och tar bort serierna ur inkorgen i en atomisk Git-uppdatering. Valörer beräknas när serierna har ett pass; födelseuppgifter fångas vid snabbregistreringen och regelversion följer registreringsdatumet. Okopplade serier ingår i JSON-export/import och i fullständig radering av journalen.

### Foto av tavlan

Varje serie kan ha ett valfritt tavelfoto, både i snabbregistreringen och när ett pass skapas eller redigeras. **Ta foto** öppnar mobilens kamera där webbläsaren stödjer det; **Välj bild** öppnar bildvalet. En förhandsvisning visas före sparandet. Bilden sparas först när serien eller passet sparas, och följer med när en snabbserie kopplas till ett pass. På passets sida kan miniatyren öppnas i full storlek. Ett foto kan bytas eller tas bort i redigeringsformuläret.

Webbläsaren orienterar bilden, tar bort metadata och komprimerar den till WebP före uppladdningen med högst **1600 pixlar på längsta sidan och 180 kB bilddata**. Servern validerar format, mått och storlek och sparar de uppladdade bildbyten oförändrade, utan att komprimera om bilden. Identiska optimerade bilder lagras en gång per användare. Foto och serie publiceras atomiskt i Git; fotot får en egen commit. Bilder ligger utanför den vanliga postläsningen och visas endast genom ett inloggat anrop för samma användare. JSON-backup inkluderar bilddata; CSV innehåller enbart resultat. Upp till tio nya foton kan sparas samtidigt, och ett valt original får vara högst 25 MB. Om webbläsaren inte kan öppna ett format, använd JPEG, PNG eller WebP.

Uppladdade foton behandlas i arbetsminne och skrivs inte till någon upload-katalog på appservern. Sharp-cache är avstängd. GitHub-adaptern skickar bilddata direkt till repositoryt. Git-remote-adaptern använder en tillfällig Git-katalog, som raderas innan anropet avslutas, både efter en lyckad push och vid fel. Bakgrundsunderhåll för den tillfälliga katalogen är avstängt och borttagningen försöks om vid tillfälliga filsystemfel. Efter sparandet hämtas tavelfoton från Git-repositoryt via den privata bildrutten; appservern behåller ingen permanent fotokopia.

### Automatiska tester i GitHub

Workflowen **Tests** kör `npm ci` och hela testsamlingen med `npm test` på Ubuntu och Node.js 24. Den startas vid pull requests och pushar till `main`, inklusive merge-, squash- och rebase-merge. Manuell körning: öppna **Actions → Tests → Run workflow** i GitHub och välj branch. Workflowfilen behöver först finnas på standardbranchen för att den manuella knappen ska visas. Inga apphemligheter eller tillgång till din Git-databas krävs för testerna. `fsevents` är en valfri macOS-beroende modul så installationen även fungerar på Linux.
