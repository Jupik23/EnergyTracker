import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { findZone, flagEmoji, zoneName, type Zone } from '@energy/core';
import { matchZones } from '../lib/zoneSearch';
import { useData } from '../lib/data';
import { FONT, useTheme } from '../lib/theme';

/** Current zone as a button; opens a searchable list of all countries and bidding zones. */
export function ZonePicker() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { zone, setZone } = useData();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const results = useMemo(() => matchZones(query), [query]);
  const current = findZone(zone);

  const choose = (z: Zone) => {
    setZone(z.id);
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Wybrany obszar: ${current ? zoneName(current) : zone}. Zmień`}
        style={[styles.trigger, { backgroundColor: t.surface, borderColor: t.border }]}
      >
        <Text style={[styles.triggerText, { color: t.text }]} numberOfLines={1}>
          {current ? `${flagEmoji(current.country)}  ${zoneName(current)}` : zone}
        </Text>
        <Text style={{ color: t.accent, fontWeight: '600', fontSize: FONT.small }}>Zmień</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[styles.sheet, { backgroundColor: t.page, paddingTop: insets.top + 12 }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: t.text }]}>Wybierz obszar</Text>
            <Pressable onPress={() => setOpen(false)} accessibilityRole="button" hitSlop={12}>
              <Text style={{ color: t.accent, fontSize: FONT.body, fontWeight: '600' }}>Zamknij</Text>
            </Pressable>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Szukaj kraju lub strefy, np. Szwecja, SE3, Sycylia"
            placeholderTextColor={t.textMuted}
            autoFocus
            autoCorrect={false}
            style={[styles.search, { color: t.text, backgroundColor: t.surface, borderColor: t.border }]}
            accessibilityLabel="Szukaj kraju lub strefy"
          />
          <Text style={[styles.hint, { color: t.textMuted }]}>
            Ceny są wspólne dla całej strefy cenowej. Szwecja, Norwegia, Dania i Włochy są podzielone na kilka
            stref — wybierz tę, w której mieszkasz.
          </Text>
          <FlatList
            data={results}
            keyExtractor={(z) => z.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            ListEmptyComponent={
              <Text style={[styles.hint, { color: t.textMuted }]}>Nic nie znaleziono dla „{query}”.</Text>
            }
            renderItem={({ item }) => {
              const selected = item.id === zone;
              return (
                <Pressable
                  onPress={() => choose(item)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.row, { borderBottomColor: t.grid }]}
                >
                  <Text style={styles.flag}>{flagEmoji(item.country)}</Text>
                  <Text style={[styles.rowText, { color: t.text }]}>{zoneName(item)}</Text>
                  {selected && <Text style={{ color: t.accent, fontWeight: '700' }}>✓</Text>}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  triggerText: { flex: 1, fontSize: FONT.body, fontWeight: '600' },
  sheet: { flex: 1, paddingHorizontal: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: FONT.title, fontWeight: '700' },
  search: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: FONT.body,
  },
  hint: { fontSize: FONT.small, lineHeight: 18, marginVertical: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flag: { fontSize: 20 },
  rowText: { flex: 1, fontSize: FONT.body },
});
