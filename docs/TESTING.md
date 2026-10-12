# Verifiering av implementationen

Kör `npm test`, `npm run typecheck`, `npm run format:check` och `npm run build`. Tester använder fiktiva journaler och lokala temporära bare Git-repositories.

Kontroller täcker Git-commits/importer, samtidiga skrivningar, revisionskonflikter, användarisolering, JSON/CSV, GitHub API och OAuth-sessioner. Resultatberäkningar testas vid trösklar för A/B/C och brons/silver/guld, åldersgränser, passdatum och regelversioner. Äldre pass utan sparade bedömningar eller verifieringsfält räknas direkt utan skrivningar. Ombedömningsåtgärder avvisas. Dropdowns, gemensamma passvillkor, födelsedatum och medaljräknare testas också.


GitHub-workflowen `Tests` kör samtliga tester, typkontroll och produktionsbygge på `ubuntu-latest` med Node.js 24. Samma npm-kommandon används lokalt på alla operativsystem. Git måste finnas i PATH för integrationstesterna. Inga tester hoppas över på Windows: push-avslag simuleras med `receive.maxInputSize`, och filsystemtester använder `node:os.tmpdir()` och `node:path.join()`. Git-testerna kör också med mellanslag i repository-sökvägen och verifierar att svenska tecken och emoji bevaras över flera UTF-8-utdatablock. Temporära repository-namn hålls i ASCII för att undvika skillnader i Git-versioners Unicode-normalisering av katalognamn.
