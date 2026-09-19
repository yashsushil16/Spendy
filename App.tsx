// SPENDY — Root App Navigator
// Minimal Bottom tab navigation without text labels + DB initialization + Native bridge

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, DeviceEventEmitter, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';

import { initializeDatabase } from './src/database/schema';
import { useLedgerStore } from './src/store/ledgerStore';
import { setupNativeTransactionListeners } from './src/native/SpendyNative';
import { Colors, BorderRadius } from './src/constants/theme';

import HomeScreen from './src/screens/HomeScreen';
import EnvelopesScreen from './src/screens/EnvelopesScreen';
import DebtsScreen from './src/screens/DebtsScreen';
import ScanSplitScreen from './src/screens/ScanSplitScreen';
import LedgerScreen from './src/screens/LedgerScreen';

const Tab = createBottomTabNavigator();

// ─── Minimal Tab Icon (No text, minimal black icon, sleek active dot) ─────────

function MinimalTabIcon({
  name,
  focused,
}: {
  name: keyof typeof Feather.glyphMap;
  focused: boolean;
}) {
  return (
    <View style={tabIconStyles.container}>
      <Feather
        name={name}
        size={20}
        color={focused ? '#0A0A0A' : '#A3A3A3'}
      />
      <View style={[tabIconStyles.dot, focused && tabIconStyles.dotActive]} />
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    paddingTop: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'transparent',
    marginTop: 4,
  },
  dotActive: {
    backgroundColor: '#0A0A0A',
  },
});

// ─── Loading Screen ───────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, gap: 16 }}>
      <Feather name="shield" size={36} color="#0A0A0A" />
      <ActivityIndicator color="#0A0A0A" style={{ marginTop: 8 }} />
    </View>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const { ingestTransaction } = useLedgerStore();

  useEffect(() => {
    (async () => {
      try {
        await initializeDatabase();
      } catch (e) {
        console.error('DB init failed:', e);
      } finally {
        setDbReady(true);
      }
    })();
  }, []);

  // Listen for parsed transactions from native Kotlin modules (NotificationListener & SMS)
  useEffect(() => {
    const cleanup = setupNativeTransactionListeners();
    return cleanup;
  }, []);

  if (!dbReady) return <LoadingScreen />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarShowLabel: false,
              tabBarStyle: styles.tabBar,
            }}
          >
            <Tab.Screen
              name="Home"
              component={HomeScreen}
              options={{
                tabBarIcon: ({ focused }) => (
                  <MinimalTabIcon name="grid" focused={focused} />
                ),
              }}
            />
            <Tab.Screen
              name="Envelopes"
              component={EnvelopesScreen}
              options={{
                tabBarIcon: ({ focused }) => (
                  <MinimalTabIcon name="layers" focused={focused} />
                ),
              }}
            />
            <Tab.Screen
              name="Debts"
              component={DebtsScreen}
              options={{
                tabBarIcon: ({ focused }) => (
                  <MinimalTabIcon name="users" focused={focused} />
                ),
              }}
            />
            <Tab.Screen
              name="Scan"
              component={ScanSplitScreen}
              options={{
                tabBarIcon: ({ focused }) => (
                  <MinimalTabIcon name="maximize" focused={focused} />
                ),
              }}
            />
            <Tab.Screen
              name="Ledger"
              component={LedgerScreen}
              options={{
                tabBarIcon: ({ focused }) => (
                  <MinimalTabIcon name="file-text" focused={focused} />
                ),
              }}
            />
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 20,
    left: 24,
    right: 24,
    borderRadius: BorderRadius.xl,
    borderTopWidth: 0,
    height: 60,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
    paddingBottom: 0,
    paddingTop: 0,
  },
});
