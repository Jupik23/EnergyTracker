# Architektura

## Decyzje

### 1. Expo (React Native + react-native-web) zamiast osobnych aplikacji

Jeden kod na Android, iOS i web. Expo Router daje adresy URL na webie, EAS Build/Submit pozwala wydać
aplikację do sklepów bez Xcode/Android Studio. Alternatywy: Flutter (inny język, słabszy web),
PWA (brak sklepów i powiadomień na iOS w pełnym zakresie), osobny Next.js + RN (dwa kody).

### 2. Brak backendu — „statyczne API” na gałęzi `data`

Dane zmieniają się co 15 minut i są takie same dla wszystkich użytkowników, więc nie potrzeba serwera
ani bazy. GitHub Actions co 15 min:

1. klonuje poprzednią wersję gałęzi `data`,
2. pobiera dane (`packages/pipeline`),
3. zapisuje `v1/index.json`, `v1/<kraj>/latest.json`, `v1/<kraj>/history/<dzień>.json`,
4. wypycha **jeden** commit (force-push) — historia repo nie puchnie.

Aplikacja czyta pliki z `raw.githubusercontent.com` (CDN, CORS `*`, cache ~5 min).

**Co jest pobierane w którym przebiegu** (`packages/pipeline/src/refresh.ts`): miks — zawsze (zmienia się
co 15 min); ceny — tylko gdy brak cen na dziś, od 13:00 do publikacji cen na jutro, lub gdy cache ma >12 h;
prognoza CO₂ — co godzinę, kraje rozłożone na cztery kwadranse. Wspólny limiter (2,5 s między zapytaniami do
jednego hosta) chroni przed HTTP 429. Typowy przebieg to ok. 35 zapytań, pierwszy (pusty cache) ok. 95.

**Koszt:** 0 zł (repo publiczne = nielimitowane minuty Actions). Przy repo prywatnym 96 uruchomień
dziennie przekroczyłoby darmowe 2000 min/mies.

**Kiedy to przestanie wystarczać** — przejście na mały backend (np. Cloudflare Workers + D1 albo Supabase)
będzie potrzebne przy: powiadomieniach push („za godzinę najtańszy prąd”), kontach użytkowników,
zapytaniach o dowolny zakres historii. Kontrakt danych (`packages/core/src/types.ts`) zostaje ten sam.

**Ryzyko:** GitHub wyłącza harmonogramy w publicznych repo po 60 dniach bez aktywności (commitów na `main`).
Przed wyłączeniem przychodzi e-mail; wystarczy kliknąć „Enable workflow” albo zrobić dowolny commit.

### 2a. Historia na osobnej gałęzi `history`

Archiwum (pliki miesięczne per kraj, godzinowo, ~30 KB/miesiąc) jest na osobnej gałęzi, żeby job co 15 min
klonował tylko małą gałąź `data`. Workflow `update-history.yml` działa raz dziennie (bieżący i poprzedni
miesiąc) i ręcznie do backfillu; publikuje po każdym roku i pomija gotowe miesiące, więc przerwany backfill
można po prostu uruchomić ponownie. Przy publikacji zostaje `.git` z klonu, więc wysyłane są tylko zmienione
pliki.

### 3. Wspólny pakiet `@energy/core`

Typy kontraktu danych i czysta logika (miks, CO₂, wyszukiwanie okna) są współdzielone przez job i aplikację,
więc nie mogą się rozjechać. Pakiet eksportuje surowy TypeScript — Metro i `tsx` kompilują go same.

### 4. Wykresy na zwykłych `View`

Zamiast natywnej biblioteki wykresów (Skia, SVG) — kolumny z `View`. Działa identycznie na trzech
platformach, działa w Expo Go, zero natywnych zależności. Gdy potrzebne będą wykresy liniowe/area,
rozważyć `react-native-svg` (wspierany przez Expo Go).

### 5. Kolory

8 kategorii paliw w stałej kolejności (węgiel, atom, gaz, woda, słońce, wiatr, biomasa, inne), paleta
sprawdzona walidatorem pod kątem daltonizmu (sąsiednie pary ΔE ≥ 10 w trybie jasnym i ciemnym).
Nie zmieniaj kolejności ani kolorów bez ponownej walidacji. Kolory statusu (czysto…bardzo brudno) zawsze
idą w parze z ikoną i etykietą.

## Przepływ danych

```
Energy-Charts /v2/public_power ─► toMixPoint() ─► mix[] (MW wg kategorii, g CO₂/kWh, % OZE)
Energy-Charts /v2/price        ─► prices[EUR]
PSE /rce-pln                   ─► prices[PLN]   (tylko PL, pierwsza na liście)
Energy-Charts /co2eq           ─► co2Forecast[] (best-effort)
                                     │
                                     ▼
                         v1/<kraj>/latest.json ──► app: useData() ─► ekrany
                                                          │
                                       bestWindows() ◄────┘  (planer, liczony na urządzeniu)
```

## Prognoza na 7 dni

```
Energy-Charts (ceny, /co2eq) ─┐
PSE (RCE, rok wstecz)         ├─► train-forecast.yml (co tydzień) ─► gałąź `models`
Open-Meteo previous-runs      ┘     v1/models/pl.json, v1/pl/prices-year.json
                                                │ kopiowane w każdym przebiegu
Open-Meteo forecast (8 dni) ─► update-data.yml ─┴─► v1/pl/forecast.json (co 3 h), v1/<strefa>/feed.json
```

- **Model**: regresja grzbietowa (ridge) w czystym TypeScripcie (`packages/pipeline/src/forecast`), jedna dla ceny
  i jedna dla emisyjności. Cechy: krzywa mocy turbin z prognozy wiatru w 5 punktach, nasłonecznienie i temperatura
  w 5 miastach, godzina, weekend/święto, sezon oraz „kotwica” — średnia z 7 dni przed wydaniem prognozy (niesie
  poziom cen gazu i CO₂, którego pogoda nie zna).
- **Uczciwa ewaluacja**: trening i test używają prognoz pogody wydanych N dni wcześniej (Open-Meteo previous-runs),
  nie pogody, która faktycznie wystąpiła. Ostatnie 8 tygodni to zbiór testowy; jego błędy dają przedział w aplikacji.
  Backtest: `npx tsx packages/pipeline/src/forecast/backtest.ts --cache .cache/forecast`.
- **Wynik** (PL, maj–lis 2026): emisyjność 30–50% dokładniejsza niż „jak tydzień temu”; cena godzinowa tylko
  nieznacznie, ale wybór najtańszych 3 godzin dnia ~2–3× trafniejszy — i to pokazujemy użytkownikowi.
- **Osobna gałąź `models`**: trening trwa kilka minut; gdyby pchał na `data`, ścigałby się z jobem co 15 min
  (force-push jednego commita) albo go blokował.
