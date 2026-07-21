import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MotiView } from 'moti';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Country, State, City } from 'country-state-city';
import GlowBackground from '../components/GlowBackground';
import { Text, Card, Button, Input, Loader, Divider } from '../components/ui';
import Dropdown from '../components/Dropdown';
import { colors, radius, spacing, font } from '../theme/colors';
import api, { getErrorMessage } from '../api/client';
import { useAuthStore } from '../store/authStore';

/* -----------------------------------------------------------------------
 * Location helpers (mirror client/src/utils/locations.js, self-contained)
 * --------------------------------------------------------------------- */
const COUNTRIES = Country.getAllCountries()
  .map((c) => ({ value: c.isoCode, label: c.name }))
  .sort((a, b) => a.label.localeCompare(b.label));

const getStates = (countryCode) =>
  !countryCode
    ? []
    : State.getStatesOfCountry(countryCode)
        .map((s) => ({ value: s.isoCode, label: s.name }))
        .sort((a, b) => a.label.localeCompare(b.label));

const getCities = (countryCode, stateCode) =>
  !countryCode || !stateCode
    ? []
    : City.getCitiesOfState(countryCode, stateCode)
        .map((c) => c.name)
        .sort((a, b) => a.localeCompare(b));

const getCountryLabel = (iso) => {
  if (!iso) return '';
  const c = Country.getCountryByCode(iso);
  return c ? c.name : iso;
};

const getStateLabel = (stateCode, countryCode) => {
  if (!stateCode) return '';
  if (!countryCode) return stateCode;
  const s = State.getStateByCodeAndCountry(stateCode, countryCode);
  return s ? s.name : stateCode;
};

// Legacy slug support so older India-only saved addresses still render.
const LEGACY_STATE_MAP = {
  'andhra-pradesh': 'Andhra Pradesh',
  'arunachal-pradesh': 'Arunachal Pradesh',
  assam: 'Assam',
  bihar: 'Bihar',
  chhattisgarh: 'Chhattisgarh',
  goa: 'Goa',
  gujarat: 'Gujarat',
  haryana: 'Haryana',
  'himachal-pradesh': 'Himachal Pradesh',
  jharkhand: 'Jharkhand',
  karnataka: 'Karnataka',
  kerala: 'Kerala',
  'madhya-pradesh': 'Madhya Pradesh',
  maharashtra: 'Maharashtra',
  'tamil-nadu': 'Tamil Nadu',
  telangana: 'Telangana',
  'uttar-pradesh': 'Uttar Pradesh',
  uttarakhand: 'Uttarakhand',
  'west-bengal': 'West Bengal',
  delhi: 'Delhi (NCT)',
  punjab: 'Punjab',
  rajasthan: 'Rajasthan',
  odisha: 'Odisha',
};

const getStateLabelSmart = (stateValue, countryCode) =>
  LEGACY_STATE_MAP[stateValue] || getStateLabel(stateValue, countryCode);

const GRIEVANCE_KINDS = [
  { value: 'data_access', label: 'Access my data' },
  { value: 'data_correction', label: 'Correct my data' },
  { value: 'data_erasure', label: 'Erase my data' },
  { value: 'dpdp_grievance', label: 'General grievance' },
];

const hasAddressOf = (u) =>
  Boolean(u?.address?.country && u?.address?.state && u?.address?.district);

/* -----------------------------------------------------------------------
 * SettingsScreen
 * --------------------------------------------------------------------- */
