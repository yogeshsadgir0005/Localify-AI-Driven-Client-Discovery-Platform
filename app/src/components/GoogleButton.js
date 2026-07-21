import React, { useState } from 'react';
import { Pressable, View, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './ui';
import { colors, radius, font } from '../theme/colors';
import { signInWithGoogle, googleAvailable } from '../hooks/useGoogleAuth';

/**
 * "Continue with Google" button. Uses the server-side OAuth flow, which works
 * inside Expo Go. Renders nothing unless Google is configured.
 */
export default function GoogleButton({ label = 'Continue with Google', onError }) {
  const [busy, setBusy] = useState(false);

  if (!googleAvailable) return null;

  const onPress = async () => {
    if (busy) return;
    setBusy(true);
    const res = await signInWithGoogle();
    setBusy(false);
    if (!res.ok && !res.cancelled && res.error) onError?.(res.error);
    // On success, RootNavigator swaps to the app once isAuthenticated flips.
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.btn,
        busy && { opacity: 0.6 },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      <View style={styles.row}>
        {busy ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <>
            <Ionicons name="logo-google" size={18} color={colors.text} />
            <Text style={styles.label}>{label}</Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 13,
    paddingHorizontal: 20,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  label: { fontFamily: font.bodySemi, fontSize: 15, color: colors.text },
});
