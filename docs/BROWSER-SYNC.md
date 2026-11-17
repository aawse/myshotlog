# Lokal lagring och synkronisering

MyShotLog läser journalen från en lokal IndexedDB-kopia och synkroniserar med det privata Git-repositoryt genom autentiserade app-API:er. Inga nya miljövariabler, tjänster, CLI-verktyg eller GitHub-behörigheter behövs. GitHub-tokenen stannar på servern.

## Så fungerar sparning

Profil, vapen, pass, snabbserier, koppling av snabbserier, bedömning av serier och enskilda raderingar sparas först i en atomisk IndexedDB-transaktion tillsammans med en väntande operation. Appen bekräftar lokal sparning först när transaktionen är klar. Listor och formulär uppdateras direkt. Optimerade JPEG-foton följer med kön och kan visas innan de har laddats upp.

Den kompakta statusknappen längst ned till höger skiljer **sparat på denna enhet** från **sparat på GitHub**. Synkning startar ungefär 1,5 sekunder efter en sparning, vid återanslutning och fokus samt ungefär var 30:e sekund när appen är synlig. Öppna statusknappen för fullständig information, **Synka nu**, säkerhetskopior och konfliktgranskning. **Synka nu** startar en kontroll manuellt. Flera ändringar skickas i en batch med högst 20 operationer och cirka 2,7 MB operationsdata. Varje journalpost, revision, bild och koppling behåller sin egen Git-commit; hela kedjan blir synlig genom en enda icke-forcerad uppdatering av databranchens referens.

Synkningen jämför den senast kända commit-hashen. Oförändrat GitHub-head kräver ingen nedladdning av journalfiler. Stora JSON-svar komprimeras med gzip när klienten stöder det för att minska överföringen. Vid ändrat head hämtas aktuell journal; servern återanvänder oförändrade blobbar efter deras Git-SHA för att undvika att läsa samma fil på nytt från GitHub. Commit-hashen är en kontrollpunkt, inte en konfliktlösningsmetod.

Status och **Synpunkter** ligger i samma flytande rad. Kontrollraden har en egen yta
längst ned, medan sidans innehåll rullar ovanför. Skärmens säkra kanter beaktas,
så knapparna inte ligger över formulärfält eller sidans åtgärder. På pekskärmar döljs raden medan ett fält i
sidans formulär har fokus; den reserverade ytan behåller sin höjd så att knappar
inte flyttas under ett tryck. Sidans rullyta kan fokuseras med tangentbord.
Dialogerna visas i webbläsarens översta lager,
ryms i visningsytan och kan stängas med stängknappen eller Escape.
Fel och konflikter markeras även när synkdialogen är stängd; hela statustexten
finns tillgänglig för skärmläsare. Dialogen öppnas inte automatiskt.

## Offline och återhämtning

En redan öppnad app kan läsa cachelagrade journaldata, navigera mellan journalvyer och köa sparningar offline. Visade foton cachelagras i webbläsaren när det går; nya foton finns i kön från början. Omladdning, första besök och inloggning kräver fortfarande en anslutning. Appen kan läggas till på hemskärmen, men en ny sidöppning kräver fortfarande nät och ingen bakgrundssynkning utlovas efter att fliken stängts.

Om synkningen stoppas anger dialogen orsaken när den är känd, till exempel utebliven anslutning, utgången session, för lång svarstid eller ett problem med journallagringen. **Synka nu** försöker igen när anslutningen är tillgänglig. När en enskild ändring har avvisats kan du granska och säkerhetskopiera den, välja **Kontrollera igen** eller bekräfta att den och dess efterföljande beroende ändringar ska tas bort. Åtgärdsbeskrivningen förklarar hur du kan göra om ändringen, exempelvis genom att välja ett foto igen eller använda en tillgänglig journalpost.

Öppna **Senaste synkfel** för att se upp till tio händelser från den öppna appen. Varje rad visar tid, steg, känd orsak och, när det finns ett serversvar, HTTP-status. Vid uppladdning visas också antalet ändringar i anropet. Listan ligger i minnet och töms vid omladdning. Felhistoriken innehåller inga journaluppgifter, adresser eller råa serversvar.

Om servern avvisar en för stor uppladdning försöker appen igen med färre ändringar åt gången. Om en enskild ändring fortfarande är för stor visas den för granskning. Prova **Kontrollera igen** eller ladda ned en säkerhetskopia innan du kasserar ändringen och eventuella beroenden. Gör sedan om ändringen med färre eller mindre foton om den innehöll bilder.

Väntande operationer överlever stängning och återupptas efter nästa inloggade besök i samma webbläsare. Automatisk synkning tar endast bort operationer som servern uttryckligen har bekräftat. Du kan också bekräfta en kassering i konfliktgranskningen. Ett förlorat svar efter en lyckad publicering skapar inte dubbla commits: operationens ID och digest bekräftas atomiskt i journalens `sync-receipts.json`. Den filen är internt synktillstånd och ingår inte i vanlig journalexport. Radera eller ändra den inte manuellt.

