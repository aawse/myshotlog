# Uppdatera MyShotLog via GitHub

Appen kontrollerar den **driftsatta versionen** mot standardbranchen i `aawse/myshotlog`. En notis visas när installationen saknar uppströmscommits. Under **Inställningar → Appuppdateringar** visas kodrepository, branch, driftsatt commit och de senaste fem ändringsrubrikerna. Kontrollen gör endast publika läsanrop till GitHub; appen ändrar aldrig kodforken.

## Synkronisera din fork

1. Läs ändringarna i appen och gör gärna en JSON-backup.
2. Välj **Öppna fork på GitHub**, eller öppna ditt publika kodrepository direkt på GitHub. Logga in med ett konto som får uppdatera forken.
3. Välj den branch som Vercel driftsätter, normalt `main`.
4. Öppna **Sync fork**, granska ändringarna och välj **Update branch**. Om GitHub rapporterar konflikter, följ GitHubs anvisningar för att lösa dem.
5. Vercels Git-integration driftsätter den uppdaterade produktionsbranchen. Appen visar att driftsättningen väntar om forken redan är aktuell men den körande versionen är äldre. När en ny driftsatt commit upptäcks kan du välja **Ladda om appen**.

Synkronisering av kodforken påverkar inte det separata privata journalrepositoryt. Egna commits och konflikter hanteras i GitHub. Om Vercel-bygget misslyckas eller Git-integrationen är avstängd behöver du åtgärda driftsättningen separat.

## Automatisk versionskontroll

Versionsresultatet cachas i fem minuter per serverinstans. Publika repositorymetadata (identitet och standardbranch) cachas i en timme för att minska GitHub-anrop; branchhuvuden och commitjämförelser hämtas vid varje ny versionskontroll. En öppen, synlig app kontrollerar var femte minut. GitHub-fel hindrar inte registrering av pass. GitHubs trafikgräns för anonyma API-anrop gäller för serverns utgående IP-adress; försök igen senare om den nås.

Commiten bäddas in vid bygget från `VERCEL_GIT_COMMIT_SHA` eller från `git rev-parse HEAD`. Ingen egen commit-miljövariabel behövs. Vercels Git-variabler identifierar normalt kodrepositoryt; aktivera **Automatically expose System Environment Variables** om de saknas.

| Variabel | Användning |
| --- | --- |
| `GITHUB_CODE_REPOSITORY` | Valfri `OWNER/CODE_FORK` om Vercels repositoryvariabler saknas. Kodforken ska vara publik och separat från journalen. |
| `GITHUB_CODE_BRANCH` | Valfri befintlig kodbranch. Standard är forkens standardbranch; välj samma som driftsätts. |

Kodtoken och uppdateringsadministratörslista behövs inte längre. Du kan ta bort tidigare `GITHUB_CODE_TOKEN` och `GITHUB_UPDATE_ADMIN_IDS` från Vercel och återkalla den gamla kodtokenen i GitHub. Behåll `GIT_DATABASE_TOKEN`, som används för journalen. Driftsätt om efter miljöändringar.

För egen server ansvarar du för att bygga och driftsätta den uppdaterade koden från ett Git-checkout. Git behövs vid bygget om Vercels commitmetadata saknas, men inte på den körande servern.

Källor: [GitHubs guide för att synkronisera en fork](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/syncing-a-fork), [GitHubs jämförelse-API](https://docs.github.com/en/rest/commits/commits#compare-two-commits), [Vercels Git-integration](https://vercel.com/docs/git/vercel-for-github).
