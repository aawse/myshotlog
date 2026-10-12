# Tester och kontroller

Kör från projektets rot med Node.js 24 och Git i PATH:

```sh
npm test
npm run typecheck
npm run format:check
npm run build
```

Tester använder fiktiva journaler, mockade provider-svar och lokala temporära bare Git-repositories. Inga riktiga apphemligheter eller anslutningar till datarepot behövs. Ett lokalt test eller bygge verifierar inte den publicerade installationens GitHub-/Vercel-inställningar.

Kontrollerna täcker bland annat:

- Språkval från profilen, svensk standard, identiska översättningsnycklar och oförändrade användarinmatade värden.
- Postcommits, atomiska importer, samtidiga skrivningar, revisionskonflikter och användarisolering.
- GitHub API, OAuth-state/PKCE, engångsflöden, stateless sessionskontroller utan Git, origin/version/utgång och gemensamma trafikgränser.
- JSON/CSV, fotovalidering, bildreferenser, deduplicering och städning av tillfälliga Git-repositories.
- Brons/silver/guld för A/B/C, åldersgränser, passdatum och regelversioner.
- Gemensamma passvillkor, vapenpreferenser, medaljräknare, platsförslag och snabbserier.
- Storleksbegränsad läsning av request-body och CSP, inklusive API-rutter som går förbi Proxy:s body-kloning.

Git-tester använder `node:os.tmpdir()` och `node:path.join()`, och simulerar push-avslag genom Git-inställningen `receive.maxInputSize` i stället för Unix-shellskript. Sökvägar med mellanslag samt svenska tecken och emoji i data testas. Temporära repository-namn hålls i ASCII för att undvika Git-versioners skillnader i Unicode-normalisering av katalognamn. Samma npm-kommandon kan användas lokalt på Windows, macOS och Linux.

## GitHub Actions

Workflowen **Tests** kör `npm ci`, samtliga tester, typkontroll och produktionsbygge på **`ubuntu-latest` med Node.js 24**. Den startar vid pull requests, push till `main` och manuell körning. CI kör inte macOS- eller Windows-jobb.

Manuell körning finns under **Actions → Tests → Run workflow** när workflowfilen finns på standardbranchen. Actions är fästa vid commit-SHA:n och Dependabot kontrollerar uppdateringar varje vecka. Workflowen behöver inga apphemligheter eller datarepo-behörigheter.

## Kontroll efter publicering

Verifiera separat att GitHub-inloggning fungerar på den konfigurerade origin, att en post och ett foto kan sparas/hämtas och att utloggning, JSON-export och CSV-export fungerar. För Web Analytics ska projektet först aktiveras i Vercel och publiceras om; kontrollera sedan sidvisningar i dashboarden.
