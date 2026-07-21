import React from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors, font } from '../theme/colors';
import { useAuthStore, hasAddress } from '../store/authStore';
import { Loader } from '../components/ui';
import GlowBackground from '../components/GlowBackground';

import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import AddressSetupScreen from '../screens/AddressSetupScreen';
import SearchScreen from '../screens/SearchScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import BusinessDetailScreen from '../screens/BusinessDetailScreen';
import GeneratedWebsiteScreen from '../screens/GeneratedWebsiteScreen';
import GeneratorProgressScreen from '../screens/GeneratorProgressScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SubscriptionsScreen from '../screens/SubscriptionsScreen';
import ProfileDetailScreen from '../screens/ProfileDetailScreen';
import ModerationScreen from '../screens/ModerationScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const ICONS = {
  Discover: 'compass',
  Notifications: 'notifications',
  Profile: 'person',
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 62,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontFamily: font.bodyMedium, fontSize: 11 },
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons name={focused ? ICONS[route.name] : `${ICONS[route.name]}-outline`} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Discover" component={SearchScreen} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const isLoading = useAuthStore((s) => s.isLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  if (isLoading) {
    return (
      <GlowBackground>
        <View style={{ flex: 1 }}><Loader label="Localify" /></View>
      </GlowBackground>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.bg } }}>
      {!isAuthenticated ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        </>
      ) : !hasAddress(user) ? (
        <Stack.Screen name="AddressSetup" component={AddressSetupScreen} />
      ) : (
        <>
          <Stack.Screen name="Tabs" component={MainTabs} />
          <Stack.Screen name="BusinessDetail" component={BusinessDetailScreen} />
          <Stack.Screen name="GeneratorProgress" component={GeneratorProgressScreen} />
          <Stack.Screen name="GeneratedWebsite" component={GeneratedWebsiteScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Subscriptions" component={SubscriptionsScreen} />
          <Stack.Screen name="ProfileDetail" component={ProfileDetailScreen} />
          <Stack.Screen name="Moderation" component={ModerationScreen} />
          {/* AddressSetup also reachable while authenticated (edit flows) */}
          <Stack.Screen name="AddressSetup" component={AddressSetupScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
