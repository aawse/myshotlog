# Installation

## Lokal utveckling på Windows, macOS och Linux

Installera Node.js 24 och Git. Kontrollera `node --version`, `npm --version` och `git --version` i en ny terminal. På Windows kan du använda PowerShell eller cmd med Git for Windows i PATH; bash/WSL och OpenSSL behövs inte. Kör `npm ci`, `npm run setup:local` och därefter `npm run dev`. Setup-kommandot bevarar en befintlig `.env.local`. Tester och byggen behöver inga riktiga databas- eller OAuth-hemligheter; för inloggning i utvecklingsservern fyller du i `.env.local` enligt nedan.

## GitHub och Vercel

1. Skapa ett separat **privat** GitHub-repository för journaldata. Lägg till README så att `main` har en första commit. Databasrepot ska inte vara appens kodrepo eller utlösa nya Vercel-deployments vid journaländringar.
2. Skapa en fine-grained personal access token begränsad till databasrepot, med **Contents: read and write**. Organisationer kan behöva godkänna token. Branchregler måste tillåta appens direkta commits. Ge inte token åtkomst till fler repositories än nödvändigt.
3. Kör `npm run setup:local` för att skapa `.env.local` från `.env.example` utan att skriva över befintliga inställningar. Ange `GIT_DATABASE_PROVIDER=github`, `GIT_DATABASE_REPOSITORY=owner/repo`, `GIT_DATABASE_BRANCH=main`, `GIT_DATABASE_TOKEN` och `GIT_DATABASE_PREFIX=myshotlog/v1`. API-adressen är normalt `https://api.github.com`.
4. Registrera en **GitHub OAuth App** via GitHub → Settings → Developer settings → OAuth Apps. Ange installationens origin som Homepage URL och exakt `https://YOUR_SITE/auth/github/callback` som Authorization callback URL. För lokal utveckling används `http://localhost:3000/auth/github/callback`; skapa en separat OAuth-app för utveckling och produktion. Generera en klienthemlighet. Se [GitHubs OAuth-guide](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).
5. Ange `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` och `GITHUB_ALLOWED_USER_IDS` (kommaseparerade numeriska GitHub-ID:n). Följ avsnittet [Hitta användarens numeriska GitHub-ID](#hitta-användarens-numeriska-github-id) nedan. Använd det numeriska ID:t, inte användarnamnet. Endast listade konton får logga in; en tom lista stoppar inloggning. Varje konto får sin egen journal.
6. Generera en hemlighet med `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` och ange `AUTH_SESSION_SECRET`. Ange `NEXT_PUBLIC_SITE_URL` till exakt samma origin som OAuth-appens callback, utan subpath, query eller fragment. Produktionsdomänen måste använda HTTPS. Hemligheter får aldrig ha `NEXT_PUBLIC_`-prefix, läggas i koden eller databasrepot.
7. Kör `npm ci`, `npm run typecheck`, `npm test`, `npm run build` och `npm run dev`. Välj ”Logga in med GitHub” och slutför GitHubs inloggning. Utan fullständig konfiguration visas installationssidan.
8. För Vercel: importera **kodrepot**, välj Next.js och ange samma miljövariabler i rätt miljö. Ange inte `.env.local`-filens omgivande shell-citat i Vercels fält. Publicera om efter ändrade miljövariabler. Använd en stabil produktionsdomän i OAuth-appens callback och `NEXT_PUBLIC_SITE_URL`; preview-deployments behöver separat OAuth-konfiguration. Aktivera plattformens trafikskydd vid publik exponering.

GitHub-konfigurationen behöver ingen Git-binär eller beständig serverdisk. Databas-token, OAuth-klienthemlighet och sessionshemlighet är endast tillgängliga på servern. OAuth-inloggningen begär inga repository-scopes. Databasåtkomst använder den separata server-tokenen; användarnas GitHub-konton behöver inte ha repository-åtkomst. Repository-åtkomst ger möjlighet att läsa hela journalhistoriken: begränsa även medlemmar och integrationer.

## Hitta användarens numeriska GitHub-ID

### I webbläsaren

1. Öppna personens GitHub-profil, exempelvis `https://github.com/YOUR_LOGIN`. Kopiera användarnamnet från adressen; använd inte profilens visningsnamn eller e-postadress.
2. Öppna `https://api.github.com/users/YOUR_LOGIN` och ersätt `YOUR_LOGIN` med användarnamnet. För vanliga offentliga konton behövs ingen API-token för denna uppslagning.
3. I JSON-svaret: kontrollera att `login` och `html_url` pekar på rätt profil och att `type` är `User`. Kopiera det numeriska fältet **`id`**. `node_id` är ett annat fält och ska inte användas.
4. Lägg ID:t i `GITHUB_ALLOWED_USER_IDS`. Upprepa för varje person. Använd personliga konton; ett organisations-ID ger ingen användarinloggning.

Illustration med fiktiva värden:

```json
{
  "login": "ditt-anvandarnamn",
  "id": 123456,
  "node_id": "ANNAT_ID_ANVANDS_INTE",
  "html_url": "https://github.com/ditt-anvandarnamn",
  "type": "User"
}
```

```dotenv
# Ersätt exemplen med de ID:n du själv verifierat.
GITHUB_ALLOWED_USER_IDS=123456,789012
```

### I terminalen

Hämta användarnamn, numeriskt ID och kontotyp med Node.js, som redan behövs för appen. Kommandot fungerar i PowerShell, cmd, bash och zsh:

```sh
node -e "fetch('https://api.github.com/users/YOUR_LOGIN').then(r=>{if(r.ok)return r.json();throw new Error('HTTP '+r.status)}).then(({login,id,type})=>console.log({login,id,type})).catch(e=>{console.error(e.message);process.exitCode=1})"
```

Om GitHub CLI är installerat och du redan har loggat in kan du visa det egna kontots ID tillsammans med användarnamnet:

```sh
gh api user --jq '{login: .login, id: .id, type: .type}'
```

Efter ändringen: starta om den lokala appen eller uppdatera miljövariabeln i Vercel och publicera om. Vid `404`, kontrollera användarnamnet; vissa Enterprise Managed Users kräver autentiserad uppslagning med organisationsåtkomst. Vid API-gräns, vänta eller använd autentiserad GitHub CLI.

GitHub beskriver ID:t som beständigt även när användarnamnet ändras. Se [GitHubs användar-API](https://docs.github.com/en/rest/users/users).

## Annan Git-server eller lokal databas

Ange `GIT_DATABASE_PROVIDER=git` och `GIT_DATABASE_REMOTE` till ett SSH-/HTTPS-remote eller en absolut sökväg till ett bare repository. Servern måste ha Git installerat och autentisering konfigurerad utan interaktiva frågor. Undvik tokens i remote-URL; använd serverns credential helper eller SSH-nyckel.

```sh
git init --bare /ABSOLUTE/PERSISTENT/PATH/myshotlog-data.git
```

På Windows kan du till exempel använda `git init --bare "C:/Users/YOUR_NAME/myshotlog-data.git"` och ange samma absoluta sökväg med snedstreck i `GIT_DATABASE_REMOTE`. Sökvägar med mellanslag stöds; omge miljövärdet med citattecken i `.env.local`.

Ett tomt bare repo får sin första commit vid första sparningen. Lagra det utanför appens källkod på beständig disk. En lokal sökväg i Vercels temporära filsystem är inte en beständig databas. Använd GitHub-adaptern på Vercel.

## GitHub-konton och befintliga journaler

Appen har inga lokala lösenord eller skapande av lokala konton. GitHub sköter inloggning, återställning och kontots tvåfaktorsautentisering. Tillåt åtkomst genom att lägga till det verifierade numeriska ID:t i `GITHUB_ALLOWED_USER_IDS`. Ta bort ID:t för att återkalla åtkomst, inklusive befintliga sessionscookies, när den nya konfigurationen körs. Roterad sessionshemlighet ogiltigförklarar alla sessioner. Avaktivera äldre deployment-URL:er med gammal konfiguration vid återkallad åtkomst.

Journalens UUID härleds deterministiskt från kontots numeriska GitHub-ID. Byten av användarnamn eller e-post flyttar därför inte data. För att behålla en journal från den tidigare kontolösningen, ange en explicit mapping i `GITHUB_USER_ID_MAP`, exempelvis `{"123456":"EXISTING_JOURNAL_UUID"}`. Kopiera UUID:t från den gamla kontokonfigurationen eller journalens filprefix. Kontrollera kopplingen manuellt; appen kopplar aldrig på e-post eller användarnamn. Varje tillåtet GitHub-konto måste få ett unikt journal-UUID. Behåll mappingen även efter migrationen. Den som ändrar mappingen ändrar vilket journalprefix kontot får åtkomst till.

Gamla lokala sessionscookies godtas inte längre. Ta bort `AUTH_USERS_JSON`; kommandot `account:create` har avvecklats. För nya journaler behövs ingen mapping.

Sessioner gäller högst åtta timmar. Utloggning tar bort aktuell lokal cookie. Återkallad OAuth-auktorisering eller ändrat GitHub-lösenord upptäcks vid nästa GitHub-inloggning, men återkallar inte omedelbart en redan signerad lokal session. För omedelbar avstängning, ta bort kontot ur tillåtelselistan och publicera om. OAuth-tokenen används endast för att hämta identiteten vid inloggning; den sparas inte i cookies eller databas.

## Flytta från Supabase

Exportera först varje användares fullständiga JSON från den gamla installationens inställningar. Behåll gamla installationen till dess att exporterna verifierats. Konfigurera Git-installationen och tillåt rätt GitHub-konton. Använd `GITHUB_USER_ID_MAP` om befintliga journalprefix ska återanvändas. Logga in som rätt användare och importera dennes export. Befintliga UUID:er hoppas över vid återimport; import skriver inte över befintliga poster. CSV är en läsbar resultatexport, inte ett komplett migreringsformat. Jämför profil, vapen, pass och bedömningar innan den gamla tjänsten avvecklas. Appen utför ingen automatisk migration.

## Historik, backup och gränser

Radering i appen tar bort aktuella filer men Git behåller tidigare versioner, även serienummer och anteckningar. Fullständig historikradering kräver separat repository-administration och hantering av kloner, backups och tjänstens retention. Appen lovar inte permanent radering.

Säkerhetskopiera privat med exempelvis `git clone --mirror REMOTE BACKUP_DIRECTORY`; skydda backupen lika noggrant som originalet. JSON-export fungerar för flytt mellan installationer, medan Git-backup också bevarar commit-historiken.

Behåll en framåtgående databasbranch: undvik force-push, ompekning och manuella filändringar under appskrivningar. GitHub-adaptern publicerar utan force och försöker om vid konkurrerande commits. Föråldrad passrevision ger konflikt och behöver laddas om. API-gränser, repository-storlek och funktionskörtid begränsar kapaciteten. Avsedd för mindre personliga/föreningsjournaler; stora importer kan kräva mindre exporter eller en egen server med längre körtid. Import är begränsad till 3 MB. Trunkerade GitHub-träd avvisas för att förhindra ofullständig läsning.

GitHub API-modellen följer [Git database API](https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-your-git-database), [träd](https://docs.github.com/en/rest/git/trees) och [referenser](https://docs.github.com/en/rest/git/refs).

## Lägg till kalibrar och måltyper

Kaliberlistan finns i `lib/data/calibers.json`. Den är en vanlig JSON-array med `value` (värdet som sparas) och `label` (namnet i listan). Lägg till exempelvis:

```json
{ "value": ".41 Magnum", "label": ".41 Magnum" }
```

Håll `value` unikt och lägg ett komma mellan objekten; JSON tillåter inte kommentarer. Starta om utvecklingsservern eller bygg/publicera om appen efter ändringen. Nya alternativ visas automatiskt i vapnets kaliberlista. Äldre sparade värden visas fortfarande även om de saknas i katalogen; befintliga vapen och snapshots ändras inte. Listan är ett praktiskt starturval för personligt bruk, inte en statistisk rangordning eller automatisk klassificering av vapen. Urvalet stöds av kaliberexemplen i [SPSF:s Skjuthandbok 2026](https://www.svenskappccupen.se/wp-content/uploads/2026/01/SHB_2026.pdf), avsnitt F.4 och E.4/G.4.

Måltyper ligger på samma sätt i `lib/data/targets.json`. Behåll koderna `precision25`, `B100`, `C30` och `sixth` eftersom regelmotorn använder dem. Att lägga till ett nytt målval ändrar inte märkesberäkningens regler. Måltyp väljs från en dropdown på passnivå.

MyShotLog används för personlig resultatuppföljning. Nya serier kräver varken skjutledare, signatur eller bekräftelsefält. Poäng, skott, tid, mål, avstånd och sparade födelseuppgifter används för beräkningen. Listor och pass visar direkta beräkningar med regelversionen för passdatumet. Tidigare verifieringsstatusar ignoreras och ingen ombedömning behövs.

Nya precisionspass börjar med 25 meter, pistoltavla precision och 300 sekunders skjuttid som synliga standardvärden. Ändra dem om ditt pass använder andra villkor. Verifiering och signatur krävs aldrig för brons/silver/guldberäkningen. Utan födelseuppgifter används ordinarie gränser utan åldersavdrag. Ogiltiga resultat eller grenar/datum utan regler kan fortfarande vara ej bedömda; orsaken visas i passets serieberäkningar.
