import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { DayTone, ForecastDay, ForecastFile } from '@energy/core';
import { Screen } from '../components/Screen';
import { TimeColumns, type Column } from '../components/TimeColumns';
import { Card, Chip, LegendItem, Muted } from '../components/ui';
import { useData } from '../lib/data';
import { formatNumber, formatPricePerKwh, formatTime, localDay } from '../lib/format';
import { useRemoteJson } from '../lib/remote';
import { FONT, useTheme, type Theme } from '../lib/theme';

type Mode = 'price' | 'co2';

const TONE: Record<DayTone, { label: string; icon: string }> = {
  cheap: { label: 'Tanio', icon: '↓' },
  normal: { label: 'Typowo', icon: '–' },
  expensive: { label: 'Drogo', icon: '↑' },
};

function toneColor(t: Theme, tone: DayTone): string {
  return tone === 'cheap' ? t.status.good : tone === 'expensive' ? t.status.critical : t.deemph;
}

function dayTitle(d: ForecastDay, timeZone: string): { name: string; date: string } {
  const at = new Date(`${d.date}T12:00:00Z`);
  const name = new Intl.DateTimeFormat('pl-PL', { timeZone, weekday: 'long' }).format(at);
  return {
    name: d.horizon === 1 ? 'Jutro' : name.charAt(0).toUpperCase() + name.slice(1),
    date: new Intl.DateTimeFormat('pl-PL', { timeZone, day: 'numeric', month: 'short' }).format(at),
  };
}

function weatherIcons(d: ForecastDay): string {
  const icons: string[] = [];
  if (d.wind >= 0.45) icons.push('💨💨');
  else if (d.wind >= 0.25) icons.push('💨');
  if (d.sun >= 450) icons.push('☀️');
  else if (d.sun >= 200) icons.push('🌤️');
  else icons.push('☁️');
  if (d.temp <= -3) icons.push('🥶');
  return icons.join(' ');
}

