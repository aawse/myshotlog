# UI-tester och mobil användning

## Kör lokalt

Använd Node.js 24 och projektets vanliga installation:

```sh
npm ci
npm run test:ui:install
npm run test:ui
```

Playwright är en separat utvecklingsberoende testkörare. `npm test` kör fortfarande
alla enhetstester med Vitest. UI-testerna bygger projektet och startar en egen
produktionsserver på loopback. En redan startad server återanvänds aldrig.
Kommandona fungerar på Windows, macOS och Linux. På Linux installerar
`test:ui:install` även webbläsarnas systembibliotek och kan behöva administratörsrättigheter.

Kör ett projekt med `npx playwright test --project=ios-safari`. Öppna den lokala
rapporten med `npx playwright show-report`. `UI_SKIP_BUILD=1` får bara användas efter
ett lyckat bygge med samma testkonfiguration som i `playwright.config.ts`. Både
CI och vanliga lokala körningar låter Playwright bygga automatiskt. Behåll samma
Playwright-version och låsfil i båda projekten.

## Testmatris

| Projekt          | Motor och profil                         |
| ---------------- | ---------------------------------------- |
| desktop-chromium | Chromium, 1440 × 900                     |
| desktop-firefox  | Firefox, 1366 × 900                      |
| desktop-webkit   | WebKit, 1440 × 900                       |
| android-chrome   | Chromium med Pixel 7-profil och pekskärm |
| ios-safari       | WebKit med iPhone 13-profil och pekskärm |
| ipad-safari      | WebKit med iPad Mini-profil och pekskärm |

Testerna kontrollerar även 320 px bredd. De provar verkligt webbläsarbeteende,
inte bara statisk HTML: interaktioner, lagring, dialoger, sidbredd och mobilmetadata.
Pekskärmsprofiler kontrollerar att relevanta textfält använder minst 16 px text.
Skärmbilder tas vid fel; inga OS-beroende bildjämförelser används.

### Omfattning

Passvisning, redigering och återgång till listan, aktiv navigering, synlig
medaljsummering, dialoger, beständiga ändringar efter omladdning, snabbserier under
tillfälligt nätavbrott, återanslutning, nekad åtkomst, fotoval/JPEG-konvertering,
fotovyn, anonymt vittnesintyg och utgångna inbjudningar. Svenska och engelska ingår.
Den flytande kontrollraden provas på 320 px, surfplatta, dator och liggande vy: knapparna hålls åtskilda, sidans sparknapp är åtkomlig, dialoger ryms och fokus återgår efter Escape. Tester kontrollerar också nedladdning av väntande ändringar och att ett öppet rapportutkast försvinner vid utgången inloggning. Inloggnings- och anonyma vittnessidor saknar rapportkontroller.

De positiva journalflödena använder riktiga signerade kakor med en fiktiv testnyckel
samt mockade synkroniseringssvar. Nekad sidåtkomst och 401 från synkroniserings-API:t
kontrolleras mot serverns verkliga autentisering. Inga testundantag finns i appen.

## CI och testdata

Det separata arbetsflödet **UI tests** (`.github/workflows/ui-tests.yml`) kör
UI-testerna på `ubuntu-latest` med Node.js 24, oberoende av **Tests**. Det körs vid
pull requests, push till `main` och manuellt via **Actions → UI tests → Run workflow**.
Playwright bygger appen med sin egen testkonfiguration före browser-testerna. Chromium, Firefox och WebKit installeras automatiskt. Vid fel
sparas HTML-rapport, skärmbilder och spår i en artefakt i sju dagar.

Testdata, signeringsnycklar och konton är påhittade. Externa webbanrop från
webbläsaren blockeras. Inga riktiga GitHub-konton, privata journaler eller
apphemligheter behövs. Testerna ändrar inte `.env.local`. Testernas lokala
`package.json` väljer CommonJS för Playwrights TypeScript-transformering, så befintliga
JSON-kataloger kan återanvändas utan att ändra produktionskodens modulformat.

## Lägg till på hemskärmen

Webbmanifestet erbjuder ett fristående fönster, tema och 192/512 px ikoner på
HTTPS-installationer. På iPhone/iPad använder du Safaris delningsmeny och
**Lägg till på hemskärmen**. På Android använder du webbläsarens alternativ för
att installera eller lägga till på hemskärmen. På datorer används webbläsarens
installationsfunktion där den finns. Privat app och publik webbplats installeras
separat från sina respektive adresser.

Mobilvyn tar hänsyn till skärmens säkra kanter, större pekfält och tangentbordets
ändrade visningsyta. Nypzoom är fortsatt tillåten. Ingen service worker installeras
och ingen ny HTTP-cache för privata sidor eller API-svar skapas. Installation gör
inte en ny sidöppning utan nät möjlig; den privata appens redan öppna journal kan
fortsatt spara lokalt och synkronisera när anslutningen kommer tillbaka.

## Kontroll på riktiga enheter

Profilerna emulerar mobil vy, användaragent, skala och pekinmatning. WebKit är
Safaris motorfamilj, inte den installerade Safari-versionen. Ubuntu-körningen är
inte ett test av Windows/macOS eller fysisk iOS/Android-hårdvara.

Komplettera inför större gränssnittsändringar med iPhone/iPad Safari, Android
Chrome samt Chrome/Edge/Firefox på Windows och Safari på macOS. Kontrollera särskilt:

- Installation, start från hemskärmen och återgång från bakgrunden.
- Stående/liggande läge, skärmurtag, tangentbord, nypzoom och textförstoring.
- Kamera/bildbibliotek, verkliga fotofiler, ritning med finger och utskrift.
- Tillfälliga nätavbrott och synliga spar-/synkroniseringsbesked; använd fiktiva data.

Se [Playwrights webbläsare](https://playwright.dev/docs/browsers),
[enhetsemulering](https://playwright.dev/docs/emulation) och
[Next.js installationsstöd](https://nextjs.org/docs/app/guides/progressive-web-apps).

## Upprepade körningar

Kör exempelvis `npm run test:ui:repeat -- 5 tests/ui/login.spec.ts tests/ui/csp.spec.ts`
för att undersöka intermittenta fel. Kommandot bygger en gång med UI-testernas
publika bygginställningar och startar sedan en ny server med en tom tillfällig
Git-databas för varje körning. Det stoppar vid första felet. Använd detta i stället
för `--repeat-each` för OAuth-proven: delad serverstatus når annars gränsen fem
inloggningsstarter per klient eller tjugo per installation under tio minuter.
Produktionsgränserna ändras inte.
