# Källor och uppdateringar

Undersökt 2026-10-10. Primär författare: Svenska Pistolskytteförbundet. Dokument: Skjuthandboken, upplaga 21, giltig från 2026-01-01. Tillgänglig PDF finns på [Svenska PPC-cupen](https://www.svenskappccupen.se/wp-content/uploads/2026/01/SHB_2026.pdf). SPSF:s egen handbokssida kunde inte hämtas vid undersökningen. Ingen fullständig inventering av efterföljande ändringar hävdas. Förbundets [grenöversikt](https://www.pistolskytteforbundet.se/) och [SRA-sida](https://www.pistolskytteforbundet.se/om-pistolskytte/sra/) kompletterar innehållsförteckningen.

## Täckningsmatris

| Gren                                        | Referens i upplaga 21      | Registrerade mått                                               | Automatisk kvalifikation            |
| ------------------------------------------- | -------------------------- | --------------------------------------------------------------- | ----------------------------------- |
| Precisionsskjutning                         | F; bilaga 1 §5.1.1.1       | Serier, skott, poäng, X                                         | Ordinarie precisionsdelprov A/B/C   |
| Fältskjutning                               | D                          | Stationer, träffar, figurer, poängmål, tid; vanlig/poängräkning | Ej bedömt                           |
| Magnumfältskjutning                         | E                          | Stationer, träffar, figurer, poängmål                           | Ej bedömt                           |
| Magnumprecision                             | G                          | Serier, skott, poäng                                            | Ej bedömt                           |
| Snabbskjutning                              | H                          | Serier, skott, poäng                                            | Ej bedömt                           |
| Nationell helmatch                          | I                          | Namngivna moment, serier, poäng                                 | Ej bedömt                           |
| Militär snabbmatch                          | J                          | Namngivna omgångar, serier, poäng                               | Ej bedömt                           |
| Skidskytte                                  | K                          | Träffar, tider, manuellt fastställd strafftid                   | Ej bedömt                           |
| Springskytte                                | L                          | Träffar, tider, manuellt fastställd strafftid                   | Ej bedömt                           |
| Luftpistol                                  | M                          | Serier, skott, poäng inklusive decimaler                        | Ej bedömt                           |
| Falling target                              | N                          | Träffar, tider, manuellt fastställd strafftid                   | Ej bedömt                           |
| PPC                                         | O                          | Program/match, serier, poäng, X                                 | Ej bedömt                           |
| SRA                                         | Separat regelverk via SPSF | Stationer, poäng, träffar, tider, manuella avdrag               | Ej bedömt                           |
| Tillämpningsserie, hjälpform för märkesprov | Bilaga 1 §5.1.1.1          | Träffar, skott, mål, avstånd och tid                            | Ordinarie tillämpningsdelprov A/B/C |

Formulären sparar resultat som skytten eller funktionären redan har fastställt. Totaler är aritmetik, inte fullständig adjudikering, tävlingsranking eller beräkning av regelstyrda straff. Programfält och namngivna resultatposter gör delmoment och PPC-program åtskiljbara. Klassificering anges av användaren; inga kaliberbaserade automatiska gruppbeslut görs.

## Personlig serieberäkning

Motorn använder regelkatalogen i `lib/rules/versions.json` och väljer version efter passdatum, med exklusivt slutdatum. Referens: bilaga 1 §5.1.1–5.1.1.1, tryckta sidor 452–453 (PDF-sidor 454–455). Beräkningen är oberoende av vittnessignaturer och kräver varken verifiering eller skjutledare. Ingen ombedömningsfunktion används. Alla vyer räknar direkt från resultaten; tidigare ”ej bedömd”-statusar används inte.

Precision: fem skott och heltalspoäng 0–50, minus registrerat poängavdrag, jämförs med brons/silver/guld för A/B/C. Mål, avstånd och tid kan lagras men är inga spärrar för personlig poängklassificering. Åldersavdrag baseras på föregående kalenderår: 1 poäng från 55 år och 2 poäng från 65 år. Tidigare sparade födelseuppgifter används om de finns, annars profilen. Utan födelseuppgifter används ordinarie gränser utan avdrag. Tillämpning kräver sex skott och registrerade träffar/tid.

Andra grenar och datum utan regelversion kan fortfarande vara ej bedömda. Översikten räknar tre precision och tre tillämpning per valör och kalenderår. Alternativa provvägar och standardmedaljer är inte implementerade. Detta är personlig resultatuppföljning.

## Ny upplaga

Lägg till en post med nytt ID, giltighetsperiod, källa och trösklar i regelkatalogen. Behåll äldre versioner så äldre pass använder rätt regler. Perioder får inte överlappa. Kör `npm run rules:sync`, tester, typecheck och build och publicera koden. Uppdateringar kräver ingen databas-migrering eller ombedömning. Vid ändrad åldersgrund eller andra beräkningsprinciper måste motorn utökas.
