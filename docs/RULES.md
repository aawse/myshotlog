# Källor och uppdateringar

Kontrollerat 2026-10-15 mot SPSF:s [officiella regelsida](https://www.pistolskytteforbundet.se/om-pistolskytte/regler/skjuthandboken-och-sakb/) och [Skjuthandboken 21, 2026](https://www.pistolskytteforbundet.se/app/uploads/2026/01/SHB_2026_upplaga-21_NY.pdf). Innehållsförteckningens delar D–O täcker de tolv huvudsakliga grenarna nedan. SRA och tillämpningsserier finns också som separata val. Den historiska bedömningskatalogens källreferens till PPC-cupens exemplar behålls; appens nya nedladdningslänk går till SPSF. Gränserna för precision och tillämpning har jämförts med de officiella sidorna 452–453 (samma sidnummer i den nuvarande PDF-filen).

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
