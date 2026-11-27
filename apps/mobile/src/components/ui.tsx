import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { FONT, useTheme } from '../lib/theme';

export function Card({
  title,
  subtitle,
  children,
  style,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const t = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }, style]}>
      {title && <Text style={[styles.cardTitle, { color: t.text }]}>{title}</Text>}
      {subtitle && <Text style={[styles.cardSubtitle, { color: t.textMuted }]}>{subtitle}</Text>}
      {children}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { borderColor: selected ? t.accent : t.border, backgroundColor: selected ? t.accent : t.surface },
      ]}
    >
      <Text style={{ color: selected ? '#ffffff' : t.text, fontSize: FONT.small, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: t.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: t.text }]}>{value}</Text>
      {hint && <Text style={[styles.statHint, { color: t.textMuted }]}>{hint}</Text>}
    </View>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.textMuted, fontSize: FONT.small, lineHeight: 18 }}>{children}</Text>;
}

export function LegendItem({ color, label, value }: { color: string; label: string; value?: string }) {
  const t = useTheme();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={{ color: t.text, fontSize: FONT.small, flex: 1 }}>{label}</Text>
      {value && (
        <Text style={{ color: t.textMuted, fontSize: FONT.small, fontVariant: ['tabular-nums'] }}>
          {value}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 8 },
  cardTitle: { fontSize: FONT.body, fontWeight: '700' },
  cardSubtitle: { fontSize: FONT.small, marginTop: -4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  stat: { flex: 1, minWidth: 120, gap: 2 },
  statLabel: { fontSize: FONT.small },
  statValue: { fontSize: FONT.title, fontWeight: '600' },
  statHint: { fontSize: FONT.tiny },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
});
