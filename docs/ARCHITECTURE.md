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