**Ladda ned väntande ändringar** skapar `myshotlog-pending.json`. Öppna synkstatus och välj **Ladda upp säkerhetskopia av väntande ändringar**. Välj filen efter inloggning i samma konto och datalagring. Appen köar passen och serierna från filen och försöker synka dem. Vid en kvarstående konflikt visas ändringen för granskning. Återställning lägger till saknade operationer och duplicerar inte samma ID. Använd uppladdningen i synkstatus för det här filformatet. Den vanliga MyShotLog JSON-importen använder journalexportens format. Filen innehåller personliga uppgifter och foton; förvara den privat.

Visade foton begränsas till de 64 senast hämtade refererade bilderna, utöver bilder som behövs av väntande sparningar. Bilder utan aktuella eller väntande referenser tas bort ur cachen efter uppdatering. Webbläsarlagringen begränsas till 32 MiB per journal och högst 200 väntande operationer. Webbläsaren kan ha en lägre tillgänglig kvot. Misslyckad lokal lagring bekräftas aldrig som en lyckad sparning. Exportera väntande ändringar före felsökning eller rensning av webbplatsdata. Webbläsaren kan ta bort lokal lagring, och rensad webbplatsdata tar också bort osynkroniserade ändringar.

## Konflikter och flera enheter

Varje operation innehåller posten som den byggde på. Servern jämför den mot aktuell journal och kör sedan den befintliga valideringen. Ändringar av olika poster kan synkas utan att skriva över varandra. En gammal redigeringsform behåller sin ursprungliga basversion, även om en bakgrundskontroll hittar nyare data.

Vid konflikt publiceras inga nya operationer från batchen. Öppna **Jämför versionerna** i synkdialogen för att se den väntande ändringen och den aktuella GitHub-posten med läsbara fält. **Kontrollera igen** prövar den ursprungliga ändringen mot GitHub och uppdaterar granskningen om konflikten kvarstår. **Behåll enhetens version** köar den granskade ändringen mot GitHub-versionen efter bekräftelse. Den kan få en ny konflikt om posten har ändrats under tiden. Senare ändringar granskas av servern mot sina egna basversioner.

**Behåll serverns version** tar efter bekräftelse bort den valda lokala ändringen och dess efterföljande beroende ändringar. Dialogen visar hur många som tas bort. Andra väntande poster finns kvar. För att kombinera ändringar manuellt kan du granska versionerna, ladda ned en säkerhetskopia, behålla serverns version och sedan göra om de önskade ändringarna i journalen.

Web Locks samordnar synkning mellan flikar på samma origin. Där Web Locks saknas används en atomisk IndexedDB-lease med två minuters utgångstid; en abrupt stängd flik kan därför fördröja nästa försök. BroadcastChannel informerar andra flikar om lokal uppdatering. Serverns konfliktkontroll och beständiga kvittenser skyddar även mot samtidiga enheter och upprepade anrop.

Födelsedatum/födelseår och registreringstid fångas när serien sparas lokalt. En senare profilkorrigering före synkning ändrar inte dessa uppgifter. Regelbedömningen använder passdatumet och bevarad historisk födelseinformation enligt samma motor som tidigare.

## Säkerhet och åtgärder som kräver anslutning

Lokala data är separerade per autentiserat konto och serverns lagringskonfiguration, inklusive repository, branch och prefix. Det innebär inte att lagringen är krypterad eller att andra personer som använder samma webbläsarprofil inte kan läsa den. Cachen och kön finns kvar efter utloggning; appen visar inte ett annat kontos cache. GitHub-token, OAuth-hemlighet och sessionshemlighet lagras aldrig i IndexedDB. Servern väljer alltid journalägare från den signerade sessionscookien och kontrollerar origin före synkskrivningar. Privata API-svar har `private, no-store` och hamnar inte i en gemensam HTTP-cache. Utgången autentisering stoppar synkningen och behåller kön tills användaren loggar in igen.

PDF-export, vanlig JSON/CSV-export, import, radering av hela journalen och skapande/återkallande av vittneslänkar kräver anslutning och färdig synkning. PDF:er och vittnesgranskningar använder därför publicerade data. Anonyma vittnessigneringar fortsätter att skickas direkt till servern.

Synk-API:et begränsar anrop per användare och serverinstans, utan att skriva en Git-baserad trafikräknare för varje periodisk läskontroll. Befintliga Git-baserade OAuth- och andra API-trafikgränser påverkas inte. Synk-API:et har en maximal kropp på 3 MB, högst 20 operationer per batch och validerar samma post- och fotoregler som direkt-API:et. Provider-fel och hemligheter lämnar inte servern.
