import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import {
  useFonts,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import RootNavigator from './src/navigation/RootNavigator';
import { colors } from './src/theme/colors';
import { useAuthStore } from './src/store/authStore';
import api from './src/api/client';

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.surface, text: colors.text, primary: colors.primary, border: colors.border },
};

export default function App() {
  const init = useAuthStore((s) => s.init);
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);

  const [fontsLoaded] = useFonts({
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  // Rehydrate auth from secure storage on launch.
  useEffect(() => { init(); }, [init]);

  // Refresh the profile once we have a token (keeps plan/credits/address fresh).
  useEffect(() => {
    if (!token) return;
    api.get('/auth/profile').then(({ data }) => setUser(data.user)).catch(() => {});
  }, [token, setUser]);

  if (!fontsLoaded) {
    // Render nothing briefly; the splash background color covers this.
    return null;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer theme={navTheme}>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
