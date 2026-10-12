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
