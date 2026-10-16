# Källor och uppdateringar

Kontrollerat 2026-10-15 mot SPSF:s [officiella regelsida](https://www.pistolskytteforbundet.se/om-pistolskytte/regler/skjuthandboken-och-sakb/) och [Skjuthandboken 21, 2026](https://www.pistolskytteforbundet.se/app/uploads/2026/01/SHB_2026_upplaga-21_NY.pdf). Innehållsförteckningens delar D–O täcker de tolv huvudsakliga grenarna nedan. SRA och tillämpningsserier finns också som separata val. Den historiska bedömningskatalogens källreferens till PPC-cupens exemplar behålls; appens nya nedladdningslänk går till SPSF. Gränserna för precision och tillämpning har jämförts med de officiella sidorna 452–453 (samma sidnummer i den nuvarande PDF-filen).

## Regelupplaga i passvyn

Passet visar regelupplagans läsbara namn, till exempel **Skjuthandboken 21 (2026)**,
en gång ovanför serierna. Namn och hänvisning hämtas från de aktuella seriernas
bedömningsunderlag eller katalogposten med exakt samma regel-ID. Dagens datum
används inte för att välja ett namn. Om olika upplagor faktiskt förekommer visas
vilka serier som hör till respektive upplaga. Saknad upplagemetadata markeras
utan att ersättas med den senaste upplagan. Egna regelreferenser visas som de
registrerats. Under **Visa sparat bedömningsunderlag** visas sparade resultat, skjutvillkor
och födelseunderlag i namngivna fält samt den sparade jämförelsen med valörens
krav. Tekniska fältnamn och regel-ID:n visas inte. Saknade eller ogiltiga äldre
uppgifter markeras utan att fyllas i från dagens profil eller pass.
Detta ändrar bara presentationen; bedömningar och lagrade resultat ändras inte.

## Täckningsmatris

| Gren                                        | Referens i upplaga 21      | Registrerade mått                                                  | Automatisk kvalifikation            |
| ------------------------------------------- | -------------------------- | ------------------------------------------------------------------ | ----------------------------------- |
| Precisionsskjutning                         | F; bilaga 1 §5.1.1.1       | Serier, skott, poäng, X                                            | Ordinarie precisionsdelprov A/B/C   |
| Fältskjutning                               | D                          | Stationer, träffar, figurer, poängmål, tid; vanlig/poängräkning    | Ej bedömt                           |
| Magnumfältskjutning                         | E                          | Stationer, träffar, figurer, poängmål                              | Ej bedömt                           |
| Magnumprecision                             | G                          | Serier, skott, poäng                                               | Ej bedömt                           |
| Snabbskjutning                              | H                          | Serier, skott, poäng                                               | Ej bedömt                           |
| Nationell helmatch                          | I                          | Namngivna moment, serier, poäng                                    | Ej bedömt                           |
| Militär snabbmatch                          | J                          | Namngivna omgångar, serier, poäng                                  | Ej bedömt                           |
| Skidskytte                                  | K                          | Träffar, tider, manuellt fastställd strafftid                      | Ej bedömt                           |
| Springskytte                                | L                          | Träffar, tider, manuellt fastställd strafftid                      | Ej bedömt                           |
| Luftpistol                                  | M                          | Serier, skott, poäng inklusive decimaler                           | Ej bedömt                           |
| Falling target                              | N                          | Fem serier, skott och träffar. Ingen obligatorisk tid enligt N.6.5 | Ej bedömt                           |
| PPC                                         | O                          | Program/match, serier, poäng, X                                    | Ej bedömt                           |
| SRA                                         | Separat regelverk via SPSF | Stationer, poäng, träffar, tider, manuella avdrag                  | Ej bedömt                           |
| Tillämpningsserie, hjälpform för märkesprov | Bilaga 1 §5.1.1.1          | Träffar, skott, mål, avstånd och tid                               | Ordinarie tillämpningsdelprov A/B/C |

Formulären sparar resultat som skytten eller funktionären redan har fastställt. Totaler är aritmetik, inte fullständig adjudikering, tävlingsranking eller beräkning av regelstyrda straff. Programfält och namngivna resultatposter gör delmoment och PPC-program åtskiljbara. Klassificering anges av användaren; inga kaliberbaserade automatiska gruppbeslut görs.

## Personlig serieberäkning

Motorn använder regelkatalogen i `lib/rules/versions.json` och väljer version efter passdatum, med exklusivt slutdatum. Referens: bilaga 1 §5.1.1–5.1.1.1, tryckta sidor 452–453 (PDF-sidor 454–455). Beräkningen är oberoende av vittnessignaturer och kräver varken verifiering eller skjutledare. Ingen ombedömningsfunktion används. Vyerna använder sparade slutsatser för den aktuella revisionen. Historiska födelseuppgifter bevaras.

Precision: fem skott och heltalspoäng 0–50, minus registrerat poängavdrag, jämförs med brons/silver/guld för A/B/C. Mål, avstånd och tid kan lagras men är inga spärrar för personlig poängklassificering. Åldersavdrag baseras på föregående kalenderår: 1 poäng från 55 år och 2 poäng från 65 år. Tidigare sparade födelseuppgifter används om de finns, annars profilen. Utan födelseuppgifter används ordinarie gränser utan avdrag. Tillämpning kräver sex skott och registrerade träffar/tid.

Andra grenar och datum utan regelversion kan fortfarande vara ej bedömda. Översikten räknar tre precision och tre tillämpning per valör och kalenderår. Alternativa provvägar och standardmedaljer är inte implementerade. Detta är personlig resultatuppföljning.

## Ny upplaga

Lägg till en post med nytt ID, giltighetsperiod, källa och trösklar i regelkatalogen. Behåll äldre versioner så äldre pass använder rätt regler. Perioder får inte överlappa. Kör `npm run rules:sync`, tester, typecheck och build och publicera koden. Uppdateringar kräver ingen databas-migrering eller ombedömning. Vid ändrad åldersgrund eller andra beräkningsprinciper måste motorn utökas.

## Aktuella dokument och kontroll

`lib/rules/sources.json` anger den granskade officiella handbokens länk, upplaga och SHA-256. Träningsmaterial och Inställningar kontrollerar `/api/rules/`. Servern läser endast den fasta SPSF-sidan och PDF-filer på dess tillåtna uppladdningssökväg. Omdirigeringar, externa värdar och godtyckliga användaradresser följs inte. Kontrollen har 15 sekunders totalgräns, storleksgränser, samordnade samtidiga anrop, sex timmars cache för lyckade kontroller och en minut för fel. Inloggning och begränsning av anropsfrekvens krävs. Inga journal- eller GitHub-uppgifter skickas till SPSF.

En ny dokumentlänk eller ändrad fil ger ändringsmeddelande. Saknade dokument, nätfel och ogiltiga svar blir **kunde inte bekräftas**, aldrig ett påstående om aktuella regler. Kontrollens omfattning är handbokens publicering; övriga tillägg och förbundets tolkningar måste läsas separat. Ingenting hämtas in som körbar regelkod, och tidigare resultat bedöms inte om. Vid ny upplaga uppdateras både katalogen och källmanifestet först efter granskning, med äldre versioner kvar.

IPSC:s [regelbokssida](https://www.ipsc.org/ipsc-rules/rule-books/) och SDSSF:s [dokument](https://sdssf.se/press/) är källor för de dynamiska grenarna. Uppgifterna kan registreras, men appen räknar inte officiell matchplacering eller medaljer för dessa grenar. En egen regelreferens sparas med passet. IPSC:s personliga HF-visning är nettopoäng (lägst noll) delat med uppmätt tid, inte officiella stationspoäng eller matchranking.

## Schemalagd kontroll i GitHub

Arbetsflödet **Check rule updates** körs var sjätte månad, den 5 januari och 5 juli kl. 07.23 UTC. Det kan även startas under **Actions → Check rule updates → Run workflow** på standardgrenen. GitHub kan fördröja schemalagda körningar. Inga extra hemligheter, tjänster eller appinställningar behövs: arbetsflödet använder GitHubs inbyggda token med läsbehörighet för kod och skrivbehörighet för ärenden. Actions och Issues måste vara aktiverade i repot; i en fork kan schemalagda arbetsflöden behöva aktiveras. GitHub kan också inaktivera scheman i inaktiva publika repon efter 60 dagar; kontrollera körhistoriken eller starta manuellt då. Se [GitHubs regler för schemalagda körningar](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Den separata granskningsbasen `lib/rules/update-baseline.json` omfattar:

- SPSF:s handbok (alla tolv grenar och tillämpningsproven), rättelser, kompletteringar och publicerad SSA-vapenlista.
- SRA:s regelverk via SPSF:s officiella SRA-sida.
- IPSC:s officiella regelbokssida: samtliga stödda grenar, kombinationsformat, tolkningar och kontrollhandböcker. Översättningar på den internationella sidan ingår inte.
- SDSSF:s svenska handgun-regler, Nordic Steel Challenge, DMR och publicerade märkesfordringar.

Egna grenar saknar en gemensam officiell regelkälla. Kontrollen följer dokumentlänkar från de angivna officiella sidorna. För alla fyra källor jämförs även PDF-filernas SHA-256, så en ersatt fil med samma namn upptäcks. Offentliga Google Drive-filer som länkas från IPSC hämtas genom en fast nedladdningsadress. Inloggningssidor eller bekräftelsesidor räknas inte som PDF-filer. Kontrollen granskar inte alla förbundsnyheter eller fristående beslut som ännu inte länkats från dessa regelsidor.

En ändrad länk, borttagen fil eller ändrad PDF skapar ett ärende med källor, ändringar och en checklista för uppdatering. Samma rapport skapas inte igen, även om ärendet har stängts. En ny kombination av dokumentändringar ger en ny rapport. Ingen kod, regelkatalog eller historisk bedömning ändras automatiskt. Nätfel, blockerade sidor, oväntat tomma dokumentlistor och ogiltiga PDF-filer ger en misslyckad körning med sammanfattning, aldrig besked om aktuella regler. Bekräftade ändringar hos andra förbund rapporteras ändå.

För lokal kontroll utan att skapa ärenden: `node scripts/check-rule-updates.mjs`. Efter manuell granskning och nödvändiga ändringar: `node scripts/check-rule-updates.mjs --write-baseline`. Det senare sparar hela den nya dokumentlistan och PDF-fingeravtrycken endast om alla källor kunde kontrolleras. Granska skillnaden och inkludera basen i samma ändring som regeluppdateringen. Ändra inte äldre katalogversioner eller sparade resultat för att kvittera en publiceringsändring. Appens inloggade SPSF-kontroll och detta halvårsvisa underhållsflöde har olika omfattning.
