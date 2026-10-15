# Skjutprogram och vapen

Varje pass innehåller ett vapen, en vapenögonblicksbild och en gren. Resultatposter kan inte ange ett annat vapen eller en annan gren. Snabbinmatning kopplas till ett pass innan dess gemensamma vapen används. Snabbserier bevarar valt `presetId` och etappvillkor; datum, gren och skjutprogram måste stämma vid koppling. En vald snabbserie ger programmets namn men ersätts aldrig med nygenererade resultat.

## Program

`lib/events/programs.json` innehåller egna databeskrivningar av skjutprogram. Katalogen valideras vid inläsning; alla etiketter ligger i språkfilerna. Namn som skapas vid registrering sparas som journaluppgifter och översätts inte i efterhand. Program fylls bara i för nya pass eller efter användarens val. Att ersätta befintliga resultat kräver bekräftelse. Redigering och import tillämpar aldrig automatiskt ett nytt program på en gammal session.

- Precision: 25 m, 5 skott, 300 sekunder; träning samt sex eller sju serier. SPSF F.6.1, F.6.5.
- Magnumprecision: 50 m, 5 skott, 300 sekunder; träning eller sex serier. G.6.1, G.6.5, G.7.2.
- Snabbskjutning: sex femskottsserier på 25 m. Fem visningar à tre sekunder anges i namnet; någon påhittad sammanhängande tidsgräns används inte. H.6.1, H.7.2–H.7.3.
- Militär snabbmatch: fyra serier vardera på 10, 8 och 6 sekunder, 25 m. J.6.1.
- Nationell helmatch: fyra precisionsserier på 300 sekunder, fyra duellserier och fyra figurserier på 18, 16, 14 och 12 sekunder. I.6.1.
- Luft: 40 eller 60 skott i tiogrupper, 10 m. Hela matchens tidsgräns beror på papper/elektroniska tavlor och fylls inte felaktigt i per grupp. M.7.3.
- Falling Target: fem femskottsserier, ingen obligatorisk tid. N.6.1 och N.6.5.
- PPC: P1500/R1500 (150 skott, tio poängförda etapper), Open/Distinguished (60, fyra etapper), standardklasser (48, fyra etapper), femskottsrevolver (40, fyra etapper). Etappavstånd, ordning och gemensamma etapptider kommer från O.7.7–O.7.9. Välj meter eller yard enligt inbjudan. Optiska P1500/R1500-varianter hanteras som separata klassvärden.
- Nordic Steel Challenge: åtta stationer, fem serier per station utom Outer Limits med fyra. Kontrollera tävlingens faktiska stationsurval. Tider registreras per serie; använd officiellt fastställd placering och resultat. Appen gör inte en komplett officiell Nordic Steel-klassificering.
- Fält, magnumfält, spring, skid, IPSC, SRA och DMR: välj antal stationer, fyll i tävlingens verkliga avstånd, skottantal, mål och villkor. Dessa varierar och får inte gissas från namnet på grenen. Egna grenar har fria namn och resultatanteckningar.

## Villkor och vapenklass

Äldre pass behåller gemensamma `distance`, `target` och `seconds`. Program kan ange `stageDistance`, `stageDistanceUnit`, `stageTimeLimit` och `stageTarget` på resultatet. `seriesConditions` använder dessa uttryckliga programvillkor först och omvandlar yard till meter för beräkning. Visning och PDF behåller originalenheten. Uppmätt tid (`elapsedSeconds`) är en annan uppgift än tidsgränsen.

Vapnet har valfri `hasOptic`, `firearmType` och `classDefaults` per gren. .22 LR utan optik ger klass C i vanliga SPSF-grenar. PPC-programmet anger vapentypens klass; P1500/R1500 med optik får Optical. En oförenlig optisk utrustning ger ingen gissad standardklass. PCC väljer Optics eller Iron. Andra dynamiska klasser behöver användarens kontrollerade förval. Kaliber ensam kan inte bevisa full PPC-behörighet: bland annat riktmedel, pipa, avtryck och modell kan påverka. Kantantänd .22 ger varning i PPC.

Ändrade vapenuppgifter ändrar inte tidigare pass eller vittnesintyg. Nya ögonblicksbilder inkluderar optik, och nya vittnesintyg omfattar optik samt etappvillkor. Import/export, PDF och CSV behåller de nya uppgifterna. Medaljbedömningar är fortsatt begränsade till befintlig precision/tillämpning.

## Träningsunderlag

Fyra ursprungliga A4-PDF:er för siktpunkter/rutnät i svenska och engelska finns i `public/training/` i båda projekten. De har Didact Gothic, kontrollmått 50 mm och är inga officiella tavlor. Återskapa med `node scripts/generate-practice-targets.mjs` och kopiera de fyra filerna till webbplatsens motsvarande mapp. Råd om torrträning finns i språkfilerna och poängterar oladdat vapen, ingen ammunition i övningsområdet, säker riktning och tillverkarens instruktioner. Torrträning kan sparas som egen gren med noll skarpa skott.
