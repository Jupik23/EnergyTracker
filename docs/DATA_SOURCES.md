# Źródła danych — przegląd (stan: listopad 2026)

Wszystkie źródła sprawdzone zapytaniami „na żywo” przy budowie prototypu.

| Źródło                                                          | Co daje                                                                                                        | Klucz API                                                               | Limit / uwagi                                                                                                            | Użyte                             |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| **Energy-Charts API** (Fraunhofer ISE) `api.energy-charts.info` | Produkcja wg źródeł (15 min) dla ~40 krajów, ceny day-ahead (15 min, dziś + jutro), udział OZE                 | **nie**                                                                 | Agresywny rate-limit (HTTP 429 przy kilku zapytaniach/s), CORS tylko dla własnej domeny → trzeba pośredniczyć (nasz job) | ✅ główne                         |
| Energy-Charts `/co2eq`                                          | Emisyjność zmierzona + **prognoza** na ~1,5 doby                                                               | nie                                                                     | Nie ma go w opublikowanej specyfikacji OpenAPI → traktujemy jako „best-effort”                                           | ✅ prognoza                       |
| **PSE** `api.raporty.pse.pl`                                    | RCE (zł/MWh, 15 min, ceny na jutro ok. 14:00), bilans KSE (`his-wlk-cal`: cieplne, wiatr, PV, zapotrzebowanie) | **nie**                                                                 | OData, stronicowanie `nextLink`                                                                                          | ✅ ceny PLN                       |
| **ENTSO-E Transparency Platform**                               | Pierwotne źródło dla całej UE (produkcja, ceny, przepływy)                                                     | **tak** (darmowy token: rejestracja + e-mail do transparency@entsoe.eu) | 400 zapytań/min, XML                                                                                                     | ⏳ planowane jako źródło zapasowe |
| **RTE éCO2mix** przez ODRE `odre.opendatasoft.com`              | Francja: miks 15 min + oficjalny `taux_co2`                                                                    | nie                                                                     | Opendatasoft API v2.1                                                                                                    | ⏳ opcjonalnie dla FR             |
| TGE (Towarowa Giełda Energii)                                   | Fixing RDN                                                                                                     | —                                                                       | Brak darmowego API; ten sam wynik aukcji SDAC jest w Energy-Charts/ENTSO-E i w RCE                                       | ❌                                |
| Electricity Maps                                                | Emisyjność, prognozy                                                                                           | tak                                                                     | Darmowy plan tylko niekomercyjny, 1 strefa                                                                               | ❌ (licencja)                     |

## Dlaczego RCE dla Polski

Taryfy dynamiczne w Polsce rozliczają energię według cen z rynku dnia następnego. RCE publikowana przez PSE
to cena z tego rynku w zł/MWh w rozdzielczości 15 min — dokładnie to, czego potrzebuje planer. Dla innych
krajów używamy cen day-ahead w EUR z Energy-Charts.

## Opóźnienia

- Produkcja: operatorzy publikują dane z ok. 1–3 h opóźnieniem — aplikacja pokazuje godzinę ostatniego pomiaru.
- Ceny na jutro: po aukcji SDAC (~12:45 CET), w RCE ok. 14:00.
- Job działa co 15 min; GitHub może opóźnić uruchomienia harmonogramu o kilka minut.

## Emisyjność — metoda

Liczymy sami z miksu produkcji (średnia ważona) ze współczynników cyklu życia IPCC AR5 (mediany),
węgiel brunatny 1100 g/kWh (UBA). Import/eksport i magazyny pomijamy (metoda „production-based”).
Prognoza pochodzi z Energy-Charts i może się różnić o kilka–kilkanaście procent od naszej wartości.
Współczynniki: `packages/core/src/fuels.ts`.
