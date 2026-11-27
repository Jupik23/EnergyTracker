import type { ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useData } from '../lib/data';
import { useTheme } from '../lib/theme';
import { CountryPicker } from './CountryPicker';
import { Card, Muted } from './ui';

/** Shared screen shell: safe-area padding, centred max-width column on web, pull to refresh, loading and error states. */
export function Screen({
  title,
  children,
  showCountry = true,
}: {
  title: string;
  children: ReactNode;
  showCountry?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { snapshot, loading, error, refresh } = useData();

  return (
    <ScrollView
      style={{ backgroundColor: t.page }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
      ]}
      refreshControl={<RefreshControl refreshing={loading && !!snapshot} onRefresh={refresh} />}
    >
      <View style={styles.column}>
        <Text style={[styles.title, { color: t.text }]}>{title}</Text>
        {showCountry && <CountryPicker />}
        {error && (
          <Card>
            <Text style={{ color: t.text, fontWeight: '600' }}>⚠ {error}</Text>
            <Muted>
              {snapshot ? 'Pokazuję ostatnie pobrane dane.' : 'Przeciągnij w dół, aby spróbować ponownie.'}
            </Muted>
          </Card>
        )}
        {showCountry && !snapshot && loading ? <ActivityIndicator style={{ marginTop: 48 }} /> : children}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, alignItems: 'center' },
  column: { width: '100%', maxWidth: 720, gap: 16 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: -4 },
});
