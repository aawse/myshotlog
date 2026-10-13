# Uppdatera MyShotLog från appen

Appen kontrollerar den **driftsatta versionen** mot standardbranchen i `aawse/myshotlog` (för närvarande `main`). En notis visas när installationen saknar uppströmscommits. Det räcker inte att kodforken är synkroniserad: notisen finns kvar tills den nya versionen har driftsatts. Under **Inställningar → Appuppdateringar** visas kodrepository, branch, driftsatt commit och de senaste fem ändringsrubrikerna.

Kontrollen kräver ingen journalåtkomst och cachas i fem minuter per serverinstans. En öppen, synlig app kontrollerar var femte minut. GitHub-fel hindrar inte registrering av pass. Appen behöver känna till både kodrepositoryt och den driftsatta commitens SHA. Commiten bäddas in automatiskt vid bygget från `VERCEL_GIT_COMMIT_SHA` eller, utanför Vercel, från `git rev-parse HEAD`. Ingen egen commit-miljövariabel behövs. Vercels Git-variabler identifierar normalt kodrepositoryt; aktivera **Automatically expose System Environment Variables** om de saknas.

Uppströmsmetadata och jämförelser inom det publika fork-nätverket läses utan autentisering. Kodtokenen används endast för läsning och sammanfogning i din kodfork; ge den inte extra åtkomst till originalrepositoryt. Jämförelserna använder ägarkvalificerade, låsta commit-SHA:n för både forken och uppströmsversionen. GitHubs gräns för anonyma API-anrop gäller för serverns utgående IP-adress. Om den nås visas ett trafikgränsfel; försök igen senare.

## Engångsinställning på Vercel

1. Använd en riktig GitHub-fork av `aawse/myshotlog` som kodrepository och anslut dess produktionsbranch till Vercel. Journalrepositoryt ska vara separat och privat.
2. Öppna GitHub **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**. Skapa en separat token, exempelvis *MyShotLog code updates*, med en vald giltighetstid.
3. Välj forkens ägarkonto eller organisation som **Resource owner**. Under **Repository access → Only select repositories**, välj endast din **kodfork**. Ge **Contents → Read and write** och **Workflows → Read and write**. Workflows-behörigheten behövs när uppdateringen ändrar GitHub Actions. Metadata-läsning följer med. Tokenen behöver ingen åtkomst till journalrepositoryt.
4. Lägg tokenen i Vercels **Environment Variables** som `GITHUB_CODE_TOKEN`, endast för **Production**. Byt inte ut `GIT_DATABASE_TOKEN`, som fortfarande används för journalen. Tokenvärden får aldrig ha `NEXT_PUBLIC_`-prefix eller läggas i Git.
5. Driftsätt en version med uppdateringsfunktionen och den nya miljövariabeln. Logga in med installationsägarens GitHub-konto och öppna **Inställningar → Appuppdateringar**.

Som standard får endast personen som äger kodforken synkronisera. För en organisationsfork, eller om andra administratörer ska få göra det, ange `GITHUB_UPDATE_ADMIN_IDS` med deras numeriska personliga GitHub-ID:n, separerade med kommatecken. De måste också finnas i `GITHUB_ALLOWED_USER_IDS` för att kunna logga in. En organisation kan också kräva godkännande av den nya tokenen. En uttrycklig administratörslista ersätter standardregeln om forkens ägare. Se [hur du hittar numeriskt GitHub-ID](SETUP.md#hitta-användarens-numeriska-github-id).

## Så går uppdateringen till

1. Öppna **Inställningar → Appuppdateringar**. Läs ändringsrubrikerna och gör gärna en JSON-backup före uppdatering.
2. Välj **Synkronisera fork**. Servern kontrollerar behörighet, forkens ursprung och den aktuella uppströmsversionen igen.
3. Appen sammanfogar den visade commitens SHA med kodforkens valda branch via GitHub API. Den gör ingen force-push och behåller egna commits. Om uppströmsversionen ändrades efter kontrollen måste du kontrollera på nytt. Motstridiga ändringar eller branchskydd stoppar åtgärden; ingenting återställs automatiskt.
4. Vercels anslutna Git-integration driftsätter den uppdaterade branchen. Appen visar att forkens uppdatering är klar men att driftsättningen väntar. Knappen **Ladda om appen** visas när en ny driftsatt commit har upptäckts. Du väljer själv när sidan laddas om.

Det krävs ingen GitHub-gränssnittsåtgärd för den normala synkroniseringen efter engångsinställningen. Om bygget misslyckas, Git-integrationen är avstängd eller egna kodändringar orsakar konflikter behöver installationsägaren hantera det separat. Appen rapporterar inte lyckad driftsättning bara för att forken uppdaterades.

## Avancerade variabler och egen server

| Variabel | Användning |
| --- | --- |
| `GITHUB_CODE_TOKEN` | Separat serverhemlighet för kodforken. Uppdateringsnotiser för en publik fork kan fungera utan token, men synkronisering kräver den. |
| `GITHUB_CODE_REPOSITORY` | `OWNER/CODE_FORK`; behövs om `VERCEL_GIT_REPO_OWNER` och `VERCEL_GIT_REPO_SLUG` saknas. |
| `GITHUB_CODE_BRANCH` | Befintlig kodbranch som ska uppdateras. Standard är forkens standardbranch. Den ska vara samma branch som driftsätts. |
| `GITHUB_UPDATE_ADMIN_IDS` | Valfri administratörslista enligt ovan. |

Synkronisering är spärrad på Vercels förhandsversioner och om den driftsatta branchen skiljer sig från målbranchen. För egen server uppdaterar funktionen GitHub-forken, men du ansvarar för att bygga och driftsätta den nya koden från ett Git-checkout. Commiten hämtas vid bygget, så Git behövs inte på den körande servern. Om både Vercels commitmetadata och Git-checkout saknas vid bygget kan uppdateringskontrollen inte identifiera den körande versionen. Funktionens trafikgräns gäller per serverinstans; den använder inte journalens Git-lagring. Förnya kodtoken före utgångsdatum och driftsätt om efter miljöändringar.

Källor: [GitHubs jämförelse-API](https://docs.github.com/en/rest/commits/commits#compare-two-commits), [GitHubs merge-API](https://docs.github.com/en/rest/branches/branches#merge-a-branch), [GitHubs tokeninställningar](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens), [Vercels Git-integration](https://vercel.com/docs/git/vercel-for-github), [Vercels systemvariabler](https://vercel.com/docs/environment-variables/system-environment-variables).
