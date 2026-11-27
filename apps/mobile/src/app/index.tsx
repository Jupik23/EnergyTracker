import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FUEL_CATEGORIES, FUEL_LABELS_PL, countryByCode } from '@energy/core';
import { MixBar } from '../components/MixBar';
import { Screen } from '../components/Screen';
import { TimeColumns, type Column } from '../components/TimeColumns';
import { Card, LegendItem, Muted, StatTile } from '../components/ui';
import { useData } from '../lib/data';
import { co2Series, hourlyMix, pointAt } from '../lib/derive';
import { co2Level, formatNumber, formatPricePerKwh, formatTime, toHourly } from '../lib/format';
import { FONT, useTheme } from '../lib/theme';

export default function Dashboard() {
  const t = useTheme();
  const { snapshot: s } = useData();
  const now = new Date();

  const charts = useMemo(() => {
    if (!s) return null;
    const mixCols: Column[] = hourlyMix(s.mix).map((h) => ({
      t: h.t,
      segments: FUEL_CATEGORIES.map((c) => ({ key: c, value: h.mw[c] ?? 0, color: t.fuel[c] })),
    }));
    const { measured, forecast } = co2Series(s);
    const co2Cols: Column[] = [
      ...toHourly(measured).map((p) => ({ t: p.t, segments: [{ key: 'm', value: p.v, color: t.accent }] })),
      ...toHourly(forecast).map((p) => ({
        t: p.t,
        segments: [{ key: 'f', value: p.v, color: t.accentSoft }],
      })),
    ].filter((c, i, arr) => arr.findIndex((x) => x.t === c.t) === i);
    const price = s.prices[0];
    const priceCols: Column[] = price
      ? toHourly(price.points).map((p) => ({
          t: p.t,
          segments: [
            {
              key: 'p',
              value: p.v,
              color: Date.parse(p.t) + 3_600_000 <= now.getTime() ? t.deemph : t.accent,
            },
          ],
        }))
      : [];
    return { mixCols, co2Cols, priceCols, price };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, t]);

  if (!s || !charts) return <Screen title="Teraz">{null}</Screen>;

  const latest = s.mix.at(-1);
  const tz = s.timezone;
  const price = charts.price;
  const priceNow = price ? pointAt(price.points, now) : null;
  const co2Now = co2Series(s).measured.at(-1)?.v ?? latest?.co2;
  const level = latest && co2Now != null ? co2Level(co2Now) : null;
  const nowIdx = charts.priceCols.findIndex(
    (c) => Date.parse(c.t) <= now.getTime() && now.getTime() < Date.parse(c.t) + 3_600_000,
  );

  return (
    <Screen title="Teraz">
      {latest && level ? (
        <Card>
          <Text style={[styles.label, { color: t.textMuted }]}>Emisyjność prądu (g CO₂ / kWh)</Text>
          <View style={styles.heroRow}>
            <Text style={[styles.hero, { color: t.text }]}>{formatNumber(co2Now ?? 0)}</Text>
            <View style={[styles.pill, { backgroundColor: t.status[level.level] }]}>
              <Text style={[styles.pillText, { color: level.level === 'warning' ? '#0b0b0b' : '#ffffff' }]}>
                {level.icon} {level.label}
              </Text>
            </View>
          </View>
          <View style={styles.stats}>
            <StatTile label="Udział OZE" value={`${formatNumber(latest.renewableShare)}%`} />
            {price && (
              <StatTile
                label="Cena hurtowa teraz"
                value={priceNow ? formatPricePerKwh(priceNow.v, price.currency) : '—'}
                hint={price.currency === 'PLN' ? 'RCE, bez dystrybucji i VAT' : 'rynek dnia następnego'}
              />
            )}
          </View>
          <Muted>
            Ostatni pomiar: {formatTime(latest.t, tz)} (operatorzy publikują dane z ok. 1–3 h opóźnieniem).
          </Muted>
        </Card>
      ) : (
        <Card>
          <Muted>
            {countryByCode(s.country).hasMix
              ? 'Brak danych pomiarowych z dzisiaj — pojawią się po pierwszej publikacji operatora.'
              : 'Dla tego kraju nie ma publicznych danych o produkcji — pokazujemy ceny i prognozę emisyjności.'}
          </Muted>
          {price && (
            <StatTile
              label="Cena hurtowa teraz"
              value={priceNow ? formatPricePerKwh(priceNow.v, price.currency) : '—'}
              hint="rynek dnia następnego"
            />
          )}
        </Card>
      )}

      {latest && (
        <Card title="Z czego jest prąd" subtitle={`Produkcja o ${formatTime(latest.t, tz)}`}>
          <MixBar point={latest} />
        </Card>
      )}

      {charts.mixCols.length > 0 && (
        <Card title="Miks w ciągu doby" subtitle="Średnia produkcja w każdej godzinie, GW">
          <TimeColumns
            columns={charts.mixCols}
            timeZone={tz}
            accessibilityLabel="Produkcja według źródeł w kolejnych godzinach"
            formatTick={(v) => formatNumber(v / 1000, Number.isInteger(v / 1000) ? 0 : 1)}
            describe={(c) =>
              c.segments
                .filter((x) => x.value > 0)
                .sort((a, b) => b.value - a.value)
                .slice(0, 3)
                .map(
                  (x) =>
                    `${FUEL_LABELS_PL[x.key as keyof typeof FUEL_LABELS_PL]} ${formatNumber(x.value / 1000, 1)} GW`,
                )
                .join(', ')
            }
          />
          <View style={styles.legendGrid}>
            {FUEL_CATEGORIES.filter((c) =>
              charts.mixCols.some((col) => col.segments.some((x) => x.key === c && x.value > 0)),
            ).map((c) => (
              <View key={c} style={styles.legendCell}>
                <LegendItem color={t.fuel[c]} label={FUEL_LABELS_PL[c]} />
              </View>
            ))}
          </View>
        </Card>
      )}

      {charts.co2Cols.length > 0 && (
        <Card title="Emisyjność w czasie" subtitle="g CO₂ / kWh, średnia godzinowa">
          <TimeColumns
            columns={charts.co2Cols}
            timeZone={tz}
            nowMs={now.getTime()}
            accessibilityLabel="Emisyjność CO2 w kolejnych godzinach"
            formatTick={(v) => formatNumber(v)}
            describe={(c) =>
              `${formatNumber(c.segments[0]!.value)} g/kWh${c.segments[0]!.key === 'f' ? ' (prognoza)' : ''}`
            }
            defaultIndex={charts.co2Cols.findIndex((c) => c.segments[0]!.key === 'f') - 1}
          />
          <View style={styles.legendRow}>
            <LegendItem color={t.accent} label="Pomiar" />
            <LegendItem color={t.accentSoft} label="Prognoza (Energy-Charts)" />
          </View>
        </Card>
      )}

      {price && charts.priceCols.length > 0 && (
        <Card
          title="Cena energii — dziś i jutro"
          subtitle={`${price.currency === 'PLN' ? 'zł' : 'c€'} / kWh, rynek dnia następnego. Ceny na jutro po ok. 13:00–14:00.`}
        >
          <TimeColumns
            columns={charts.priceCols}
            timeZone={tz}
            nowMs={now.getTime()}
            defaultIndex={nowIdx >= 0 ? nowIdx : undefined}
            accessibilityLabel="Ceny energii w kolejnych godzinach"
            formatTick={(v) =>
              price.currency === 'PLN' ? formatNumber(v / 1000, 2) : formatNumber(v / 10, 0)
            }
            describe={(c) => formatPricePerKwh(c.segments[0]!.value, price.currency)}
          />
          <Muted>Źródło: {price.source}</Muted>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: FONT.small },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  hero: { fontSize: FONT.hero, fontWeight: '600' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontWeight: '700', fontSize: FONT.small },
  stats: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', marginVertical: 4 },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  legendCell: { width: '33%', minWidth: 100 },
  legendRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
});
