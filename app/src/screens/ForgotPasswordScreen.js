import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
} from 'react-native';
import { MotiView } from 'moti';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlowBackground from '../components/GlowBackground';
import { Text, Input, Button } from '../components/ui';
import { colors, radius, spacing, font } from '../theme/colors';
import api, { getErrorMessage } from '../api/client';

/* ------- validation (mirrors the website's zod schemas) ------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateEmail = (v) => {
  if (!EMAIL_RE.test((v || '').trim())) return 'Enter a valid email';
  return '';
};
const validateOtp = (v) => {
  if (!/^\d{6}$/.test((v || '').trim())) return 'Enter the 6-digit code';
  return '';
};
const validatePassword = (v) => {
  if ((v || '').length < 8) return 'At least 8 characters';
  if (!/[A-Z]/.test(v)) return 'Add an uppercase letter';
  if (!/[0-9]/.test(v)) return 'Add a number';
  return '';
};

export default function ForgotPasswordScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null); // { type: 'success'|'error', msg }
  const [fieldErr, setFieldErr] = useState({}); // { email, otp, password, confirmPassword }

  const setErr = (key, msg) => setFieldErr((p) => ({ ...p, [key]: msg }));

  /* ---------------- step 1: request reset code ---------------- */
  const submitEmail = async () => {
    const e = validateEmail(email);
    setFieldErr({ email: e });
    if (e) return;
    setLoading(true);
    setNotice(null);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setEmail(email.trim());
      setNotice({ type: 'success', msg: 'Reset code sent to your email.' });
      setStep(2);
    } catch (err) {
      setNotice({ type: 'error', msg: getErrorMessage(err, 'Could not send reset code.') });
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- step 2: verify OTP ---------------- */
  const submitOtp = async () => {
    const e = validateOtp(otp);
    setFieldErr({ otp: e });
    if (e) return;
    setLoading(true);
    setNotice(null);
    try {
      await api.post('/auth/verify-reset-otp', { email, otp: otp.trim() });
      setOtp(otp.trim());
      setStep(3);
    } catch (err) {
      setNotice({ type: 'error', msg: getErrorMessage(err, 'Could not verify code.') });
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- step 3: set new password ---------------- */
  const submitPassword = async () => {
    const pErr = validatePassword(password);
    const cErr = password !== confirmPassword ? 'Passwords do not match' : '';
    setFieldErr({ password: pErr, confirmPassword: cErr });
    if (pErr || cErr) return;
    setLoading(true);
    setNotice(null);
    try {
      await api.post('/auth/reset-password', { email, otp, password });
      setNotice({ type: 'success', msg: 'Password reset successful.' });
      setStep(4);
    } catch (err) {
      setNotice({ type: 'error', msg: getErrorMessage(err, 'Could not reset password.') });
    } finally {
      setLoading(false);
    }
  };

  const goToLogin = () => navigation.navigate('Login');

  const useDifferentEmail = () => {
    setStep(1);
    setOtp('');
    setNotice(null);
    setFieldErr({});
  };

  return (
    <GlowBackground variant="auth">
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            <MotiView
              from={{ opacity: 0, translateY: 24 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 500 }}
              style={styles.card}
            >
              {/* Brand + title */}
              <View style={styles.header}>
                <View style={styles.logo}>
                  <Ionicons name="location" size={22} color={colors.white} />
                </View>
                <Text variant="h2" style={{ marginTop: 14, textAlign: 'center' }}>
                  Reset your password
                </Text>
              </View>

              {/* Step indicator */}
              <View style={styles.steps}>
                {[1, 2, 3, 4].map((n) => (
                  <View
                    key={n}
                    style={[
                      styles.stepDot,
                      step >= n ? styles.stepDotActive : styles.stepDotIdle,
                    ]}
                  />
                ))}
              </View>

              {/* Notice banner */}
              {notice ? (
                <View
                  style={[
                    styles.notice,
                    notice.type === 'success' ? styles.noticeSuccess : styles.noticeError,
                  ]}
                >
                  <Ionicons
                    name={notice.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
                    size={16}
                    color={notice.type === 'success' ? colors.accent : colors.error}
                  />
                  <Text
                    variant="muted"
                    color={notice.type === 'success' ? colors.accent : colors.error}
                    style={{ flex: 1, fontSize: 13 }}
                  >
                    {notice.msg}
                  </Text>
                </View>
              ) : null}

              {/* ---- Step 1: email ---- */}
              {step === 1 && (
                <MotiView
                  key="step1"
                  from={{ opacity: 0, translateX: 30 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  transition={{ type: 'timing', duration: 300 }}
                  style={styles.form}
                >
                  <Text variant="muted">
                    Enter your account email and we&apos;ll generate a 6-digit reset code.
                  </Text>
                  <View>
                    <Text variant="label" style={styles.fieldLabel}>Email</Text>
                    <Input
                      placeholder="you@example.com"
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      value={email}
                      onChangeText={(t) => { setEmail(t); if (fieldErr.email) setErr('email', ''); }}
                    />
                    {fieldErr.email ? <Text style={styles.fieldError}>{fieldErr.email}</Text> : null}
                  </View>
                  <Button title="Send reset code" onPress={submitEmail} loading={loading} />
                </MotiView>
              )}

              {/* ---- Step 2: OTP ---- */}
              {step === 2 && (
                <MotiView
                  key="step2"
                  from={{ opacity: 0, translateX: 30 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  transition={{ type: 'timing', duration: 300 }}
                  style={styles.form}
                >
                  <Text variant="muted">
                    Enter the 6-digit code sent for <Text style={{ color: colors.text }}>{email}</Text>.
                  </Text>
                  <View>
                    <Text variant="label" style={styles.fieldLabel}>Reset code</Text>
                    <Input
                      placeholder="000000"
                      keyboardType="number-pad"
                      maxLength={6}
                      value={otp}
                      onChangeText={(t) => {
                        const digits = t.replace(/[^\d]/g, '');
                        setOtp(digits);
                        if (fieldErr.otp) setErr('otp', '');
                      }}
                      style={styles.otpInput}
                    />
                    {fieldErr.otp ? <Text style={styles.fieldError}>{fieldErr.otp}</Text> : null}
                  </View>
                  <Button title="Verify code" onPress={submitOtp} loading={loading} />
                  <Pressable onPress={useDifferentEmail} style={styles.subLink}>
                    <Text variant="muted" style={{ fontSize: 12, textAlign: 'center' }}>
                      Use a different email
                    </Text>
                  </Pressable>
                </MotiView>
              )}

              {/* ---- Step 3: new password ---- */}
              {step === 3 && (
                <MotiView
                  key="step3"
                  from={{ opacity: 0, translateX: 30 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  transition={{ type: 'timing', duration: 300 }}
                  style={styles.form}
                >
                  <Text variant="muted">Code verified. Choose a new password for your account.</Text>

                  <View>
                    <Text variant="label" style={styles.fieldLabel}>New password</Text>
                    <View>
                      <Input
                        placeholder="••••••••"
                        secureTextEntry={!showPw}
                        autoCapitalize="none"
                        autoCorrect={false}
                        value={password}
                        onChangeText={(t) => { setPassword(t); if (fieldErr.password) setErr('password', ''); }}
                        style={{ paddingRight: 48 }}
                      />
                      <Pressable
                        onPress={() => setShowPw((s) => !s)}
                        hitSlop={8}
                        style={styles.eyeBtn}
                      >
                        <Ionicons
                          name={showPw ? 'eye-off-outline' : 'eye-outline'}
                          size={20}
                          color={colors.textMuted}
                        />
                      </Pressable>
                    </View>
                    {fieldErr.password ? <Text style={styles.fieldError}>{fieldErr.password}</Text> : null}
                  </View>

                  <View>
                    <Text variant="label" style={styles.fieldLabel}>Confirm new password</Text>
                    <Input
                      placeholder="••••••••"
                      secureTextEntry={!showPw}
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={confirmPassword}
                      onChangeText={(t) => { setConfirmPassword(t); if (fieldErr.confirmPassword) setErr('confirmPassword', ''); }}
                    />
                    {fieldErr.confirmPassword ? <Text style={styles.fieldError}>{fieldErr.confirmPassword}</Text> : null}
                  </View>

                  <Button title="Reset password" onPress={submitPassword} loading={loading} />
                </MotiView>
              )}

              {/* ---- Step 4: success ---- */}
              {step === 4 && (
                <MotiView
                  key="step4"
                  from={{ opacity: 0, translateX: 30 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  transition={{ type: 'timing', duration: 300 }}
                  style={styles.successBox}
                >
                  <Ionicons name="checkmark-circle" size={56} color={colors.accent} />
                  <Text variant="h3" style={{ textAlign: 'center' }}>Password updated</Text>
                  <Text variant="muted" style={{ textAlign: 'center' }}>
                    Your password has been reset. You can now log in with your new password.
                  </Text>
                  <Button title="Go to login" onPress={goToLogin} style={{ alignSelf: 'stretch', marginTop: 4 }} />
                </MotiView>
              )}

              {/* Back to sign in */}
              {step !== 4 ? (
                <Pressable onPress={goToLogin} style={styles.footerLink}>
                  <Text variant="muted">
                    Remembered it?{' '}
                    <Text color={colors.primary} style={{ fontFamily: font.bodySemi }}>Back to sign in</Text>
                  </Text>
                </Pressable>
              ) : null}
            </MotiView>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GlowBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  header: { alignItems: 'center', marginBottom: spacing.lg },
  logo: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  steps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: spacing.lg },
  stepDot: { height: 6, borderRadius: 3 },
  stepDotActive: { width: 32, backgroundColor: colors.primary },
  stepDotIdle: { width: 16, backgroundColor: colors.border },
  notice: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: spacing.md,
  },
  noticeSuccess: { backgroundColor: 'rgba(0,212,170,0.10)', borderColor: 'rgba(0,212,170,0.30)' },
  noticeError: { backgroundColor: 'rgba(255,83,112,0.10)', borderColor: 'rgba(255,83,112,0.30)' },
  form: { gap: 14 },
  fieldLabel: { marginBottom: 6, color: colors.text },
  fieldError: { marginTop: 6, color: colors.error, fontFamily: font.body, fontSize: 12 },
  otpInput: { letterSpacing: 8, textAlign: 'center', fontSize: 18 },
  eyeBtn: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
  subLink: { marginTop: 2 },
  successBox: { alignItems: 'center', gap: 12, paddingVertical: spacing.sm },
  footerLink: { marginTop: spacing.xl, alignItems: 'center' },
});
