# Verifiering av implementationen

Kör `npm test`, `npm run typecheck`, `npm run format:check` och `npm run build`. Tester använder fiktiva journaler och lokala temporära bare Git-repositories.

Kontroller täcker Git-commits/importer, samtidiga skrivningar, revisionskonflikter, användarisolering, JSON/CSV, GitHub API och OAuth-sessioner. Resultatberäkningar testas vid trösklar för A/B/C och brons/silver/guld, åldersgränser, passdatum och regelversioner. Äldre pass utan sparade bedömningar eller verifieringsfält räknas direkt utan skrivningar. Ombedömningsåtgärder avvisas. Dropdowns, gemensamma passvillkor, födelsedatum och medaljräknare testas också.
