import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppText, ErrorText } from '../src/components/AppText';
import { initDb } from '../src/db';
import { resumePendingGenerations } from '../src/llm/pipeline';
import { setupNotifications, syncReminders } from '../src/notifications';
import { SettingsProvider, useSettings } from '../src/settings/SettingsContext';
import { fonts, useTheme } from '../src/theme';

void SplashScreen.preventAutoHideAsync().catch(() => {});

function onAppActive() {
  void resumePendingGenerations();
  void syncReminders();
}

function RootNavigator() {
  const { ready } = useSettings();
  const { colors, scheme } = useTheme();

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);

  useEffect(() => {
    if (!ready) return;
    SplashScreen.hide();
    void setupNotifications()
      .catch(() => {})
      .then(onAppActive);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') onAppActive();
    });
    return () => sub.remove();
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fonts.bold },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chat" options={{ title: 'Chat' }} />
        <Stack.Screen name="add-topic" options={{ title: 'New topic' }} />
        <Stack.Screen name="topic/[id]" options={{ title: 'Topic' }} />
      </Stack>
    </>
  );
}

function StartupError({ message }: { message: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 8, backgroundColor: colors.background }}>
      <AppText variant="bodyStrong">Oso could not open its library.</AppText>
      <ErrorText>{message}</ErrorText>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    [fonts.regular]: require('../assets/fonts/Nunito/Nunito-Regular.ttf'),
    [fonts.semiBold]: require('../assets/fonts/Nunito/Nunito-SemiBold.ttf'),
    [fonts.bold]: require('../assets/fonts/Nunito/Nunito-Bold.ttf'),
  });
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    initDb()
      .then(() => setDbReady(true))
      .catch((e: unknown) => {
        setDbError(e instanceof Error ? e.message : 'Unknown error');
        SplashScreen.hide();
      });
  }, []);

  // A font failure falls back to the system font rather than blocking the app.
  const fontsSettled = fontsLoaded || fontError != null;
  if (dbError && fontsSettled) return <StartupError message={dbError} />;
  if (!fontsSettled || !dbReady) return null;

  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <RootNavigator />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
