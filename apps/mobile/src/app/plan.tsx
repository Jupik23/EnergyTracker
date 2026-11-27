import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { bestWindows, windowStartingAt, type Point } from '@energy/core';
import { Screen } from '../components/Screen';
import { TimeColumns, type Column } from '../components/TimeColumns';
import { Card, Chip, LegendItem, Muted } from '../components/ui';
import { APPLIANCES } from '../lib/appliances';
import { useData } from '../lib/data';
import { co2Series } from '../lib/derive';
import { formatMoney, formatNumber, formatPricePerKwh, formatRange, toHourly } from '../lib/format';
import { FONT, useTheme } from '../lib/theme';

type Mode = 'cheap' | 'clean';

export default function Planner() {
  const t = useTheme();
  const { snapshot: s } = useData();
  const [applianceId, setApplianceId] = useState(APPLIANCES[0]!.id);
  const [mode, setMode] = useState<Mode>('cheap');
  const appliance = APPLIANCES.find((a) => a.id === applianceId)!;
  const now = new Date();

  const result = useMemo(() => {
    if (!s) return null;
    const price = s.prices[0];
    let points: Point[] = [];
    if (mode === 'cheap' && price) points = price.points;
    if (mode === 'clean') {
      const { measured, forecast } = co2Series(s);
      // Include the latest measurement so "start now" has a baseline even when the forecast starts later.
      points = [...measured.slice(-1), ...forecast];
    }
    const future = points.filter((p) => Date.parse(p.t) + 3_600_000 > now.getTime());
    const windows = bestWindows(future, {
      durationMinutes: appliance.durationMinutes,
      notBefore: now,
      limit: 3,
    });
    const baseline = windowStartingAt(points, now, appliance.durationMinutes);
    return { price, points: future, windows, baseline };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, mode, appliance]);

  const best = result?.windows[0];
  const columns: Column[] = useMemo(() => {
    if (!result) return [];
    return toHourly(result.points).map((p) => {
      const ms = Date.parse(p.t);
      const inBest = best && ms < Date.parse(best.end) && ms + 3_600_000 > Date.parse(best.start);
      return {
        t: p.t,
        segments: [{ key: inBest ? 'best' : 'x', value: p.v, color: inBest ? t.accent : t.deemph }],
      };
    });
  }, [result, best, t]);

  const unit = (v: number) =>
    mode === 'cheap' && result?.price
      ? formatPricePerKwh(v, result.price.currency)
      : `${formatNumber(v)} g CO₂/kWh`;

  const saving = (avg: number) => {
    if (!result?.baseline) return null;
    const diff = result.baseline.avg - avg;
    if (diff <= 0) return null;
    if (mode === 'cheap' && result.price) {
      return `${formatMoney((diff / 1000) * appliance.kwh, result.price.currency)} taniej niż teraz`;
    }
    return `${formatNumber((diff * appliance.kwh) / 1000, 2)} kg CO₂ mniej niż teraz`;
  };

  return (
    <Screen title="Kiedy włączyć?">
      <Card title="Urządzenie">
        <View style={styles.chips}>
          {APPLIANCES.map((a) => (
            <Chip
              key={a.id}
              label={`${a.icon} ${a.name}`}
              selected={a.id === applianceId}
              onPress={() => setApplianceId(a.id)}
            />
          ))}
        </View>
        <Muted>
          Czas pracy {formatNumber(appliance.durationMinutes / 60, 1)} h · ok.{' '}
          {formatNumber(appliance.kwh, 1)} kWh na cykl
        </Muted>
        <View style={styles.chips}>
          <Chip label="💰 Najtaniej" selected={mode === 'cheap'} onPress={() => setMode('cheap')} />
          <Chip label="🌱 Najczyściej" selected={mode === 'clean'} onPress={() => setMode('clean')} />
        </View>
      </Card>

      {s && result && (
        <Card title={mode === 'cheap' ? 'Najtańsze terminy' : 'Najczystsze terminy'}>
          {result.windows.length === 0 ? (
            <Muted>
              {mode === 'clean'
                ? 'Brak prognozy emisyjności dla tego kraju — spróbuj trybu „Najtaniej”.'
                : 'Brak cen na najbliższe godziny.'}
            </Muted>
          ) : (
            result.windows.map((w, i) => (
              <View
                key={w.start}
                style={[
                  styles.row,
                  i > 0 && { borderTopColor: t.grid, borderTopWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <Text style={[styles.rank, { color: i === 0 ? t.accent : t.textMuted }]}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.when, { color: t.text }]}>
                    {formatRange(w.start, w.end, s.timezone)}
                  </Text>
                  <Text style={{ color: t.textMuted, fontSize: FONT.small }}>
                    średnio {unit(w.avg)}
                    {saving(w.avg) ? ` · ${saving(w.avg)}` : ''}
                  </Text>
                </View>
              </View>
            ))
          )}
          {result.baseline && <Muted>Gdybyś włączył(a) teraz: średnio {unit(result.baseline.avg)}.</Muted>}
        </Card>
      )}

      {s && columns.length > 0 && (
        <Card
          title="Najbliższe godziny"
          subtitle={mode === 'cheap' ? 'Cena hurtowa, średnia godzinowa' : 'Emisyjność, g CO₂/kWh'}
        >
          <TimeColumns
            columns={columns}
            timeZone={s.timezone}
            nowMs={now.getTime()}
            defaultIndex={best ? columns.findIndex((c) => c.segments[0]!.key === 'best') : 0}
            accessibilityLabel="Wartości w najbliższych godzinach z zaznaczonym najlepszym terminem"
            formatTick={(v) =>
              mode === 'cheap' && result?.price
                ? result.price.currency === 'PLN'
                  ? formatNumber(v / 1000, 2)
                  : formatNumber(v / 10)
                : formatNumber(v)
            }
            describe={(c) => unit(c.segments[0]!.value)}
          />
          <View style={styles.chips}>
            <LegendItem color={t.accent} label="Najlepszy termin" />
            <LegendItem color={t.deemph} label="Pozostałe godziny" />
          </View>
        </Card>
      )}

      <Muted>
        Ceny to stawki hurtowe z rynku dnia następnego (dla Polski: RCE z PSE). Przy taryfie dynamicznej
        rachunek zależy od nich, ale dochodzą opłaty dystrybucyjne, marża sprzedawcy i VAT — liczy się różnica
        między godzinami, nie sama kwota.
      </Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rank: { fontSize: FONT.title, fontWeight: '700', width: 20, textAlign: 'center' },
  when: { fontSize: FONT.body, fontWeight: '600' },
});
