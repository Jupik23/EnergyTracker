# Jak pracujemy

## Gałęzie i Pull Requesty

- `main` jest zawsze wdrażalny i chroniony: zmiany trafiają tylko przez Pull Request z zielonym CI.
- Nowa praca = nowa gałąź od `main`: `feat/…`, `fix/…`, `chore/…`, `docs/…`, `ci/…`.
- PR-y scalamy przez **squash merge**, tytuł PR-a staje się commitem na `main`.
- `data` to gałąź generowana automatycznie — nigdy jej nie edytuj ręcznie.

## Commity

[Conventional Commits](https://www.conventionalcommits.org/pl/): `typ(zakres): opis`

| Typ        | Kiedy                                 |
| ---------- | ------------------------------------- |
| `feat`     | nowa funkcja widoczna dla użytkownika |
| `fix`      | poprawka błędu                        |
| `chore`    | narzędzia, zależności, konfiguracja   |
| `ci`       | workflowy GitHub Actions              |
| `docs`     | dokumentacja                          |
| `test`     | tylko testy                           |
| `refactor` | zmiana kodu bez zmiany zachowania     |

Zakresy: `app`, `core`, `pipeline`.

## Przed wysłaniem PR-a

```bash
npm run check
```

Uruchamia to samo co CI: Prettier, ESLint, TypeScript, Vitest. CI dodatkowo buduje wersję web.

## Zależności

- Pakiety Expo / React Native instaluj przez `npx expo install <pakiet>` w `apps/mobile` — dobiera wersje
  zgodne z SDK. Aktualizacja SDK: `npx expo install expo@latest --fix`.
- Pozostałe zależności aktualizuje Dependabot.

## Wydania

Wersjonowanie [SemVer](https://semver.org/lang/pl/). Przy wydaniu: wpis w `CHANGELOG.md`, podbicie
`version` w `apps/mobile/app.json`, tag `vX.Y.Z`. Wersja web wdraża się automatycznie z `main`.

## Kontrakt danych

Kształt JSON-a na gałęzi `data` opisują typy w `packages/core/src/types.ts`. Zmiana łamiąca zgodność
wymaga podbicia `SCHEMA_VERSION` i nowej ścieżki (`v2/…`), bo starsze wersje aplikacji mobilnej
w sklepach będą dalej czytać `v1/`.
