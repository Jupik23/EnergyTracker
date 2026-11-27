# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/), wersjonowanie: [SemVer](https://semver.org/lang/pl/).

## [Unreleased]

### Added

- Ekran „Historia”: kalendarz dni podbarwiony emisyjnością, miks i emisyjność godzina po godzinie dla
  dowolnego dnia, średnie miesięczne pokazujące różnice między porami roku; link do dnia `?date=2025-05-15`.
- Archiwum historyczne na gałęzi `history` (miesięczne pliki per kraj, godzinowo) z codzienną aktualizacją
  i ręcznym backfillem.
- **Prognoza na 7 dni** (zakładka „Prognoza”, na razie Polska): ceny i emisyjność godzina po godzinie z przedziałem
  niepewności, dzienne podsumowanie „pogoda dla prądu” i najtańsze/najczystsze 3 h każdego dnia. Model regresji
  (ridge) na prognozach wiatru, słońca i temperatury (Open-Meteo) trenowany co tydzień; trafność pokazana w aplikacji.
- **Porównanie taryf** (zakładka „Taryfy”): roczny koszt brutto w G11, G12, G12w, G13, G13s, G12sezON, G13active,
  G12eko i w taryfie dynamicznej dla 5 operatorów (PGE, Tauron, Enea, Energa, Stoen), stawki 2026, profile zużycia
  i przesuwanie zużycia w tańsze godziny.
- **Inteligentny dom**: lekki `feed.json` dla każdej strefy, pakiet dla Home Assistant i skrypt dla Shelly Gen2+.
- 27 krajów i 41 stref cenowych (m.in. SE1–4, NO1–5, DK1–2, 7 stref Włoch) z wyszukiwarką; wybrany obszar jest
  zapamiętywany na urządzeniu.
- Archiwum dzienne zawiera teraz także ceny.

### Changed

- Job danych pobiera ceny tylko wtedy, gdy są potrzebne (raz po publikacji ok. 13:00 i jako zabezpieczenie co 12 h),
  a prognozę CO₂ co godzinę, rozłożoną na kolejne przebiegi — mieści się w limicie zapytań Energy-Charts.
- Rozdzielczość miksu zgodna ze źródłem (15 min, 30 min albo 1 h zależnie od kraju).

- Dashboard „Teraz”: emisyjność CO₂, udział OZE, miks produkcji, miks w ciągu doby, prognoza emisji,
  ceny hurtowe na dziś i jutro (PL, DE, FR, CZ).
- Planer „Kiedy włączyć?”: najtańsze lub najczystsze okno dla typowych urządzeń z wyliczoną oszczędnością.
- Ekran „Źródła” z opisem metodologii i współczynnikami emisji.
- Job danych w GitHub Actions co 15 minut (Energy-Charts, PSE RCE), publikacja na gałąź `data`,
  archiwum dziennego miksu z 90 dni.
- CI (format, lint, typecheck, testy, build web) i automatyczny deploy wersji web na GitHub Pages.
