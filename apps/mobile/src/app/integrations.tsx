import { Linking, Platform, StyleSheet, Text } from 'react-native';
import { Screen } from '../components/Screen';
import { Card, Muted } from '../components/ui';
import { DATA_URL, useData } from '../lib/data';
import { FONT, useTheme } from '../lib/theme';

const REPO = 'https://github.com/Jupik23/EnergyTracker/blob/main/integrations';

function Code({ children }: { children: string }) {
  const t = useTheme();
  return (
    <Text
      selectable
      style={[
        styles.code,
        {
          color: t.text,
          backgroundColor: t.page,
          borderColor: t.grid,
          fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
        },
      ]}
    >
      {children}
    </Text>
  );
}

function Link({ url, label }: { url: string; label: string }) {
  const t = useTheme();
  return (
    <Text
      style={[styles.link, { color: t.accent }]}
      accessibilityRole="link"
      onPress={() => Linking.openURL(url)}
    >
      {label}
    </Text>
  );
}

export default function Integrations() {
  const { zone } = useData();
  const feedUrl = `${DATA_URL}/${zone}/feed.json`;

  return (
    <Screen title="Inteligentny dom">
      <Muted>
        Niech urządzenia same włączają się, gdy prąd jest najtańszy albo najczystszy. Wszystko działa bez
        konta i bez naszego serwera — sterownik co 15 minut pobiera mały plik z danymi dla Twojej strefy.
      </Muted>

      <Card title="🏠 Home Assistant" subtitle="Encje z ceną, emisyjnością i najtańszymi oknami">
        <Muted>
          1. Pobierz pakiet i zapisz jako config/packages/energytracker.yaml (pakiety muszą być włączone w
          configuration.yaml — instrukcja jest w pliku). 2. Uruchom ponownie Home Assistant.
        </Muted>
        <Link url={`${REPO}/home-assistant/energytracker.yaml`} label="Pakiet energytracker.yaml ↗" />
        <Muted>Dostaniesz m.in.:</Muted>
        <Code>
          {`sensor.energytracker_cena
sensor.energytracker_emisyjnosc
sensor.energytracker_poziom_ceny
binary_sensor.energytracker_tania_godzina
binary_sensor.energytracker_w_najtanszym_oknie_3_h`}
        </Code>
        <Muted>Przykład: bojler włączony, gdy „w najtańszym oknie 3 h” jest włączone.</Muted>
      </Card>

      <Card title="🔌 Shelly (Plus, Pro, Gen3, Gen4)" subtitle="Bez Home Assistanta i bez chmury">
        <Muted>
          Skrypt działa na samym gniazdku lub przekaźniku: interfejs WWW urządzenia → Scripts → wklej → Start
          i „Run on startup”. Tryby: najtańsze okno N godzin, najtańsze X% godzin, próg ceny albo najczystsze
          okno.
        </Muted>
        <Link url={`${REPO}/shelly/energytracker.js`} label="Skrypt energytracker.js ↗" />
        <Muted>
          Najlepiej do urządzeń, które po prostu pracują pod napięciem: bojler, grzejnik, osuszacz, ładowarka.
          Wiele pralek i zmywarek po włączeniu zasilania nie wznawia programu.
        </Muted>
      </Card>

      <Card
        title="⚙️ Własna integracja (Node-RED, openHAB, Domoticz…)"
        subtitle="Lekki JSON, aktualizowany co 15 minut"
      >
        <Code>{feedUrl}</Code>
        <Muted>Najważniejsze pola:</Muted>
        <Code>
          {`now.price        cena hurtowa teraz (${zone === 'pl' ? 'zł' : '€'}/kWh)
now.priceLevel   very_low … very_high
now.priceRank    0 = najtańsza znana godzina, 1 = najdroższa
now.co2          g CO₂/kWh
prices[]         ceny godzinowe od teraz (dziś + jutro)
cheapest["3"]    najtańsze 3 h w ciągu doby {start, end, avg}
cleanest["3"]    najczystsze 3 h w ciągu doby`}
        </Code>
        <Link url={`${REPO}/README.md`} label="Pełny opis ↗" />
      </Card>

      <Muted>
        Ceny są hurtowe (RCE / rynek dnia następnego) — przy taryfie dynamicznej to one decydują o różnicy
        między godzinami. Dane: Energy-Charts (CC BY 4.0), PSE.
      </Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  code: {
    fontSize: FONT.tiny,
    lineHeight: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 10,
  },
  link: { fontSize: FONT.body, fontWeight: '600' },
});
