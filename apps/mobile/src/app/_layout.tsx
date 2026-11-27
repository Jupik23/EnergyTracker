import { Tabs, useGlobalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, type ColorValue } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DataProvider } from '../lib/data';
import { useTheme } from '../lib/theme';

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
  };

export default function RootLayout() {
  const t = useTheme();
  const { zone } = useGlobalSearchParams<{ zone?: string }>();
  return (
    <SafeAreaProvider>
      <DataProvider urlZone={typeof zone === 'string' ? zone.toLowerCase() : undefined}>
        <StatusBar style="auto" />
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: t.accent,
            tabBarInactiveTintColor: t.textMuted,
            tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border },
            sceneStyle: { backgroundColor: t.page },
          }}
        >
          <Tabs.Screen name="index" options={{ title: 'Teraz', tabBarIcon: icon('⚡') }} />
          <Tabs.Screen name="forecast" options={{ title: 'Prognoza', tabBarIcon: icon('🌦️') }} />
          <Tabs.Screen name="plan" options={{ title: 'Kiedy włączyć?', tabBarIcon: icon('⏰') }} />
          <Tabs.Screen name="history" options={{ title: 'Historia', tabBarIcon: icon('📅') }} />
          <Tabs.Screen name="tariffs" options={{ title: 'Taryfy', tabBarIcon: icon('🧾') }} />
          <Tabs.Screen name="about" options={{ title: 'Więcej', tabBarIcon: icon('ℹ') }} />
          {/* Reached from "Więcej"; keeps a URL but no tab button. */}
          <Tabs.Screen
            name="integrations"
            options={{ title: 'Inteligentny dom', tabBarItemStyle: { display: 'none' } }}
          />
        </Tabs>
      </DataProvider>
    </SafeAreaProvider>
  );
}