export default function Forecast() {
  const t = useTheme();
  const { zone } = useData();
  const remote = useRemoteJson<ForecastFile>(`${zone}/forecast.json`);
  const [mode, setMode] = useState<Mode>('price');
  const [dayIndex, setDayIndex] = useState(0);

  const f = remote.status === 'ok' ? remote.data : null;
  const day = f?.days[dayIndex];
  const currency = f?.currency ?? 'PLN';

  const columns: Column[] = useMemo(() => {
    if (!f || !day) return [];
    const series = mode === 'price' ? f.price : f.co2;
    const best = mode === 'price' ? day.cheapest3h : day.cleanest3h;
    return (series?.points ?? [])
      .filter((p) => localDay(p.t, f.timezone) === day.date)
      .map((p) => {
        const ms = Date.parse(p.t);
        const inBest = best && ms >= Date.parse(best.start) && ms < Date.parse(best.end);
        return {
          t: p.t,
          segments: [{ key: inBest ? 'best' : 'x', value: p.v, color: inBest ? t.accent : t.deemph }],
        };
      });
  }, [f, day, mode, t]);

  const unit = (v: number) =>
    mode === 'price' ? formatPricePerKwh(v, currency) : `${formatNumber(v)} g CO₂/kWh`;
  const range = (lo: number, hi: number) =>
    mode === 'price'
      ? `${formatPricePerKwh(lo, currency)} – ${formatPricePerKwh(hi, currency)}`
      : `${formatNumber(lo)}–${formatNumber(hi)} g`;

  const accuracy = f?.price?.accuracy;
  const acc1 = accuracy?.find((a) => a.horizon === 1);
  const acc7 = accuracy?.find((a) => a.horizon === 7);

  return (
    <Screen title="Prognoza na 7 dni">
      {remote.status === 'loading' && <ActivityIndicator style={{ marginTop: 32 }} />}
      {remote.status === 'missing' && (
        <Card>
          <Muted>
            Prognozę na tydzień liczymy na razie dla Polski. Wybierz Polskę powyżej — kolejne kraje dodamy,
            gdy model sprawdzi się na danych.
          </Muted>
        </Card>
      )}
      {remote.status === 'error' && (
        <Card>
          <Muted>Nie udało się pobrać prognozy ({remote.message}).</Muted>
        </Card>
      )}

      {f && (
        <>
          <Card
            title="Pogoda dla prądu"
            subtitle="Ile prąd będzie kosztował i jak czysty będzie w najbliższym tygodniu"
          >
            {f.days.map((d, i) => (
              <Pressable
                key={d.date}
                onPress={() => setDayIndex(i)}
                accessibilityRole="button"
                accessibilityState={{ selected: i === dayIndex }}
                style={[
                  styles.day,
                  {
                    borderColor: i === dayIndex ? t.accent : t.grid,
                    backgroundColor: i === dayIndex ? t.page : 'transparent',
                  },
                ]}
              >
                <View style={styles.dayHead}>
                  <Text style={[styles.dayName, { color: t.text }]}>
                    {dayTitle(d, f.timezone).name}
                    <Text style={{ color: t.textMuted, fontWeight: '400' }}>
                      {' '}
                      {dayTitle(d, f.timezone).date}
                    </Text>
                  </Text>
                  <View style={[styles.tone, { backgroundColor: toneColor(t, d.tone) }]}>
                    <Text style={[styles.toneText, { color: d.tone === 'normal' ? t.text : '#ffffff' }]}>
                      {TONE[d.tone].icon} {TONE[d.tone].label}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: t.text, fontSize: FONT.small }}>
                  {weatherIcons(d)} {d.summary}
                </Text>
                <View style={styles.dayStats}>
                  {d.priceAvg !== null && (
                    <Text style={[styles.stat, { color: t.text }]}>
                      {formatPricePerKwh(d.priceAvg, currency)}
                      <Text style={{ color: t.textMuted }}> śr.{d.pricesKnown ? ' (giełda)' : ''}</Text>
                    </Text>
                  )}
                  {d.co2Avg !== null && (
                    <Text style={[styles.stat, { color: t.text }]}>
                      {formatNumber(d.co2Avg)} <Text style={{ color: t.textMuted }}>g CO₂/kWh</Text>
                    </Text>
                  )}
                </View>
                {d.cheapest3h && (
                  <Muted>
                    Najtaniej: {formatTime(d.cheapest3h.start, f.timezone)}–
                    {formatTime(d.cheapest3h.end, f.timezone)}
                    {d.cleanest3h &&
                      ` · najczyściej: ${formatTime(d.cleanest3h.start, f.timezone)}–${formatTime(d.cleanest3h.end, f.timezone)}`}
                  </Muted>
                )}
              </Pressable>
            ))}
          </Card>

          {day && (
            <Card
              title={`Godzina po godzinie — ${i18nDay(day, f.timezone)}`}
              subtitle={
                day.pricesKnown && mode === 'price'
                  ? 'Ceny ustalone na giełdzie'
                  : 'Prognoza z przedziałem 80%'
              }
            >
              <View style={styles.chips}>
                <Chip label="💰 Cena" selected={mode === 'price'} onPress={() => setMode('price')} />
                <Chip label="🌱 Emisyjność" selected={mode === 'co2'} onPress={() => setMode('co2')} />
              </View>
              {columns.length > 0 ? (
                <TimeColumns
                  columns={columns}
                  timeZone={f.timezone}
                  accessibilityLabel="Prognoza godzinowa z zaznaczonym najlepszym 3-godzinnym oknem"
                  formatTick={(v) =>
                    mode === 'price'
                      ? currency === 'PLN'
                        ? formatNumber(v / 1000, 2)
                        : formatNumber(v / 10)
                      : formatNumber(v)
                  }
                  describe={(c) => {
                    const series = mode === 'price' ? f.price : f.co2;
                    const p = series?.points.find((x) => x.t === c.t);
                    if (!p) return unit(c.segments[0]!.value);
                    return p.lo === p.hi ? unit(p.v) : `${unit(p.v)} (zwykle ${range(p.lo, p.hi)})`;
                  }}
                />
              ) : (
                <Muted>Brak danych dla tego dnia.</Muted>
              )}
              <View style={styles.chips}>
                <LegendItem
                  color={t.accent}
                  label={mode === 'price' ? 'Najtańsze 3 godziny' : 'Najczystsze 3 godziny'}
                />
                <LegendItem color={t.deemph} label="Pozostałe godziny" />
              </View>
            </Card>
          )}

          <Card title="Jak bardzo można ufać prognozie?">
            {acc1?.windowRegret !== undefined && acc7?.windowRegret !== undefined && (
              <Muted>
                Sprawdzamy to co tydzień na ostatnich 8 tygodniach. Trzy godziny, które prognoza wskazywała
                jako najtańsze, były średnio droższe od naprawdę najtańszych o{' '}
                {formatPricePerKwh(acc1.windowRegret, currency)} (dzień wcześniej) do{' '}
                {formatPricePerKwh(acc7.windowRegret, currency)} (tydzień wcześniej). Wybór „jak tydzień temu”
                chybiał o {formatPricePerKwh(acc1.baselineWindowRegret!, currency)}.
              </Muted>
            )}
            {acc1 && acc7 && (
              <Muted>
                Sama cena godzinowa jest trudniejsza: średni błąd to ±{formatPricePerKwh(acc1.mae, currency)}{' '}
                na jutro i ±{formatPricePerKwh(acc7.mae, currency)} na tydzień — dlatego pokazujemy przedział,
                w którym cena mieściła się w 8 na 10 przypadków.
              </Muted>
            )}
            <Muted>
              Model uczy się zależności cen i emisyjności od prognozy wiatru, słońca i temperatury dla Polski
              oraz od kalendarza (godzina, weekend, święta). Najlepiej przewiduje, który dzień i które godziny
              będą tańsze — dokładna cena może się różnić. Gdy giełda poda ceny na jutro (ok. 13:00),
              zastępują one prognozę. Pogoda: Open-Meteo (CC BY 4.0).
            </Muted>
          </Card>
        </>
      )}
    </Screen>
  );
}

function i18nDay(d: ForecastDay, timeZone: string): string {
  return d.horizon === 1
    ? 'jutro'
    : new Intl.DateTimeFormat('pl-PL', { timeZone, weekday: 'long' }).format(new Date(`${d.date}T12:00:00Z`));
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  day: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  dayName: { fontSize: FONT.body, fontWeight: '700', flexShrink: 1 },
  tone: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  toneText: { fontSize: FONT.tiny, fontWeight: '700' },
  dayStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  stat: { fontSize: FONT.small, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
