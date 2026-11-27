# Integracje z inteligentnym domem

Każda strefa ma lekki plik `feed.json` (≈ 3 kB), aktualizowany co 15 minut:

```
https://raw.githubusercontent.com/Jupik23/EnergyTracker/data/v1/<strefa>/feed.json
```

`<strefa>` to `pl`, `de`, `fr`, `cz`… Nie trzeba konta ani klucza API.

| Integracja                                          | Plik                                         | Dla kogo                                      |
| --------------------------------------------------- | -------------------------------------------- | --------------------------------------------- |
| [Home Assistant](home-assistant/energytracker.yaml) | pakiet YAML: sensory REST + szablony         | masz Home Assistanta                          |
| [Shelly Gen2+](shelly/energytracker.js)             | skrypt na urządzeniu (Plus, Pro, Gen3, Gen4) | samo gniazdko/przekaźnik, bez HA i bez chmury |
| dowolna (Node-RED, openHAB, Domoticz, ioBroker…)    | `feed.json` przez HTTP GET                   | własne automatyzacje                          |

## Format `feed.json` (wersja 1)

Zmiany są tylko addytywne. Zmiana łamiąca zgodność trafi do `feed2.json`.

| Pole                 | Typ                         | Opis                                                           |
| -------------------- | --------------------------- | -------------------------------------------------------------- |
| `v`                  | `1`                         | wersja formatu                                                 |
| `zone`               | string                      | strefa                                                         |
| `generatedAt`        | ISO UTC                     | kiedy policzono                                                |
| `currency`           | `PLN` \| `EUR`              | waluta cen                                                     |
| `now.t`              | ISO UTC                     | początek bieżącej godziny                                      |
| `now.price`          | number \| null              | cena hurtowa za kWh w bieżącej godzinie                        |
| `now.priceLevel`     | `very_low`…`very_high`      | kwintyl ceny wśród znanych godzin (dziś + jutro)               |
| `now.priceRank`      | 0..1                        | 0 = najtańsza znana godzina, 1 = najdroższa                    |
| `now.co2`            | number \| null              | emisyjność, g CO₂/kWh (ostatni pomiar)                         |
| `now.co2Level`       | jak `priceLevel`            | względem pomiaru i prognozy                                    |
| `now.renewableShare` | %                           | udział OZE w produkcji                                         |
| `prices[]`           | `{t, p}`                    | ceny godzinowe za kWh od bieżącej godziny                      |
| `co2[]`              | `{t, g}`                    | emisyjność godzinowa: ostatnie pomiary, potem prognoza         |
| `cheapest["1".."4"]` | `{start, end, avg}` \| null | najtańsze okno 1–4 h w ciągu najbliższych 24 h                 |
| `cleanest["1".."4"]` | `{start, end, avg}` \| null | najczystsze okno 1–4 h w ciągu najbliższych 24 h (avg w g/kWh) |

Ceny są **hurtowe** (dla Polski: RCE z PSE, w innych krajach rynek dnia następnego) — bez dystrybucji,
marży i VAT. Przy taryfie dynamicznej o różnicach między godzinami decydują właśnie one.

## Prognoza na 7 dni

`v1/pl/forecast.json` — prognoza cen i emisyjności na 7 dni z dziennym podsumowaniem (`days[]`). Przydaje
się do planowania z wyprzedzeniem (np. „ładuj auto w czwartek, będzie wiało”). Opis pól:
[`packages/core/src/forecast.ts`](../packages/core/src/forecast.ts).

## Licencje danych

Energy-Charts (Fraunhofer ISE) — CC BY 4.0 · PSE S.A. — informacja publiczna · Open-Meteo — CC BY 4.0.
Przy publikowaniu danych dalej podaj źródło.
