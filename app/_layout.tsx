import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { User } from '@supabase/supabase-js';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function RootLayout() {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setInitializing(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        setUser(session?.user ?? null);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (initializing || !fontsLoaded) return;

    SplashScreen.hideAsync();

    if (user) {
      router.replace('/(tabs)');
    } else {
      router.replace('/(auth)/login');
    }
  }, [initializing, fontsLoaded, user]);

  if (initializing) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style="light" />
        <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background }, headerShown: false }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="supplements"
            options={{
              headerShown: true,
              headerTitle: 'Supplements',
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
              headerTitleStyle: { fontFamily: 'Inter_600SemiBold', color: colors.text },
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="coaching"
            options={{
              headerShown: true,
              headerTitle: 'Weekly Coaching',
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
              headerTitleStyle: { fontFamily: 'Inter_600SemiBold', color: colors.text },
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="settings"
            options={{
              headerShown: true,
              headerTitle: 'Settings',
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
              headerTitleStyle: { fontFamily: 'Inter_600SemiBold', color: colors.text },
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen name="weight" options={{ headerShown: false }} />
          <Stack.Screen name="streak" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="food-log" options={{ headerShown: false }} />
        </Stack>
      </View>
    </QueryClientProvider>
  );
}
