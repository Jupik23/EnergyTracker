import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Small per-device preferences. Storage can be unavailable (private browsing,
 * blocked site data), so every call degrades to "not remembered" instead of failing.
 */
const PREFIX = 'energytracker:';

export async function loadSetting(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export async function saveSetting(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, value);
  } catch {
    // not persisted — fine, the choice still applies for this session
  }
}
