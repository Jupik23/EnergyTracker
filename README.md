# EnergyTracker

[![CI](https://github.com/Jupik23/EnergyTracker/actions/workflows/ci.yml/badge.svg)](https://github.com/Jupik23/EnergyTracker/actions/workflows/ci.yml)
[![Update data](https://github.com/Jupik23/EnergyTracker/actions/workflows/update-data.yml/badge.svg)](https://github.com/Jupik23/EnergyTracker/actions/workflows/update-data.yml)

Z czego teraz powstaje prąd, ile CO₂ emituje każda kWh i **kiedy najlepiej włączyć pralkę** — w Polsce,
Niemczech, Francji i Czechach. Jedna aplikacja na web, Androida i iOS.

**Wersja web:** https://jupik23.github.io/EnergyTracker/

| Ekran              | Co pokazuje                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Teraz**          | Emisyjność (g CO₂/kWh), udział OZE, aktualny miks, miks w ciągu doby, prognoza emisji, ceny na dziś i jutro  |
| **Kiedy włączyć?** | Najtańsze albo najczystsze okno dla pralki, zmywarki, suszarki, auta EV, bojlera — z wyliczoną oszczędnością |
| **Źródła**         | Skąd są dane i jakie współczynniki emisji przyjmujemy                                                        |

## Jak to działa

```
 Energy-Charts API ─┐                                    ┌─► Web (GitHub Pages)
 PSE API (RCE, PLN) ─┼─► GitHub Actions co 15 min ─► gałąź `data` ─┼─► Android / iOS (Expo)
                     │   (packages/pipeline)       (statyczny JSON)
```

Nie ma serwera: zaplanowany workflow pobiera dane, liczy emisyjność i publikuje JSON na gałęzi `data`,
a aplikacja czyta go z `raw.githubusercontent.com`. Koszt utrzymania: 0 zł. Szczegóły i uzasadnienie:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Przegląd źródeł danych: [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

## Struktura

```
apps/mobile         Expo (React Native + web), Expo Router
packages/core       wspólne typy i logika: miks, CO₂, wyszukiwanie najlepszego okna
packages/pipeline   job pobierający dane (Node + TypeScript)
.github/workflows   CI, aktualizacja danych, deploy web
```

## Uruchomienie lokalne

Wymagany Node 22+.

```bash
npm install
npm run web                 # aplikacja w przeglądarce (dane z produkcyjnej gałęzi `data`)
npm start                   # Expo dev server — zeskanuj QR w Expo Go na telefonie
npm run pipeline -- --out data-out --countries pl   # uruchom job danych lokalnie
npm run check               # format + lint + typecheck + testy (to samo co CI)
```

Aby aplikacja czytała lokalnie wygenerowane dane, wystaw `data-out/` przez HTTP i ustaw
`EXPO_PUBLIC_DATA_URL=http://localhost:8765/v1`.

## Współpraca

Zasady gałęzi, commitów i PR-ów: [CONTRIBUTING.md](CONTRIBUTING.md). Zmiany: [CHANGELOG.md](CHANGELOG.md).

## Dane i licencje

- [Energy-Charts](https://www.energy-charts.info) (Fraunhofer ISE) — CC BY 4.0
- [PSE S.A.](https://raporty.pse.pl) — Rynkowa Cena Energii (RCE)

Ceny są hurtowe (rynek dnia następnego), bez opłat dystrybucyjnych, marży i VAT.
