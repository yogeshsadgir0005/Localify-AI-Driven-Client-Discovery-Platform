import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlowBackground from '../components/GlowBackground';
import { Text, Card, Button, Divider } from '../components/ui';
import RazorpayCheckout from '../components/RazorpayCheckout';
import { colors, radius, spacing, font } from '../theme/colors';
import api, { getErrorMessage } from '../api/client';
import { useAuthStore } from '../store/authStore';

const PLANS = [
  {
    id: 'free', name: 'Free', price: '₹0', period: '', icon: 'leaf-outline',
    features: ['Browse local businesses', 'Basic search in one area', 'Limited contact details'],
  },
  {
    id: 'pro', name: 'Pro', price: '₹199', period: '/month', icon: 'rocket-outline', popular: true,
    features: ['More businesses per search', 'Change location 10×/week', 'Full contact details & mobile numbers', 'Priority support', '3 AI websites / week'],
  },
  {
    id: 'max', name: 'Max', price: '₹499', period: '/month', icon: 'diamond-outline',
    features: ['Unlimited businesses per search', 'Unlimited location changes', 'Full contact details & mobile numbers', '24/7 Priority support', '9 AI websites / week', 'Export data (coming soon)'],
  },
];

const TOPUP = { id: 'topup_ai_5', name: '5 AI Website Credits', price: '₹99', desc: 'Generate 5 extra AI websites — credits stack on your plan and never expire.' };

