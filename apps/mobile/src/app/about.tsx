import { Linking, StyleSheet, Text, View } from 'react-native';
import { FUELS, FUEL_LABELS_PL } from '@energy/core';
import { Screen } from '../components/Screen';
import { Card, Muted } from '../components/ui';
import { useData } from '../lib/data';
import { formatTime } from '../lib/format';
import { FONT, useTheme } from '../lib/theme';

const SOURCES = [
  {
    name: 'Energy-Charts (Fraunhofer ISE)',
    url: 'https://www.energy-charts.info',
    what: 'Miks produkcji (15 min), ceny rynku dnia następnego, prognoza emisyjności. Licencja CC BY 4.0.',
  },
  {
    name: 'PSE — raporty.pse.pl',
    url: 'https://raporty.pse.pl',
    what: 'Rynkowa Cena Energii (RCE) dla Polski w zł/MWh.',
  },
  {
    name: 'ENTSO-E Transparency Platform',
    url: 'https://transparency.entsoe.eu',
    what: 'Pierwotne źródło danych dla większości krajów UE (przez Energy-Charts).',
  },
];

export default function About() {
  const t = useTheme();
  const { snapshot } = useData();
  return (
    <Screen title="Źródła i metoda" showCountry={false}>
      <Card title="Skąd są dane">
        {SOURCES.map((s) => (
          <View key={s.url} style={{ gap: 2, paddingVertical: 4 }}>
            <Text
              style={[styles.link, { color: t.accent }]}
              accessibilityRole="link"
              onPress={() => Linking.openURL(s.url)}
            >
              {s.name}
            </Text>
            <Muted>{s.what}</Muted>
          </View>
        ))}
        {snapshot && (
          <Muted>
            Ostatnia aktualizacja: {formatTime(snapshot.generatedAt, snapshot.timezone)} (dane odświeżane co
            ~15 min).
          </Muted>
        )}
      </Card>

      <Card title="Jak liczymy emisyjność">
        <Muted>
          Emisyjność to średnia ważona produkcją ze współczynników cyklu życia (g CO₂-eq/kWh, mediany IPCC
          AR5; węgiel brunatny wg UBA). Liczymy ją dla produkcji krajowej — import, eksport i magazyny energii
          są pomijane.
        </Muted>
        <View style={styles.table}>
          {Object.entries(FUELS).map(([id, f]) => (
            <View key={id} style={[styles.tr, { borderBottomColor: t.grid }]}>
              <Text style={[styles.td, { color: t.text }]}>{id.replace(/_/g, ' ')}</Text>
              <Text style={[styles.td, { color: t.textMuted }]}>{FUEL_LABELS_PL[f.category]}</Text>
              <Text style={[styles.tdNum, { color: t.text }]}>{f.gCo2PerKwh}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Muted>
        Prototyp. Ceny są hurtowe i nie zawierają opłat dystrybucyjnych ani podatków. Aplikacja nie jest
        poradą finansową.
      </Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  link: { fontSize: FONT.body, fontWeight: '600' },
  table: { marginTop: 4 },
  tr: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  td: { flex: 2, fontSize: FONT.small },
  tdNum: { flex: 1, fontSize: FONT.small, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
