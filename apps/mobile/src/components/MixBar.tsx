import { StyleSheet, View } from 'react-native';
import { FUEL_LABELS_PL, mixShares, type MixPoint } from '@energy/core';
import { formatNumber } from '../lib/format';
import { useTheme } from '../lib/theme';
import { LegendItem } from './ui';

/** One whole split into parts: the current generation mix, with a legend that doubles as the data table. */
export function MixBar({ point }: { point: MixPoint }) {
  const t = useTheme();
  const shares = mixShares(point);
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.bar} accessibilityRole="image" accessibilityLabel="Udział źródeł w produkcji">
        {shares.map((s, i) => (
          <View
            key={s.category}
            style={{
              flex: s.share,
              backgroundColor: t.fuel[s.category],
              marginLeft: i === 0 ? 0 : 2,
              borderTopLeftRadius: i === 0 ? 4 : 0,
              borderBottomLeftRadius: i === 0 ? 4 : 0,
              borderTopRightRadius: i === shares.length - 1 ? 4 : 0,
              borderBottomRightRadius: i === shares.length - 1 ? 4 : 0,
            }}
          />
        ))}
      </View>
      <View>
        {[...shares]
          .sort((a, b) => b.share - a.share)
          .map((s) => (
            <LegendItem
              key={s.category}
              color={t.fuel[s.category]}
              label={FUEL_LABELS_PL[s.category]}
              value={`${formatNumber(s.share, 1)}% · ${formatNumber(s.mw / 1000, 1)} GW`}
            />
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', height: 20 },
});
