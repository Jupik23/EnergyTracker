import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FONT, useTheme } from '../lib/theme';
import { dayLabel, formatTime } from '../lib/format';

export interface Segment {
  key: string;
  value: number;
  color: string;
}

export interface Column {
  t: string;
  segments: Segment[];
}

interface Props {
  columns: Column[];
  timeZone: string;
  height?: number;
  /** Text for the readout line of a selected column. */
  describe: (c: Column) => string;
  /** Formats y-axis tick values. */
  formatTick: (v: number) => string;
  /** Index shown in the readout before the user touches the chart. */
  defaultIndex?: number;
  nowMs?: number;
  accessibilityLabel: string;
  /** Readout/a11y label of a column's time. Default: "dziś 14:00". */
  timeLabel?: (t: string) => string;
  /** X-axis tick for a column, or null for none. Default: the hour at 00/06/12/18. */
  xTick?: (t: string, index: number) => string | null;
}

const GAP = 2;
const MAX_BAR = 24;
const Y_AXIS_W = 40;

/**
 * Column chart over time, built from plain Views so it renders identically on
 * iOS, Android and web without a native charting dependency. Supports stacked
 * segments; a single-series chart is just one segment per column.
 * Touch (or hover on web) a column to read its exact value.
 */
export function TimeColumns({
  columns,
  timeZone,
  height = 160,
  describe,
  formatTick,
  defaultIndex,
  nowMs,
  accessibilityLabel,
  timeLabel = (t) => `${dayLabel(t, timeZone)} ${formatTime(t, timeZone)}`,
  xTick = (t) => {
    const hm = formatTime(t, timeZone);
    return /^(00|06|12|18):00$/.test(hm) ? hm.slice(0, 2) : null;
  },
}: Props) {
  const theme = useTheme();
  const [selected, setSelected] = useState<number | null>(null);

  const max = useMemo(() => {
    const m = Math.max(0, ...columns.map((c) => c.segments.reduce((a, s) => a + Math.max(0, s.value), 0)));
    return niceCeil(m);
  }, [columns]);

  const ticks = [0, max / 2, max];
  // Pure flex/percentage layout: no dependency on onLayout, so the chart is
  // correct on the very first render on every platform.
  const pct = (i: number) => `${(i / Math.max(1, columns.length)) * 100}%` as const;
  const radius = columns.length > 30 ? 2 : 4;
  const activeIndex = selected ?? defaultIndex ?? columns.length - 1;
  const active = columns[activeIndex];

  const nowX = useMemo(() => {
    if (nowMs == null || columns.length < 2) return null;
    const first = Date.parse(columns[0]!.t);
    const step = Date.parse(columns[1]!.t) - first;
    const pos = (nowMs - first) / step;
    if (pos < 0 || pos > columns.length) return null;
    return pos;
  }, [nowMs, columns]);

  const xLabels = columns
    .map((c, i) => ({ i, label: xTick(c.t, i) }))
    .filter((x): x is { i: number; label: string } => x.label !== null);

  return (
    <View accessibilityLabel={accessibilityLabel}>
      <Text style={[styles.readout, { color: theme.text }]} numberOfLines={2}>
        {active ? `${timeLabel(active.t)} · ${describe(active)}` : ' '}
      </Text>
      <View style={{ height }}>
        {ticks.map((v) => (
          <View key={v} style={[styles.gridRow, { bottom: (v / (max || 1)) * height }]} pointerEvents="none">
            <Text style={[styles.tick, { color: theme.textMuted }]}>{formatTick(v)}</Text>
            <View style={[styles.gridLine, { backgroundColor: v === 0 ? theme.axis : theme.grid }]} />
          </View>
        ))}
        <View style={[styles.plot, { left: Y_AXIS_W }]}>
          {nowX != null && (
            <View
              pointerEvents="none"
              style={[styles.nowLine, { left: pct(nowX), height, backgroundColor: theme.textMuted }]}
            />
          )}
          {columns.map((c, i) => {
            const isActive = i === activeIndex;
            const visible = c.segments.filter((s) => s.value > 0);
            return (
              <Pressable
                key={c.t}
                onPressIn={() => setSelected(i)}
                onHoverIn={() => setSelected(i)}
                style={styles.slot}
                accessibilityRole="button"
                accessibilityLabel={`${timeLabel(c.t)}: ${describe(c)}`}
              >
                <View style={[styles.bar, { opacity: selected == null || isActive ? 1 : 0.55 }]}>
                  {[...visible].reverse().map((s, k) => {
                    const h = (s.value / (max || 1)) * height;
                    const isTop = k === 0;
                    return (
                      <View
                        key={s.key}
                        style={{
                          height: Math.max(0, h - (isTop ? 0 : GAP)),
                          marginTop: isTop ? 0 : GAP,
                          backgroundColor: s.color,
                          borderTopLeftRadius: isTop ? radius : 0,
                          borderTopRightRadius: isTop ? radius : 0,
                        }}
                      />
                    );
                  })}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={[styles.xAxis, { marginLeft: Y_AXIS_W }]}>
        {xLabels.map(({ i, label }) => (
          <Text
            key={columns[i]!.t}
            style={[styles.tick, styles.xTick, { color: theme.textMuted, left: pct(i) }]}
          >
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function niceCeil(x: number): number {
  if (x <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(x));
  const f = x / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

const styles = StyleSheet.create({
  readout: { fontSize: FONT.small, marginBottom: 8, minHeight: 18, fontVariant: ['tabular-nums'] },
  gridRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', height: 0 },
  tick: { fontSize: FONT.tiny, width: Y_AXIS_W - 4, fontVariant: ['tabular-nums'] },
  gridLine: { flex: 1, height: StyleSheet.hairlineWidth },
  nowLine: { position: 'absolute', top: 0, width: 1 },
  plot: { position: 'absolute', top: 0, bottom: 0, right: 0, flexDirection: 'row', alignItems: 'flex-end' },
  slot: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: GAP / 2,
  },
  bar: { width: '100%', maxWidth: MAX_BAR },
  xAxis: { height: 16, marginTop: 4 },
  xTick: { position: 'absolute', width: 36 },
});
