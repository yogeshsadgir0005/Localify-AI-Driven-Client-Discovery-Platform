import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { MotiView } from 'moti';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlowBackground from '../components/GlowBackground';
import { Text, Input, Button } from '../components/ui';
import GoogleButton from '../components/GoogleButton';
import { googleAvailable } from '../hooks/useGoogleAuth';
import { colors, spacing, font } from '../theme/colors';
import api, { getErrorMessage } from '../api/client';
import { useAuthStore } from '../store/authStore';

export default function LoginScreen({ navigation }) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onLogin = async () => {
    if (!email || !password) return setError('Enter your email and password.');
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/login', { email: email.trim(), password });
      setAuth(data.user, data.token);
      // RootNavigator switches automatically once isAuthenticated flips.
    } catch (err) {
      setError(getErrorMessage(err, 'Login failed.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlowBackground variant="auth">
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <MotiView
              from={{ opacity: 0, translateY: 24 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 500 }}
            >
              <View style={styles.brandRow}>
                <View style={styles.logo}>
                  <Ionicons name="location" size={22} color={colors.white} />
                </View>
                <Text variant="h2">Localify</Text>
              </View>
              <Text variant="h1" style={{ marginTop: 28 }}>Welcome back</Text>
              <Text variant="muted" style={{ marginTop: 6 }}>
                Discover the local businesses hiding in plain sight.
              </Text>

              <View style={styles.form}>
                <Input
                  placeholder="Email address"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
                <Input placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
                <Pressable onPress={() => navigation.navigate('ForgotPassword')} style={{ alignSelf: 'flex-end', marginTop: -4 }}>
                  <Text variant="label" color={colors.primary}>Forgot password?</Text>
                </Pressable>
                {error ? <Text color={colors.error} variant="muted">{error}</Text> : null}
                <Button title="Sign In" onPress={onLogin} loading={loading} />

                {googleAvailable ? (
                  <>
                    <View style={styles.divider}>
                      <View style={styles.line} />
                      <Text variant="muted" style={{ fontSize: 12 }}>or</Text>
                      <View style={styles.line} />
                    </View>
                    <GoogleButton label="Sign in with Google" onError={setError} />
                  </>
                ) : null}
              </View>

              <Pressable onPress={() => navigation.navigate('Signup')} style={styles.footerLink}>
                <Text variant="muted">
                  New to Localify? <Text color={colors.primary} style={{ fontFamily: font.bodySemi }}>Create an account</Text>
                </Text>
              </Pressable>
            </MotiView>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GlowBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  form: { gap: 14, marginTop: 28 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 2 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  footerLink: { marginTop: 24, alignItems: 'center' },
});
