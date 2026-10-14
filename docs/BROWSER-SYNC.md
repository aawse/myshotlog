# Lokal lagring och synkronisering

MyShotLog läser journalen från en lokal IndexedDB-kopia och synkroniserar med det privata Git-repositoryt genom autentiserade app-API:er. Inga nya miljövariabler, tjänster, CLI-verktyg eller GitHub-behörigheter behövs. GitHub-tokenen stannar på servern.

## Så fungerar sparning

Profil, vapen, pass, snabbserier, koppling av snabbserier och enskilda raderingar sparas först i en atomisk IndexedDB-transaktion tillsammans med en väntande operation. Appen bekräftar lokal sparning först när transaktionen är klar. Listor och formulär uppdateras direkt. Optimerade JPEG-foton följer med kön och kan visas innan de har laddats upp.

Status högst upp skiljer **sparat på denna enhet** från **sparat på GitHub**. Synkning startar ungefär 1,5 sekunder efter en sparning, vid återanslutning och fokus samt ungefär var 30:e sekund när appen är synlig. **Synka nu** startar en kontroll manuellt. Flera ändringar skickas i en batch med högst 20 operationer och cirka 2,7 MB operationsdata. Varje journalpost, revision, bild och koppling behåller sin egen Git-commit; hela kedjan blir synlig genom en enda icke-forcerad uppdatering av databranchens referens.

Synkningen jämför den senast kända commit-hashen. Oförändrat GitHub-head kräver ingen nedladdning av journalfiler. Stora JSON-svar komprimeras med gzip när klienten stöder det för att minska överföringen. Vid ändrat head hämtas aktuell journal; servern återanvänder oförändrade blobbar efter deras Git-SHA för att undvika att läsa samma fil på nytt från GitHub. Commit-hashen är en kontrollpunkt, inte en konfliktlösningsmetod.

## Offline och återhämtning

En redan öppnad app kan läsa cachelagrade journaldata, navigera mellan journalvyer och köa sparningar offline. Visade foton cachelagras i webbläsaren när det går; nya foton finns i kön från början. Omladdning, första besök och inloggning kräver fortfarande en anslutning. Appen är inte en installerbar offline-PWA och lovar ingen bakgrundssynkning efter att fliken stängts.

Väntande operationer överlever stängning och återupptas efter nästa inloggade besök i samma webbläsare. Kön rensas endast för operationer som servern uttryckligen har bekräftat. Ett förlorat svar efter en lyckad publicering skapar inte dubbla commits: operationens ID och digest bekräftas atomiskt i journalens `sync-receipts.json`. Den filen är internt synktillstånd och ingår inte i vanlig journalexport. Radera eller ändra den inte manuellt.

**Ladda ned väntande ändringar** skapar `myshotlog-pending.json`. Under **Lagring i denna webbläsare → Återställ säkerhetskopia av väntande ändringar** kan filen återställas efter inloggning i samma konto och datalagring. Återställning lägger till saknade operationer och duplicerar inte samma ID. Formatet är en återhämtningskopia av kön, inte den vanliga MyShotLog JSON-importen. Filen innehåller personliga uppgifter och foton; förvara den privat.

Visade foton begränsas till de 64 senast hämtade refererade bilderna, utöver bilder som behövs av väntande sparningar. Bilder utan aktuella eller väntande referenser tas bort ur cachen efter uppdatering. Webbläsarlagringen begränsas till 32 MiB per journal och högst 200 väntande operationer. Webbläsaren kan ha en lägre tillgänglig kvot. Misslyckad lokal lagring bekräftas aldrig som en lyckad sparning. Exportera väntande ändringar före felsökning eller rensning av webbplatsdata. Webbläsaren kan ta bort lokal lagring, och rensad webbplatsdata tar också bort osynkroniserade ändringar.

## Konflikter och flera enheter

Varje operation innehåller posten som den byggde på. Servern jämför den mot aktuell journal och kör sedan den befintliga valideringen. Ändringar av olika poster kan synkas utan att skriva över varandra. En gammal redigeringsform behåller sin ursprungliga basversion, även om en bakgrundskontroll hittar nyare data.

Vid konflikt publiceras inga nya operationer från batchen. Både den väntande ändringen och den aktuella serverposten kan granskas i appen. **Behåll enhetens version** bygger en ny operation mot serverns aktuella basversion; den kan fortfarande få en ny konflikt om någon annan hinner ändra posten. **Behåll serverns version** kastar den valda lokala ändringen och dess efterföljande beroende ändringar, med antalet tydligt angivet. Andra väntande poster finns kvar.

Web Locks samordnar synkning mellan flikar på samma origin. Där Web Locks saknas används en atomisk IndexedDB-lease med två minuters utgångstid; en abrupt stängd flik kan därför fördröja nästa försök. BroadcastChannel informerar andra flikar om lokal uppdatering. Serverns konfliktkontroll och beständiga kvittenser skyddar även mot samtidiga enheter och upprepade anrop.

Födelsedatum/födelseår och registreringstid fångas när serien sparas lokalt. En senare profilkorrigering före synkning ändrar inte dessa uppgifter. Regelbedömningen använder passdatumet och bevarad historisk födelseinformation enligt samma motor som tidigare.

## Säkerhet och åtgärder som kräver anslutning

Lokala data är separerade per autentiserat konto och serverns lagringskonfiguration, inklusive repository, branch och prefix. Det innebär inte att lagringen är krypterad eller att andra personer som använder samma webbläsarprofil inte kan läsa den. Cachen och kön finns kvar efter utloggning; appen visar inte ett annat kontos cache. GitHub-token, OAuth-hemlighet och sessionshemlighet lagras aldrig i IndexedDB. Servern väljer alltid journalägare från den signerade sessionscookien och kontrollerar origin före synkskrivningar. Privata API-svar har `private, no-store` och hamnar inte i en gemensam HTTP-cache. Utgången autentisering stoppar synkningen och behåller kön tills användaren loggar in igen.

PDF-export, vanlig JSON/CSV-export, import, radering av hela journalen och skapande/återkallande av vittneslänkar kräver anslutning och färdig synkning. PDF:er och vittnesgranskningar använder därför publicerade data. Anonyma vittnessigneringar fortsätter att skickas direkt till servern.

Synk-API:et begränsar anrop per användare och serverinstans, utan att skriva en Git-baserad trafikräknare för varje periodisk läskontroll. Befintliga Git-baserade OAuth- och andra API-trafikgränser påverkas inte. Synk-API:et har en maximal kropp på 3 MB, högst 20 operationer per batch och validerar samma post- och fotoregler som direkt-API:et. Provider-fel och hemligheter lämnar inte servern.
