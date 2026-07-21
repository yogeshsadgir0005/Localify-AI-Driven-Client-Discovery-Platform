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

export default function SignupScreen({ navigation }) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [step, setStep] = useState('form'); // form | otp
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const upd = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const onRegister = async () => {
    if (!form.name || !form.email || !form.password) return setError('Fill in all fields.');
    setLoading(true); setError('');
    try {
      await api.post('/auth/register', form);
      setStep('otp');
    } catch (err) {
      setError(getErrorMessage(err, 'Sign up failed.'));
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async () => {
    if (!otp) return setError('Enter the code from your email.');
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/auth/verify-signup-otp', { email: form.email.trim(), otp: otp.trim() });
      setAuth(data.user, data.token);
    } catch (err) {
      setError(getErrorMessage(err, 'Verification failed.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlowBackground variant="auth">
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <MotiView from={{ opacity: 0, translateY: 24 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 500 }}>
              <View style={styles.brandRow}>
                <View style={styles.logo}><Ionicons name="location" size={22} color={colors.white} /></View>
                <Text variant="h2">Localify</Text>
              </View>

              {step === 'form' ? (
                <>
                  <Text variant="h1" style={{ marginTop: 28 }}>Create your account</Text>
                  <Text variant="muted" style={{ marginTop: 6 }}>Start finding local businesses near you.</Text>
                  <View style={styles.form}>
                    <Input placeholder="Full name" value={form.name} onChangeText={upd('name')} />
                    <Input placeholder="Email address" autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={upd('email')} />
                    <Input placeholder="Password" secureTextEntry value={form.password} onChangeText={upd('password')} />
                    {error ? <Text color={colors.error} variant="muted">{error}</Text> : null}
                    <Button title="Continue" onPress={onRegister} loading={loading} />

                    {googleAvailable ? (
                      <>
                        <View style={styles.divider}>
                          <View style={styles.line} />
                          <Text variant="muted" style={{ fontSize: 12 }}>or</Text>
                          <View style={styles.line} />
                        </View>
                        <GoogleButton label="Sign up with Google" onError={setError} />
                      </>
                    ) : null}
                  </View>
                </>
              ) : (
                <>
                  <Text variant="h1" style={{ marginTop: 28 }}>Verify your email</Text>
                  <Text variant="muted" style={{ marginTop: 6 }}>We sent a code to {form.email}.</Text>
                  <View style={styles.form}>
                    <Input placeholder="6-digit code" keyboardType="number-pad" value={otp} onChangeText={setOtp} />
                    {error ? <Text color={colors.error} variant="muted">{error}</Text> : null}
                    <Button title="Verify & Continue" onPress={onVerify} loading={loading} />
                    <Button title="Back" variant="ghost" onPress={() => setStep('form')} />
                  </View>
                </>
              )}

              <Pressable onPress={() => navigation.navigate('Login')} style={styles.footerLink}>
                <Text variant="muted">
                  Already have an account? <Text color={colors.primary} style={{ fontFamily: font.bodySemi }}>Sign in</Text>
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
  logo: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  form: { gap: 14, marginTop: 28 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 2 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  footerLink: { marginTop: 24, alignItems: 'center' },
});
