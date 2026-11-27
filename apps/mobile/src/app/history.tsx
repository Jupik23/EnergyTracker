import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  FUEL_CATEGORIES,
  FUEL_LABELS_PL,
  countryByCode,
  findZone,
  localDate,
  monthHours,
  type FuelCategory,
  type HistoryDay,
  type MixPoint,
} from '@energy/core';
import { MixBar } from '../components/MixBar';
import { Screen } from '../components/Screen';
import { TimeColumns, type Column } from '../components/TimeColumns';
import { Card, Chip, LegendItem, Muted, StatTile } from '../components/ui';
import {
  MONTHS_PL_SHORT,
  WEEKDAYS_PL,
  binOf,
  dayTitle,
  monthGrid,
  monthTitle,
  quantileBreaks,
  shiftMonth,
  yearBefore,
} from '../lib/calendar';
import { useData } from '../lib/data';
import { formatNumber } from '../lib/format';
import { useHistoryDaily, useHistoryIndex, useHistoryMonth } from '../lib/history';
import { FONT, textOn, useTheme, type Theme } from '../lib/theme';

const BINS = 7;

export default function History() {
  const t = useTheme();
  const { zone } = useData();
  const country = findZone(zone)?.country ?? 'pl';
  const { timezone, hasMix, name } = countryByCode(country);
  const params = useLocalSearchParams<{ date?: string }>();

  const index = useHistoryIndex();
  const daily = useHistoryDaily(hasMix ? country : null);
  const days = useMemo(() => daily.data?.days ?? [], [daily.data]);
  const byDate = useMemo(() => new Map(days.map((d) => [d.d, d])), [days]);

  const paramDate =
    typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null;
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked ?? paramDate ?? days.at(-1)?.d ?? null;
  const [shownMonth, setShownMonth] = useState<string | null>(null);
  const month = shownMonth ?? date?.slice(0, 7) ?? null;

  const months = index.data?.countries[country]?.months ?? [];
  const monthData = useHistoryMonth(hasMix ? country : null, date?.slice(0, 7) ?? null);

  const breaks = useMemo(
    () =>
      quantileBreaks(
        days.map((d) => d.co2),
        BINS,
      ),
    [days],
  );

  const select = (d: string) => {
    setPicked(d);
    setShownMonth(d.slice(0, 7));
    router.setParams({ date: d });
  };

  if (!hasMix) {
    return (
      <Screen title="Historia">
        <Card>
          <Muted>
            Dla kraju {name} nie ma publicznych danych o produkcji, więc nie ma też historii miksu.
          </Muted>
        </Card>
      </Screen>
    );
  }

  const error = daily.error ?? index.error;
  const day = date ? byDate.get(date) : undefined;

  return (
    <Screen title="Historia">
      {error && (
        <Card>
          <Muted>Archiwum dla tego kraju jest jeszcze budowane — wróć za kilka godzin. ({error})</Muted>
        </Card>
      )}

      {days.length > 0 && <SeasonCard days={days} timezone={timezone} theme={t} />}

      {month && days.length > 0 && (
        <Card title="Kalendarz" subtitle="Średnia emisyjność dnia — skala kolorów pod kalendarzem">
          <View style={styles.monthNav}>
            <NavButton
              label="‹"
              disabled={!months.length || month <= months[0]!}
              onPress={() => setShownMonth(shiftMonth(month, -1))}
              a11y="Poprzedni miesiąc"
            />
            <Text style={[styles.monthTitle, { color: t.text }]}>{monthTitle(month)}</Text>
            <NavButton
              label="›"
              disabled={!months.length || month >= months.at(-1)!}
              onPress={() => setShownMonth(shiftMonth(month, 1))}
              a11y="Następny miesiąc"
            />
          </View>
          <View style={styles.grid}>
            {WEEKDAYS_PL.map((w) => (
              <Text key={w} style={[styles.weekday, { color: t.textMuted }]}>
                {w}
              </Text>
            ))}
            {monthGrid(month).map((d, i) => {
              const row = d ? byDate.get(d) : undefined;
              const fill = row ? t.seq[binOf(row.co2, breaks)]! : 'transparent';
              const selected = d === date;
              return (
                <View key={d ?? `pad-${i}`} style={styles.cellWrap}>
                  {d && (
                    <Pressable
                      disabled={!row}
                      onPress={() => select(d)}
                      accessibilityRole="button"
                      accessibilityState={{ selected, disabled: !row }}
                      accessibilityLabel={
                        row
                          ? `${dayTitle(d)}: ${formatNumber(row.co2)} g CO₂/kWh`
                          : `${dayTitle(d)}: brak danych`
                      }
                      style={[
                        styles.cell,
                        { backgroundColor: fill, borderColor: selected ? t.text : 'transparent' },
                      ]}
                    >
                      <Text
                        style={{
                          color: row ? textOn(fill) : t.textMuted,
                          fontSize: FONT.small,
                          fontWeight: selected ? '800' : '500',
                        }}
                      >
                        {Number(d.slice(8))}
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
          <View style={styles.rampRow}>
            <Text style={[styles.rampLabel, { color: t.textMuted }]}>mniej CO₂</Text>
            {t.seq.map((c) => (
              <View key={c} style={[styles.rampCell, { backgroundColor: c }]} />
            ))}
            <Text style={[styles.rampLabel, { color: t.textMuted }]}>więcej</Text>
          </View>
          {date && (
            <View style={styles.chips}>
              <Chip label="Ten dzień rok temu" selected={false} onPress={() => select(yearBefore(date))} />
              <Chip label="Ostatni dostępny" selected={false} onPress={() => select(days.at(-1)!.d)} />
            </View>
          )}
        </Card>
      )}

      {date && day && <DayCard date={date} day={day} timezone={timezone} theme={t} month={monthData.data} />}
      {date && !day && days.length > 0 && (
        <Card>
          <Muted>Brak danych dla {dayTitle(date)}. Wybierz inny dzień w kalendarzu.</Muted>
        </Card>
      )}

      <Muted>
        Dane historyczne: Energy-Charts (Fraunhofer ISE, CC BY 4.0), średnie godzinowe. Archiwum obejmuje{' '}
        {months.length ? `${monthTitle(months[0]!)} – ${monthTitle(months.at(-1)!)}` : 'kolejne miesiące'}.
      </Muted>
    </Screen>
  );
}

function NavButton({
  label,
  onPress,
  disabled,
  a11y,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  a11y: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={8}
      style={[styles.navBtn, { borderColor: t.border, opacity: disabled ? 0.3 : 1 }]}
    >
      <Text style={{ color: t.text, fontSize: FONT.title }}>{label}</Text>
    </Pressable>
  );
}

/** Monthly averages over the whole archive: summer solar vs winter coal and wind at a glance. */
function SeasonCard({ days, timezone, theme: t }: { days: HistoryDay[]; timezone: string; theme: Theme }) {
  const { mixCols, co2Cols } = useMemo(() => {
    const byMonth = new Map<string, HistoryDay[]>();
    for (const d of days) byMonth.set(d.d.slice(0, 7), [...(byMonth.get(d.d.slice(0, 7)) ?? []), d]);
    const months = [...byMonth.keys()].sort();
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const mid = (m: string) => `${m}-15T12:00:00.000Z`;
    return {
      mixCols: months.map<Column>((m) => ({
        t: mid(m),
        segments: FUEL_CATEGORIES.map((c) => ({
          key: c,
          value: avg(byMonth.get(m)!.map((d) => d.mw[c] ?? 0)),
          color: t.fuel[c],
        })),
      })),
      co2Cols: months.map<Column>((m) => ({
        t: mid(m),
        segments: [{ key: 'co2', value: avg(byMonth.get(m)!.map((d) => d.co2)), color: t.accent }],
      })),
    };
  }, [days, t]);

  const monthOf = (iso: string) => iso.slice(0, 7);
  const timeLabel = (iso: string) => monthTitle(monthOf(iso));
  const xTick = (iso: string) => {
    const [y, m] = monthOf(iso).split('-');
    if (m === '01') return y!;
    if (m === '07') return MONTHS_PL_SHORT[6]!;
    return null;
  };
  const present = FUEL_CATEGORIES.filter((c) =>
    mixCols.some((col) => col.segments.some((s) => s.key === c && s.value > 0)),
  );

  return (
    <Card title="Pory roku" subtitle="Średnia produkcja w każdym miesiącu, GW">
      <TimeColumns
        columns={mixCols}
        timeZone={timezone}
        timeLabel={timeLabel}
        xTick={xTick}
        accessibilityLabel="Średnia produkcja według źródeł w kolejnych miesiącach"
        formatTick={(v) => formatNumber(v / 1000, Number.isInteger(v / 1000) ? 0 : 1)}
        describe={(c) =>
          c.segments
            .filter((s) => s.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, 3)
            .map((s) => `${FUEL_LABELS_PL[s.key as FuelCategory]} ${formatNumber(s.value / 1000, 1)} GW`)
            .join(', ')
        }
      />
      <View style={styles.legendGrid}>
        {present.map((c) => (
          <View key={c} style={styles.legendCell}>
            <LegendItem color={t.fuel[c]} label={FUEL_LABELS_PL[c]} />
          </View>
        ))}
      </View>
      <Text style={[styles.subhead, { color: t.text }]}>Emisyjność, średnia miesięczna (g CO₂/kWh)</Text>
      <TimeColumns
        columns={co2Cols}
        timeZone={timezone}
        height={110}
        timeLabel={timeLabel}
        xTick={xTick}
        accessibilityLabel="Średnia emisyjność w kolejnych miesiącach"
        formatTick={(v) => formatNumber(v)}
        describe={(c) => `${formatNumber(c.segments[0]!.value)} g/kWh`}
      />
    </Card>
  );
}

function DayCard({
  date,
  day,
  timezone,
  month,
  theme: t,
}: {
  date: string;
  day: HistoryDay;
  timezone: string;
  month: import('@energy/core').HistoryMonth | null;
  theme: Theme;
}) {
  const asMix: MixPoint = { t: date, mw: day.mw, co2: day.co2, renewableShare: day.renewableShare };
  const { mixCols, co2Cols } = useMemo(() => {
    if (!month) return { mixCols: [], co2Cols: [] };
    const hours = monthHours(month);
    const idx = hours.map((h, i) => [h, i] as const).filter(([h]) => localDate(h, timezone) === date);
    return {
      mixCols: idx.map<Column>(([h, i]) => ({
        t: h,
        segments: FUEL_CATEGORIES.map((c) => ({ key: c, value: month.mw[c]?.[i] ?? 0, color: t.fuel[c] })),
      })),
      co2Cols: idx
        .filter(([, i]) => month.co2[i] != null)
        .map<Column>(([h, i]) => ({
          t: h,
          segments: [{ key: 'co2', value: month.co2[i]!, color: t.accent }],
        })),
    };
  }, [month, date, timezone, t]);
  const hourLabel = (iso: string) =>
    new Intl.DateTimeFormat('pl-PL', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(
      new Date(iso),
    );

  return (
    <Card title={dayTitle(date)} subtitle="Średnie z całej doby">
      <View style={styles.stats}>
        <StatTile label="Emisyjność" value={`${formatNumber(day.co2)} g/kWh`} />
        <StatTile label="Udział OZE" value={`${formatNumber(day.renewableShare)}%`} />
      </View>
      <MixBar point={asMix} />
      {mixCols.length > 0 && (
        <>
          <Text style={[styles.subhead, { color: t.text }]}>Produkcja godzina po godzinie, GW</Text>
          <TimeColumns
            columns={mixCols}
            timeZone={timezone}
            timeLabel={hourLabel}
            accessibilityLabel="Produkcja według źródeł w kolejnych godzinach dnia"
            formatTick={(v) => formatNumber(v / 1000, Number.isInteger(v / 1000) ? 0 : 1)}
            defaultIndex={12}
            describe={(c) =>
              c.segments
                .filter((s) => s.value > 0)
                .sort((a, b) => b.value - a.value)
                .slice(0, 3)
                .map((s) => `${FUEL_LABELS_PL[s.key as FuelCategory]} ${formatNumber(s.value / 1000, 1)} GW`)
                .join(', ')
            }
          />
          <Text style={[styles.subhead, { color: t.text }]}>Emisyjność godzina po godzinie (g CO₂/kWh)</Text>
          <TimeColumns
            columns={co2Cols}
            timeZone={timezone}
            height={110}
            timeLabel={hourLabel}
            defaultIndex={12}
            accessibilityLabel="Emisyjność w kolejnych godzinach dnia"
            formatTick={(v) => formatNumber(v)}
            describe={(c) => `${formatNumber(c.segments[0]!.value)} g/kWh`}
          />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthTitle: { fontSize: FONT.body, fontWeight: '700' },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: FONT.tiny, paddingVertical: 4 },
  cellWrap: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2, maxHeight: 56 },
  cell: { flex: 1, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  rampRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
  rampCell: { flex: 1, height: 8, borderRadius: 2 },
  rampLabel: { fontSize: FONT.tiny, marginHorizontal: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stats: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  subhead: { fontSize: FONT.small, fontWeight: '600', marginTop: 8 },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  legendCell: { width: '33%', minWidth: 100 },
});
