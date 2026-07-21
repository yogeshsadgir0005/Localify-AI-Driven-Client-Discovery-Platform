import React, { useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Country, State, City } from 'country-state-city';

import GlowBackground from '../components/GlowBackground';
import Dropdown from '../components/Dropdown';
import { Text, Card, Button, Input, Badge } from '../components/ui';
import { colors, radius, spacing, font } from '../theme/colors';
import api, { getErrorMessage } from '../api/client';
import { useAuthStore } from '../store/authStore';

/* -----------------------------------------------------------------------
 * country-state-city helpers (mirrors the web client's locations.js so the
 * Country/State/District dropdowns store the exact same values the API and
 * AddressSetup use — ISO codes for country/state, names for district/city).
 * --------------------------------------------------------------------- */
const COUNTRIES = Country.getAllCountries()
  .map((c) => ({ value: c.isoCode, label: c.name }))
  .sort((a, b) => a.label.localeCompare(b.label));

const getStates = (countryCode) => {
  if (!countryCode) return [];
  return State.getStatesOfCountry(countryCode)
    .map((s) => ({ value: s.isoCode, label: s.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

const getDistricts = (countryCode, stateCode) => {
  if (!countryCode || !stateCode) return [];
  return City.getCitiesOfState(countryCode, stateCode)
    .map((c) => ({ value: c.name, label: c.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

const getCountryLabel = (isoCode) => {
  if (!isoCode) return '';
  const c = Country.getCountryByCode(isoCode);
  return c ? c.name : isoCode;
};

const getStateLabel = (stateCode, countryCode) => {
  if (!stateCode) return '';
  if (!countryCode) return stateCode;
  const s = State.getStateByCodeAndCountry(stateCode, countryCode);
  return s ? s.name : stateCode;
};

/* AI website-generation limits per plan (mirrors server PLAN_LIMITS). */
const PLAN_GEN_LIMITS = { free: 0, pro: 3, max: 9 };
/* Weekly location-change limits per plan (mirrors web SettingsPage). */
const planLocLimit = (plan) => (plan === 'max' ? Infinity : plan === 'pro' ? 10 : 3);

const MENU = [
  { key: 'settings', label: 'Settings', sub: 'Account, language & privacy', icon: 'settings-outline', screen: 'Settings', tone: 'primary' },
  { key: 'plans', label: 'Plans & Credits', sub: 'Upgrade or top up AI credits', icon: 'diamond-outline', screen: 'Subscriptions', tone: 'accent' },
  { key: 'notifications', label: 'Notifications', sub: 'Alerts & activity', icon: 'notifications-outline', screen: 'Notifications', tone: 'primary' },
];

export default function ProfileScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => ({
    country: user?.address?.country || 'IN',
    state: user?.address?.state || '',
    district: user?.address?.district || '',
    city: user?.address?.city || '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const plan = user?.plan || 'free';
  const planLabel = plan.toUpperCase();
  const isAdmin = Array.isArray(user?.roles) && user.roles.includes('admin');

  const quota = user?.aiQuota || {};
  const genUsage = quota.usage || 0;
  const genLimit = quota.limit != null ? quota.limit : (PLAN_GEN_LIMITS[plan] ?? 0);
  const extraCredits = quota.extraCredits || 0;
  const genPct = genLimit > 0 ? Math.min(100, Math.round((genUsage / genLimit) * 100)) : 0;

  const locLimit = planLocLimit(plan);
  const locCount = user?.locationChanges?.count || 0;
  const locRemaining = Math.max(0, locLimit - locCount);

  // Saved-area display (resolve ISO codes -> readable names).
  const addr = user?.address || {};
  const savedArea = [
    addr.city,
    addr.district,
    getStateLabel(addr.state, addr.country),
    getCountryLabel(addr.country),
  ]
    .filter(Boolean)
    .join(', ');

  const stateOptions = useMemo(() => getStates(form.country), [form.country]);
  const districtOptions = useMemo(
    () => getDistricts(form.country, form.state),
    [form.country, form.state]
  );

  const startEdit = () => {
    setForm({
      country: addr.country || 'IN',
      state: addr.state || '',
      district: addr.district || '',
      city: addr.city || '',
    });
    setError('');
    setEditing(true);
  };

  const cancelEdit = () => {
    setError('');
    setEditing(false);
  };

  const onCountry = (v) => setForm((f) => ({ ...f, country: v, state: '', district: '' }));
  const onState = (v) => setForm((f) => ({ ...f, state: v, district: '' }));
  const onDistrict = (v) => setForm((f) => ({ ...f, district: v }));
  const onCity = (v) => setForm((f) => ({ ...f, city: v }));

  const save = async () => {
    if (!form.country || !form.state || !form.district) {
      setError('Country, state and district / city are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data } = await api.put('/auth/update-address', {
        country: form.country,
        state: form.state,
        district: form.district,
        city: form.city?.trim() || '',
      });
      setUser(data.user);
      setEditing(false);
    } catch (err) {
      // The server may return the updated user even on a limit error.
      if (err?.response?.data?.user) setUser(err.response.data.user);
      setError(getErrorMessage(err, 'Could not save your location.'));
    } finally {
      setSaving(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const go = (screen) => navigation?.navigate?.(screen);

  const initial = (user?.name || user?.email || 'U').charAt(0).toUpperCase();

  return (
    <GlowBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ---------- Header ---------- */}
            <View style={styles.headerRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="h2" numberOfLines={1}>{user?.name || 'User'}</Text>
                <Text variant="muted" numberOfLines={1}>{user?.email || 'No email'}</Text>
              </View>
            </View>

            {/* ---------- Plan / quota ---------- */}
            <Card index={0}>
              <View style={styles.rowBetween}>
                <View>
                  <Text variant="label">Current Plan</Text>
                  <Text variant="h3" style={{ marginTop: 2 }}>{planLabel}</Text>
                </View>
                <View style={styles.creditPill}>
                  <Ionicons name="sparkles" size={14} color={colors.accent} />
                  <Text style={styles.creditPillText}>
                    {extraCredits} {extraCredits === 1 ? 'credit' : 'credits'}
                  </Text>
                </View>
              </View>

              <View style={styles.quotaBlock}>
                <View style={styles.rowBetween}>
                  <Text variant="muted">AI website generations</Text>
                  <Text style={styles.quotaCount}>
                    {genLimit > 0 ? `${genUsage} / ${genLimit}` : `${genUsage} used`}
                  </Text>
                </View>
                {genLimit > 0 ? (
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${genPct}%` }]} />
                  </View>
                ) : (
                  <Text variant="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    Upgrade your plan or add credits to generate AI websites.
                  </Text>
                )}
                {extraCredits > 0 && genLimit > 0 ? (
                  <Text variant="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    Plus {extraCredits} extra top-up {extraCredits === 1 ? 'credit' : 'credits'}.
                  </Text>
                ) : null}
              </View>

              <Button
                title="Plans & Credits"
                variant="outline"
                icon={<Ionicons name="diamond-outline" size={16} color={colors.text} />}
                onPress={() => go('Subscriptions')}
                style={{ marginTop: 14 }}
              />
            </Card>

            {/* ---------- Your area ---------- */}
            <Card index={1}>
              <View style={styles.rowBetween}>
                <View style={styles.titleRow}>
                  <Ionicons name="location-outline" size={18} color={colors.accent} />
                  <Text variant="h3">Your area</Text>
                </View>
                {!editing ? (
                  <Pressable onPress={startEdit} style={styles.editBtn} hitSlop={8}>
                    <Ionicons name="create-outline" size={16} color={colors.primary} />
                    <Text color={colors.primary} style={styles.editBtnText}>Edit</Text>
                  </Pressable>
                ) : null}
              </View>

              {!editing ? (
                <>
                  <Text variant={savedArea ? 'body' : 'muted'} style={{ marginTop: 8 }}>
                    {savedArea || 'No area set yet. Tap Edit to add your location.'}
                  </Text>
                  {plan !== 'max' ? (
                    <Text variant="muted" style={styles.locHint}>
                      {locRemaining > 0
                        ? `${locRemaining} of ${locLimit} location changes left this week.`
                        : 'You have used all your location changes this week.'}
                    </Text>
                  ) : null}
                </>
              ) : (
                <View style={{ gap: 12, marginTop: 14 }}>
                  <Dropdown
                    label="Country"
                    value={form.country}
                    placeholder="Select a country…"
                    options={COUNTRIES}
                    onSelect={onCountry}
                  />
                  <Dropdown
                    label="State / Region"
                    value={form.state}
                    placeholder={form.country ? 'Select a state / region…' : 'Select a country first'}
                    options={stateOptions}
                    onSelect={onState}
                    disabled={!form.country}
                  />
                  <Dropdown
                    label="District / City"
                    value={form.district}
                    placeholder={form.state ? 'Select a district / city…' : 'Select a state first'}
                    options={districtOptions}
                    onSelect={onDistrict}
                    disabled={!form.state}
                  />
                  <View>
                    <Text variant="label" style={{ marginBottom: 6 }}>Town (optional)</Text>
                    <Input
                      placeholder="e.g. Sinnar, Brooklyn, Shibuya"
                      value={form.city}
                      onChangeText={onCity}
                      autoCapitalize="words"
                    />
                  </View>

                  {error ? (
                    <Text color={colors.error} variant="muted">{error}</Text>
                  ) : null}

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
                    <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={cancelEdit} disabled={saving} />
                    <Button title="Save" style={{ flex: 1 }} onPress={save} loading={saving} />
                  </View>
                </View>
              )}
            </Card>

            {/* ---------- Menu ---------- */}
            <View style={styles.menu}>
              {MENU.map((m, i) => (
                <MenuRow
                  key={m.key}
                  index={i + 2}
                  icon={m.icon}
                  label={m.label}
                  sub={m.sub}
                  tone={m.tone}
                  onPress={() => go(m.screen)}
                />
              ))}

              {isAdmin ? (
                <MenuRow
                  index={MENU.length + 2}
                  icon="shield-checkmark-outline"
                  label="Moderation"
                  sub="Review reported content"
                  tone="accent"
                  onPress={() => go('Moderation')}
                />
              ) : null}
            </View>

            {/* ---------- Sign out ---------- */}
            <Button
              title="Sign Out"
              variant="outline"
              icon={<Ionicons name="log-out-outline" size={17} color={colors.error} />}
              onPress={confirmLogout}
              style={{ marginTop: 4 }}
            />

            <Text variant="muted" style={styles.footer}>
              Localify - contact discovery, done right.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GlowBackground>
  );
}

/* ---------------- Menu row ---------------- */
function MenuRow({ icon, label, sub, tone = 'primary', onPress, index }) {
  const tint = tone === 'accent' ? colors.accent : colors.primary;
  const tintBg = tone === 'accent' ? 'rgba(0,212,170,0.12)' : 'rgba(108,99,255,0.14)';
  const tintBd = tone === 'accent' ? 'rgba(0,212,170,0.30)' : 'rgba(108,99,255,0.35)';
  return (
    <Card index={index} onPress={onPress} style={styles.menuCard}>
      <View style={styles.menuInner}>
        <View style={[styles.menuIcon, { backgroundColor: tintBg, borderColor: tintBd }]}>
          <Ionicons name={icon} size={19} color={tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.menuLabel}>{label}</Text>
          {sub ? <Text variant="muted" style={{ fontSize: 12.5, marginTop: 1 }}>{sub}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: 16, paddingBottom: 56 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
  avatar: {
    width: 60, height: 60, borderRadius: 18, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: font.display, fontSize: 24, color: colors.white },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  creditPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,212,170,0.10)', borderWidth: 1, borderColor: 'rgba(0,212,170,0.28)',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill,
  },
  creditPillText: { color: colors.accent, fontFamily: font.bodySemi, fontSize: 13 },

  quotaBlock: {
    marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border,
  },
  quotaCount: { color: colors.text, fontFamily: font.bodySemi, fontSize: 13 },
  track: {
    height: 8, borderRadius: radius.pill, backgroundColor: colors.surface2,
    overflow: 'hidden', marginTop: 8,
  },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },

  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editBtnText: { fontFamily: font.bodySemi, fontSize: 13 },
  locHint: { marginTop: 10, fontSize: 12.5 },

  menu: { gap: 12 },
  menuCard: { paddingVertical: 14 },
  menuInner: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  menuIcon: {
    width: 42, height: 42, borderRadius: radius.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  menuLabel: { fontFamily: font.bodySemi, fontSize: 15, color: colors.text },

  footer: { textAlign: 'center', marginTop: 8, fontSize: 12 },
});