export default function SettingsScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [status, setStatus] = useState('loading'); // loading | success | error
  const [alertsOn, setAlertsOn] = useState(true);
  const [saved, setSaved] = useState([]);
  const [officer, setOfficer] = useState(null);
  const [gk, setGk] = useState('data_access');
  const [gmsg, setGmsg] = useState('');
  const [gbusy, setGbusy] = useState(false);

  const [sectionErrors, setSectionErrors] = useState({
    consent: false,
    savedSearches: false,
    privacy: false,
  });

  // Floating notice (replaces web toasts)
  const [notice, setNotice] = useState(null); // { text, tone }
  const flash = useCallback((text, tone = 'accent') => {
    setNotice({ text, tone });
    setTimeout(() => setNotice(null), 2600);
  }, []);

  /* ---- Load (allSettled so one failure doesn't sink the page) ---- */
  const load = useCallback(async () => {
    setStatus('loading');
    const [consentRes, savedRes, privacyRes] = await Promise.allSettled([
      api.get('/auth/consent'),
      api.get('/auth/saved-searches'),
      api.get('/legal/privacy'),
    ]);

    const errors = { consent: false, savedSearches: false, privacy: false };

    if (consentRes.status === 'fulfilled') {
      const alerts = (consentRes.value.data.consents || []).find(
        (x) => x.purpose === 'match_alerts'
      );
      setAlertsOn(!alerts || alerts.granted !== false);
    } else {
      errors.consent = true;
    }

    if (savedRes.status === 'fulfilled') {
      setSaved(savedRes.value.data.savedSearches || []);
    } else {
      errors.savedSearches = true;
    }

    if (privacyRes.status === 'fulfilled') {
      setOfficer(privacyRes.value.data.grievanceOfficer);
    } else {
      errors.privacy = true;
    }

    setSectionErrors(errors);
    const allFailed = errors.consent && errors.savedSearches && errors.privacy;
    setStatus(allFailed ? 'error' : 'success');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* ---- Consent toggle ---- */
  const toggleAlerts = async () => {
    const next = !alertsOn;
    setAlertsOn(next);
    try {
      await api.put('/auth/consent', { purpose: 'match_alerts', granted: next });
    } catch (err) {
      setAlertsOn(!next);
      flash(getErrorMessage(err, 'Could not update.'), 'error');
    }
  };

  /* ---- Saved searches ---- */
  const removeSaved = async (id) => {
    try {
      const { data } = await api.delete(`/auth/saved-searches/${id}`);
      setSaved(data.savedSearches || []);
    } catch (err) {
      flash(getErrorMessage(err, 'Could not remove.'), 'error');
    }
  };

  /* ---- Grievance ---- */
  const submitGrievance = async () => {
    if (gmsg.trim().length < 10) {
      return flash('Please describe your request (10+ characters).', 'error');
    }
    setGbusy(true);
    try {
      const { data } = await api.post('/legal/grievance', { kind: gk, message: gmsg });
      flash(`Recorded — ticket ${data.ticket}.`, 'accent');
      setGmsg('');
    } catch (err) {
      flash(getErrorMessage(err, 'Could not submit.'), 'error');
    } finally {
      setGbusy(false);
    }
  };

  const planLabel = (user?.plan || 'free').toUpperCase();

  return (
    <GlowBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          {/* Header */}
          <Pressable style={styles.back} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
            <Text variant="body" style={{ fontFamily: font.bodySemi }}>Back</Text>
          </Pressable>

          <ScrollView
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 56, gap: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            <View>
              <Text variant="h1">Settings & privacy</Text>
              <Text variant="muted" style={{ marginTop: 4 }}>
                Manage your location, alerts and data rights.
              </Text>
            </View>

            {/* Account info */}
            {user ? (
              <Card>
                <View style={styles.accountRow}>
                  <View style={styles.avatar}>
                    <Text style={{ fontFamily: font.display, fontSize: 22, color: colors.white }}>
                      {(user?.name || 'U').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="h3">{user?.name || 'User'}</Text>
                    {user?.email ? <Text variant="muted" numberOfLines={1}>{user.email}</Text> : null}
                  </View>
                  <View style={styles.planPill}>
                    <Ionicons name="ribbon-outline" size={13} color={colors.accent} />
                    <Text style={{ color: colors.accent, fontFamily: font.bodySemi, fontSize: 12 }}>
                      {planLabel}
                    </Text>
                  </View>
                </View>
                <Divider style={{ marginVertical: 12 }} />
                <Button
                  title="Manage subscription"
                  variant="ghost"
                  icon={<Ionicons name="card-outline" size={16} color={colors.primary} />}
                  onPress={() => navigation.navigate('Subscriptions')}
                />
              </Card>
            ) : null}

            {status === 'loading' && <Loader label="Loading…" />}

            {status === 'error' && (
              <Card>
                <View style={{ alignItems: 'center', paddingVertical: 8, gap: 10 }}>
                  <Ionicons name="cloud-offline-outline" size={34} color={colors.error} />
                  <Text variant="body" color={colors.error} style={{ textAlign: 'center' }}>
                    Could not load settings. Please try again later.
                  </Text>
                  <Button
                    title="Retry"
                    variant="outline"
                    onPress={load}
                    icon={<Ionicons name="refresh" size={16} color={colors.text} />}
                  />
                </View>
              </Card>
            )}

            {/* Location — always rendered once loading is done */}
            {status !== 'loading' && (
              <LocationSection user={user} setUser={setUser} navigation={navigation} flash={flash} />
            )}

            {status === 'success' && (
              <>
                {/* Match alerts */}
                {!sectionErrors.consent && (
                  <Card>
                    <View style={styles.alertRow}>
                      <View style={{ flexDirection: 'row', gap: 12, flex: 1 }}>
                        <Ionicons name="notifications-outline" size={20} color={colors.primary} style={{ marginTop: 2 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: font.bodySemi, color: colors.text }}>Match alerts</Text>
                          <Text variant="muted" style={{ marginTop: 2, lineHeight: 19 }}>
                            Get notified when a buyer or seller matches you. Pull-only — never spam.
                          </Text>
                        </View>
                      </View>
                      <Switch
                        value={alertsOn}
                        onValueChange={toggleAlerts}
                        trackColor={{ false: colors.surface2, true: colors.primary }}
                        thumbColor={colors.white}
                        ios_backgroundColor={colors.surface2}
                      />
                    </View>
                  </Card>
                )}

                {/* Saved searches */}
                {!sectionErrors.savedSearches && (
                  <Card>
                    <View style={styles.cardHead}>
                      <Ionicons name="bookmark-outline" size={18} color={colors.primary} />
                      <Text variant="h3">Saved searches</Text>
                    </View>
                    {saved.length === 0 ? (
                      <Text variant="muted">None yet — save a search from the Search page.</Text>
                    ) : (
                      <View style={{ gap: 8 }}>
                        {saved.map((s) => (
                          <View key={s._id} style={styles.savedRow}>
                            <Text style={{ flex: 1, color: colors.text }} numberOfLines={1}>
                              {s.label || s.query?.rawText || 'Saved search'}
                            </Text>
                            <Pressable
                              onPress={() => removeSaved(s._id)}
                              hitSlop={8}
                              style={({ pressed }) => pressed && { opacity: 0.6 }}
                            >
                              <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    )}
                  </Card>
                )}

                {/* Data rights / DPDP */}
                {!sectionErrors.privacy && (
                  <Card>
                    <View style={styles.cardHead}>
                      <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
                      <Text variant="h3">Your data rights (DPDP)</Text>
                    </View>
                    <Text variant="muted" style={{ marginBottom: 14, lineHeight: 20 }}>
                      Access, correct, or erase your data, or raise a grievance. Our officer
                      {officer?.name ? `, ${officer.name},` : ''} responds by email
                      {officer?.email ? ` (${officer.email})` : ''}.
                    </Text>
                    <View style={{ gap: 10 }}>
                      <Dropdown
                        label="Request type"
                        value={gk}
                        options={GRIEVANCE_KINDS}
                        onSelect={setGk}
                        searchable={false}
                      />
                      <Input
                        placeholder="Describe your request"
                        value={gmsg}
                        onChangeText={setGmsg}
                        multiline
                        style={{ minHeight: 88, textAlignVertical: 'top' }}
                      />
                      <Button
                        title="Submit request"
                        variant="outline"
                        loading={gbusy}
                        onPress={submitGrievance}
                        icon={<Ionicons name="send-outline" size={16} color={colors.text} />}
                      />
                    </View>
                  </Card>
                )}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Floating notice */}
        {notice ? (
          <MotiView
            from={{ opacity: 0, translateY: -10 }}
            animate={{ opacity: 1, translateY: 0 }}
            style={[
              styles.notice,
              notice.tone === 'error' ? styles.noticeError : styles.noticeOk,
            ]}
            pointerEvents="none"
          >
            <Ionicons
              name={notice.tone === 'error' ? 'alert-circle' : 'checkmark-circle'}
              size={16}
              color={notice.tone === 'error' ? colors.error : colors.accent}
            />
            <Text
              variant="label"
              color={notice.tone === 'error' ? colors.error : colors.accent}
              style={{ flex: 1 }}
            >
              {notice.text}
            </Text>
          </MotiView>
        ) : null}
      </SafeAreaView>
    </GlowBackground>
  );
}

/* -----------------------------------------------------------------------
 * LocationSection — global address management with change limits
 * --------------------------------------------------------------------- */
function LocationSection({ user, setUser, navigation, flash }) {
  const seed = () => ({
    country: user?.address?.country || '',
    state: user?.address?.state || '',
    district: user?.address?.district || '',
    city: user?.address?.city || '',
  });

  const hasAddress = hasAddressOf(user);
  const [editing, setEditing] = useState(!hasAddress);
  const [form, setForm] = useState(seed);
  const [saving, setSaving] = useState(false);
  const [errs, setErrs] = useState({});

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const states = useMemo(() => getStates(form.country), [form.country]);
  const cities = useMemo(
    () => getCities(form.country, form.state),
    [form.country, form.state]
  );
  const cityOptions = useMemo(() => cities.map((c) => ({ value: c, label: c })), [cities]);

  // Reset state/district when the chosen country no longer contains them.
  useEffect(() => {
    if (form.country && form.state) {
      const ok = states.some((s) => s.value === form.state);
      if (!ok) setForm((f) => ({ ...f, state: '', district: '' }));
    }
  }, [form.country, form.state, states]);

  // Reset district when the chosen state no longer contains it.
  useEffect(() => {
    if (form.state && form.district) {
      const ok = cities.includes(form.district);
      if (!ok) setForm((f) => ({ ...f, district: '' }));
    }
  }, [form.state, form.district, cities]);

  const plan = user?.plan || 'free';
  const limit = plan === 'max' ? Infinity : plan === 'pro' ? 10 : 3;
  const count = user?.locationChanges?.count || 0;
  const remaining = Math.max(0, limit - count);
  const limitReached = count >= limit;

  const validate = () => {
    const e = {};
    if (!form.country) e.country = 'Select your country';
    if (!form.state) e.state = 'Select your state / region';
    if (!form.district) e.district = 'Select or enter your district / city';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const onSave = async () => {
    if (limitReached || !validate()) return;
    setSaving(true);
    try {
      const { data } = await api.put('/auth/update-address', {
        country: form.country,
        state: form.state,
        district: form.district,
        city: form.city,
      });
      setUser(data.user);
      flash('Location saved.', 'accent');
      setEditing(false);
    } catch (err) {
      if (err.response?.data?.user) setUser(err.response.data.user);
      const msg = getErrorMessage(err, 'Could not save address.');
      flash(msg, msg.toLowerCase().includes('limit') ? 'error' : 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = () => {
    setForm(seed());
    setErrs({});
    setEditing(true);
  };

  const displayCountry = getCountryLabel(user?.address?.country);
  const displayState = getStateLabelSmart(user?.address?.state, user?.address?.country);

  const showForm = !hasAddress || editing;

  return (
    <Card>
      <View style={styles.cardHead}>
        <Ionicons name="globe-outline" size={18} color={colors.primary} />
        <Text variant="h3">Your location</Text>
      </View>
      <Text variant="muted" style={{ marginBottom: 14, lineHeight: 20 }}>
        We use this to find businesses around you — worldwide.
      </Text>

      {plan !== 'max' && (
        <View style={[styles.limitBanner, limitReached ? styles.limitReached : styles.limitOk]}>
          <Text
            variant="muted"
            style={{ flex: 1, color: limitReached ? colors.primary : colors.textMuted }}
          >
            {limitReached
              ? `You have reached your limit of ${limit} location changes this week.`
              : `You have ${remaining} out of ${limit} location changes remaining this week.`}
          </Text>
          <Pressable onPress={() => navigation.navigate('Subscriptions')} hitSlop={6}>
            <Text style={{ color: colors.accent, fontFamily: font.bodySemi, fontSize: 13 }}>
              Upgrade
            </Text>
          </Pressable>
        </View>
      )}

      {!showForm ? (
        <View style={{ gap: 14 }}>
          <View style={styles.savedAddr}>
            <Text variant="label" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Saved address
            </Text>
            <Text style={{ fontFamily: font.displaySemi, fontSize: 16, color: colors.text, marginTop: 4 }}>
              {user?.address?.city || user?.address?.district}
            </Text>
            <Text variant="muted" style={{ marginTop: 2 }}>
              {user?.address?.city ? `${user.address.district}, ` : ''}{displayState}
            </Text>
            <Text variant="muted" style={{ marginTop: 2, fontSize: 13 }}>{displayCountry}</Text>
          </View>
          <Button
            title="Edit location"
            variant="outline"
            onPress={handleEdit}
            icon={<Ionicons name="create-outline" size={16} color={colors.text} />}
          />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <View>
            <Dropdown
              label="Country"
              value={form.country}
              options={COUNTRIES}
              placeholder="Select a country…"
              onSelect={(v) => {
                set('country')(v);
                setErrs((e) => ({ ...e, country: undefined }));
              }}
            />
            {errs.country ? <Text variant="muted" color={colors.error} style={styles.fieldErr}>{errs.country}</Text> : null}
          </View>

          <View>
            <Dropdown
              label="State / Region"
              value={form.state}
              options={states}
              placeholder={form.country ? 'Select a state / region…' : 'Select a country first'}
              disabled={!form.country}
              onSelect={(v) => {
                set('state')(v);
                setErrs((e) => ({ ...e, state: undefined }));
              }}
            />
            {errs.state ? <Text variant="muted" color={colors.error} style={styles.fieldErr}>{errs.state}</Text> : null}
          </View>

          <View>
            <Dropdown
              label="District / City"
              value={form.district}
              options={cityOptions}
              placeholder={form.state ? 'Select a district / city…' : 'Select a state first'}
              disabled={!form.state}
              onSelect={(v) => {
                set('district')(v);
                setErrs((e) => ({ ...e, district: undefined }));
              }}
            />
            {errs.district ? <Text variant="muted" color={colors.error} style={styles.fieldErr}>{errs.district}</Text> : null}
          </View>

          <View>
            <Text variant="label" style={{ marginBottom: 6 }}>Town (optional)</Text>
            <Input
              placeholder="e.g. Sinnar, Brooklyn, Shibuya (optional)"
              value={form.city}
              onChangeText={set('city')}
              autoCapitalize="words"
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
            {hasAddress && (
              <Button
                title="Cancel"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => { setEditing(false); setErrs({}); }}
              />
            )}
            <Button
              title={limitReached ? 'Limit reached' : 'Save location'}
              style={{ flex: 1 }}
              loading={saving}
              disabled={limitReached}
              onPress={onSave}
            />
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: spacing.lg, paddingVertical: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  planPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,212,170,0.10)', borderWidth: 1, borderColor: 'rgba(0,212,170,0.28)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill,
  },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  savedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12,
  },
  limitBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 16,
  },
  limitOk: { borderColor: colors.border, backgroundColor: colors.surface2 },
  limitReached: { borderColor: 'rgba(108,99,255,0.30)', backgroundColor: 'rgba(108,99,255,0.10)' },
  savedAddr: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: 16,
  },
  fieldErr: { fontSize: 12, marginTop: 5 },
  notice: {
    position: 'absolute', top: 12, left: spacing.lg, right: spacing.lg,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11,
  },
  noticeOk: { backgroundColor: 'rgba(0,212,170,0.12)', borderColor: 'rgba(0,212,170,0.30)' },
  noticeError: { backgroundColor: 'rgba(255,83,112,0.12)', borderColor: 'rgba(255,83,112,0.30)' },
});
