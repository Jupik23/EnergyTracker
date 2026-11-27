# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/), wersjonowanie: [SemVer](https://semver.org/lang/pl/).

## [Unreleased]

### Added

- Dashboard „Teraz”: emisyjność CO₂, udział OZE, miks produkcji, miks w ciągu doby, prognoza emisji,
  ceny hurtowe na dziś i jutro (PL, DE, FR, CZ).
- Planer „Kiedy włączyć?”: najtańsze lub najczystsze okno dla typowych urządzeń z wyliczoną oszczędnością.
- Ekran „Źródła” z opisem metodologii i współczynnikami emisji.
- Job danych w GitHub Actions co 15 minut (Energy-Charts, PSE RCE), publikacja na gałąź `data`,
  archiwum dziennego miksu z 90 dni.
- CI (format, lint, typecheck, testy, build web) i automatyczny deploy wersji web na GitHub Pages.