export default function SubscriptionsScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const plan = user?.plan || 'free';
  const quota = user?.aiQuota || {};

  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);
  const [checkout, setCheckout] = useState(null);

  const flash = (type, msg) => { setNotice({ type, msg }); setTimeout(() => setNotice(null), 3500); };

  const startPlan = async (planId) => {
    setBusy(planId); setNotice(null);
    try {
      const { data } = await api.post('/subscriptions/create-order', { plan: planId });
      setCheckout({
        order: { orderId: data.orderId, amount: data.amount, keyId: data.keyId },
        description: `${PLANS.find((p) => p.id === planId)?.name} plan`,
        verify: async (payment) => {
          const res = await api.post('/subscriptions/verify-payment', { ...payment, plan: planId });
          if (res.data?.user) setUser(res.data.user);
          flash('ok', res.data?.message || `Upgraded to ${planId.toUpperCase()}!`);
        },
      });
    } catch (err) {
      flash('err', getErrorMessage(err, 'Could not start checkout.'));
    } finally { setBusy(''); }
  };

  const startTopup = async () => {
    setBusy(TOPUP.id); setNotice(null);
    try {
      const { data } = await api.post('/subscriptions/create-topup-order', { packageId: TOPUP.id });
      setCheckout({
        order: { orderId: data.orderId, amount: data.amount, keyId: data.keyId },
        description: TOPUP.name,
        verify: async (payment) => {
          const res = await api.post('/subscriptions/verify-topup', { ...payment, packageId: TOPUP.id });
          if (res.data?.user) setUser(res.data.user);
          flash('ok', res.data?.message || 'Credits added!');
        },
      });
    } catch (err) {
      flash('err', getErrorMessage(err, 'Could not start checkout.'));
    } finally { setBusy(''); }
  };

  const onPaid = async (payment) => {
    const verify = checkout?.verify;
    setCheckout(null);
    if (!verify) return;
    setBusy('verify');
    try { await verify(payment); }
    catch (err) { flash('err', getErrorMessage(err, 'Payment verification failed.')); }
    finally { setBusy(''); }
  };

  const refresh = async () => {
    setBusy('refresh');
    try { const { data } = await api.get('/auth/profile'); if (data?.user) setUser(data.user); flash('ok', 'Status refreshed.'); }
    catch (err) { flash('err', getErrorMessage(err)); }
    finally { setBusy(''); }
  };

  return (
    <GlowBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.topbar}>
          <Pressable style={styles.back} onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
            <Text style={{ fontFamily: font.bodySemi }}>Back</Text>
          </Pressable>
          <Pressable onPress={refresh} hitSlop={8} style={styles.refresh}>
            <Ionicons name="refresh" size={15} color={colors.primary} />
            <Text variant="label" color={colors.primary}>Refresh</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48, gap: 16 }}>
          <View>
            <Text variant="h1">Plans & Credits</Text>
            <Text variant="muted" style={{ marginTop: 4 }}>Unlock full contact details, more searches and AI websites.</Text>
          </View>

          {notice ? (
            <View style={[styles.notice, notice.type === 'err' ? styles.noticeErr : styles.noticeOk]}>
              <Ionicons name={notice.type === 'err' ? 'alert-circle' : 'checkmark-circle'} size={16} color={notice.type === 'err' ? colors.error : colors.accent} />
              <Text variant="label" color={notice.type === 'err' ? colors.error : colors.accent} style={{ flex: 1 }}>{notice.msg}</Text>
            </View>
          ) : null}

          <Card>
            <View style={styles.statusRow}>
              <View>
                <Text variant="label">Current plan</Text>
                <Text variant="h3" style={{ marginTop: 2 }}>{plan.toUpperCase()}</Text>
              </View>
              <View style={styles.creditPill}>
                <Ionicons name="sparkles" size={14} color={colors.accent} />
                <Text style={{ color: colors.accent, fontFamily: font.bodySemi, fontSize: 13 }}>
                  {quota.extraCredits ? `${quota.extraCredits} bonus credits` : 'AI credits'}
                </Text>
              </View>
            </View>
          </Card>

          {PLANS.map((p) => {
            const current = p.id === plan;
            return (
              <Card key={p.id} style={[styles.planCard, p.popular && styles.planPopular, current && styles.planCurrent]}>
                {p.popular && !current ? <View style={styles.ribbon}><Text style={styles.ribbonText}>MOST POPULAR</Text></View> : null}
                {current ? <View style={[styles.ribbon, styles.ribbonCurrent]}><Text style={styles.ribbonText}>CURRENT</Text></View> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name={p.icon} size={20} color={p.id === 'max' ? colors.accent : colors.primary} />
                  <Text variant="h3">{p.name}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 }}>
                  <Text style={{ fontFamily: font.display, fontSize: 30, color: colors.text }}>{p.price}</Text>
                  <Text variant="muted" style={{ marginBottom: 5, marginLeft: 2 }}>{p.period}</Text>
                </View>
                <Divider style={{ marginVertical: 12 }} />
                <View style={{ gap: 9 }}>
                  {p.features.map((f) => (
                    <View key={f} style={styles.featRow}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
                      <Text variant="muted" style={{ flex: 1, color: colors.text, fontSize: 13 }}>{f}</Text>
                    </View>
                  ))}
                </View>
                {p.id !== 'free' && (
                  <Button
                    title={current ? 'Current plan' : `Upgrade to ${p.name}`}
                    variant={current ? 'outline' : 'primary'}
                    disabled={current || busy === p.id}
                    loading={busy === p.id}
                    style={{ marginTop: 16 }}
                    onPress={() => startPlan(p.id)}
                  />
                )}
              </Card>
            );
          })}

          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
              <Text variant="h3">AI website credits</Text>
            </View>
            <Text variant="muted" style={{ marginTop: 6 }}>{TOPUP.desc}</Text>
            <View style={styles.topupBox}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.bodySemi, color: colors.text }}>{TOPUP.name}</Text>
                <Text variant="muted" style={{ fontSize: 12 }}>One-time</Text>
              </View>
              <Text style={{ fontFamily: font.display, fontSize: 20, color: colors.text }}>{TOPUP.price}</Text>
            </View>
            <Button title="Buy credits" variant="outline" loading={busy === TOPUP.id} onPress={startTopup} style={{ marginTop: 12 }} />
          </Card>

          <Text variant="label" style={{ textAlign: 'center', marginTop: 4 }}>
            <Ionicons name="lock-closed" size={11} color={colors.textMuted} />  Secure payments by Razorpay
          </Text>
        </ScrollView>

        {checkout ? (
          <RazorpayCheckout
            visible
            order={checkout.order}
            description={checkout.description}
            user={{ name: user?.name, email: user?.email, phone: user?.phone }}
            onSuccess={onPaid}
            onDismiss={() => { setCheckout(null); flash('err', 'Payment cancelled.'); }}
            onError={(msg) => { setCheckout(null); flash('err', msg); }}
          />
        ) : null}
      </SafeAreaView>
    </GlowBackground>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 8 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  refresh: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.md, padding: 10 },
  noticeOk: { backgroundColor: 'rgba(0,212,170,0.10)', borderColor: 'rgba(0,212,170,0.30)' },
  noticeErr: { backgroundColor: 'rgba(255,83,112,0.10)', borderColor: 'rgba(255,83,112,0.30)' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  creditPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,212,170,0.10)', borderWidth: 1, borderColor: 'rgba(0,212,170,0.28)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  planCard: { overflow: 'hidden' },
  planPopular: { borderColor: 'rgba(108,99,255,0.5)' },
  planCurrent: { borderColor: colors.primary },
  ribbon: { position: 'absolute', top: 0, right: 0, backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 3, borderBottomLeftRadius: radius.md },
  ribbonCurrent: { backgroundColor: colors.accent },
  ribbonText: { fontFamily: font.bodySemi, fontSize: 10, color: colors.white, letterSpacing: 0.5 },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topupBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginTop: 12 },
});
