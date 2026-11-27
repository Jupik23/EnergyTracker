import { ScrollView, StyleSheet } from 'react-native';
import { COUNTRIES } from '@energy/core';
import { useData } from '../lib/data';
import { Chip } from './ui';

export function CountryPicker() {
  const { country, setCountry } = useData();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {COUNTRIES.map((c) => (
        <Chip
          key={c.code}
          label={`${c.flag} ${c.name}`}
          selected={c.code === country}
          onPress={() => setCountry(c.code)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2 },
});
