# Vittnesintyg

Öppna ett sparat pass och välj **Begär vittnesintyg**. Välj hela passet eller en enskild serie. Dela länken, låt vittnet skanna QR-koden eller öppna länken och lämna över telefonen. Länken visas bara efter att den skapats; kopiera den innan du laddar om sidan. Du kan återkalla en aktiv inbjudan från passet.

Vittnet behöver inget konto. Vittnessidan kan visas på svenska eller engelska och visar datum, starttid, plats, gren, program, vapnets tillverkare/modell/kaliber, skjutvillkor och valda råresultat. Vid ett intyg för en enskild serie visas även seriens tavelfoto, om det finns. Fotot kan öppnas i samma bildmodal som i journalen. Inbjudningar för ett helt pass delar inga foton. Profil, födelsedatum, vapnets serienummer, anteckningar och andra pass delas inte. Vittnet skriver sitt namn, ritar en namnteckning med finger eller mus och bekräftar intygstexten innan det sparas. Namnet är självuppgivet; identiteten verifieras inte.

## Vad intyget omfattar

Ett serieintyg gäller serien och dess skjutvillkor. Ett passintyg omfattar samtliga serier som visades. Originalögonblicksbilden, intygstexten, språk, textversion, serverns tidsstämpel och PNG-namnteckningen bevaras. Flera vittnen kan intyga samma resultat.

Efter ändrade resultat eller villkor visas att intyget gäller tidigare resultat. Nya eller borttagna serier ändrar omfattningen av ett passintyg. Ett serieintyg påverkas inte när en annan serie ändras. Ändrade profiluppgifter, anteckningar, revisionsnummer eller märkesbedömningar påverkar inte intyget. Inbjudningar till ändrade resultat kan inte användas; skapa en ny inbjudan. Intyg påverkar aldrig guld-, silver- eller bronsbedömningen.

## Lagring och åtkomst

Inbjudningar gäller i 24 timmar och kan användas för ett intyg. Att öppna länken förbrukar den inte. Ett slumpvärde och ett ändamålsbundet HMAC-signerat token begränsar åtkomsten till ägarens inbjudan på rätt origin. Tokens kontrolleras mot aktuell tillåtelselista och ägar-ID-mappning. Git lagrar bara token-hashen. Länkens token ligger i URL-fragmentet, skickas i POST-body och tas bort från den öppnade sidans adress; det skrivs inte till cookies eller local storage.

Signatur och förbrukad inbjudan publiceras tillsammans i en atomisk Git-uppdatering. Samtidiga signeringsförsök kan bara skapa ett intyg. Kontroller använder färska Git-snapshots, inte läscachen. Ägaren måste vara inloggad för att skapa eller återkalla inbjudningar. API:t kräver rätt Origin, strikt validerade fält, explicit bekräftelse och har en gräns på 160 kB per anrop. Anonyma anrop begränsas både globalt och per klient; klientnycklar följer samma hashade IP-hantering som appens övriga trafikskydd.

Namnteckningen skapas som en PNG på högst 800 × 300 pixlar i webbläsaren. Servern begränsar bildstorleken till 100 kB, avkodar och validerar bilden, avvisar tomma bilder och kodar om pixlarna för att ta bort metadata. Ingen permanent eller temporär uppladdningsfil skapas på servern. Bilden lagras som base64 i intyget i det privata Git-repot.

Vittnessidor har `no-store`, `no-referrer` och `noindex` och laddar inga Analytics- eller Speed Insights-komponenter. Telemetrifilter stoppar även sena vittneshändelser från script som redan laddats före navigationen. Analytics utelämnar nu även frågeparametrar och fragment för övriga sidor.

## Backup och radering

JSON-export/import bevarar intyg, namnteckningar och de råresultat som intygades. Levande inbjudningar eller deras tokens exporteras inte. Befintliga säkerhetskopior utan intyg går fortfarande att importera. Import validerar snapshot-hash och bilddata; intyg kopieras utan ny signering eller ändrad tidsstämpel. Märkesbedömning görs fortfarande separat med reglerna för passdatumet. CSV innehåller råresultat, inte namnteckningar.

När ett pass eller hela journalen raderas tas dess intyg och inbjudningar bort från aktuell lagring. Tidigare versioner, namn och namnteckningar finns kvar i Git-historiken och eventuella kopior, precis som övriga journaluppgifter. JSON-import har fortfarande gränsen 3 MB; använd Git-backup för större journaler.

## Kom ihåg vittnet på enheten

Efter ett sparat intyg kan vittnessidan komma ihåg vittnets namn och PNG-namnteckning i webbläsarens lokala lagring på samma webbplats. Nästa inbjudan fyller i uppgifterna, men vittnet måste fortfarande granska och bekräfta de valda resultaten varje gång. Inbjudningstokens, resultat och bekräftelse sparas aldrig i detta webbläsarminne. Misslyckade bevittningar sparar inga nya uppgifter.

Vittnet kan stänga av **Kom ihåg mitt namn och min signatur på denna enhet** för att ta bort de sparade uppgifterna, eller välja **Glöm sparat vittne** för att även tömma formuläret. Kontrollerna finns kvar efter signering och på vittnessidan utan inbjudan. Använd dem innan en delad enhet lämnas över till någon annan. Inställningen sparas lokalt. Att rensa webbläsarens webbplatsdata tar också bort uppgifterna. Om webbläsarlagring blockeras eller är full fungerar bevittning fortfarande utan att uppgifterna sparas i webbläsaren. Detta minne är separat från intygen i ägarens journal; att glömma vittnet tar inte bort sparade intyg.
