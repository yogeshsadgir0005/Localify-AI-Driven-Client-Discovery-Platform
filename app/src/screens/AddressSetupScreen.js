import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Country, State, City } from 'country-state-city';

import GlowBackground from '../components/GlowBackground';
import Dropdown from '../components/Dropdown';
import { Text, Input, Button, Card } from '../components/ui';
import { colors, radius, spacing, font } from '../theme/colors';
import api, { getErrorMessage } from '../api/client';
import { useAuthStore } from '../store/authStore';

/**
 * AddressSetupScreen — RN port of client/src/pages/AddressSetupPage.jsx.
 *
 * Feature parity with the web page:
 *  - Cascading Country -> State/Region -> District/City selects (searchable).
 *  - Optional free-text Town field.
 *  - Weekly location-change limit banner (free: 3, pro: 10, max: unlimited).
 *  - Validates that country + state + district are chosen before saving.
 *  - PUT /auth/update-address, then setUser() — the RootNavigator auto-advances
 *    off this screen once the stored user has a full address.
 *
 * Screen-specific: dropdown values are ISO codes (for the country-state-city
 * cascade) but the address PUT stores human-readable NAMES, because the backend
 * business search matches on names.
 */
export default function AddressSetupScreen() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  // Full country list once. { label: name, value: isoCode }
  const countries = useMemo(
    () => Country.getAllCountries().map((c) => ({ label: c.name, value: c.isoCode })),
    []
  );

  // Best-effort: resolve any previously-stored NAMES back to ISO codes so the
  // cascade shows the user's existing selection. Defaults to India ("IN").
  const initial = useMemo(() => {
    const a = user?.address || {};
    let ciso = 'IN';
    if (a.country) {
      const m = Country.getAllCountries().find(
        (c) => c.name.toLowerCase() === String(a.country).toLowerCase()
      );
      if (m) ciso = m.isoCode;
    }
    let siso = '';
    if (a.state) {
      const sm = State.getStatesOfCountry(ciso).find(
        (s) => s.name.toLowerCase() === String(a.state).toLowerCase()
      );
      if (sm) siso = sm.isoCode;
    }
    return { ciso, siso, district: a.district || '', town: a.city || '' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [countryIso, setCountryIso] = useState(initial.ciso);
  const [stateIso, setStateIso] = useState(initial.siso);
  const [district, setDistrict] = useState(initial.district);
  const [town, setTown] = useState(initial.town);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Cascading option lists.
  const stateOptions = useMemo(
    () =>
      countryIso
        ? State.getStatesOfCountry(countryIso).map((s) => ({ label: s.name, value: s.isoCode }))
        : [],
    [countryIso]
  );
  const districtOptions = useMemo(
    () =>
      countryIso && stateIso
        ? City.getCitiesOfState(countryIso, stateIso).map((c) => ({ label: c.name, value: c.name }))
        : [],
    [countryIso, stateIso]
  );

  // Resolve human-readable names for the payload.
  const countryName = useMemo(
    () => countries.find((c) => c.value === countryIso)?.label || '',
    [countries, countryIso]
  );
  const stateName = useMemo(
    () => stateOptions.find((s) => s.value === stateIso)?.label || '',
    [stateOptions, stateIso]
  );

  // Plan-based weekly location-change limit (mirrors the web page).
  const plan = user?.plan || 'free';
  const limit = plan === 'max' ? Infinity : plan === 'pro' ? 10 : 3;
  const count = user?.locationChanges?.count || 0;
  const remaining = Math.max(0, limit - count);
  const limitReached = count >= limit;

  // When country changes, reset the dependent state + district selections.
  const onCountry = (iso) => {
    setCountryIso(iso);
    setStateIso('');
    setDistrict('');
    setError('');
  };
  // When state changes, reset the district.
  const onState = (iso) => {
    setStateIso(iso);
    setDistrict('');
    setError('');
  };
  const onDistrict = (v) => {
    setDistrict(v);
    setError('');
  };

  // Some regions have no preset city list — fall back to a free-text district
  // so the required field is never a dead end.
  const districtFreeText = Boolean(stateIso) && districtOptions.length === 0;

  const onSave = async () => {
    if (!countryIso || !stateIso || !district.trim()) {
      setError('Please select your country, state, and district.');
      return;
    }
    if (limitReached) {
      setError(`You have reached your limit of ${limit} location changes this week.`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.put('/auth/update-address', {
        country: countryName,
        state: stateName,
        district: district.trim(),
        city: town.trim(),
      });
      // Navigator watches the store and auto-advances once the address is full.
      setUser(data.user);
    } catch (err) {
      // Backend may return the updated user even on a limit error.
      if (err.response?.data?.user) setUser(err.response.data.user);
      setError(getErrorMessage(err, 'Could not save your location.'));
    } finally {
      setLoading(false);
    }
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
            showsVerticalScrollIndicator={false}
          >
            <Card index={0} style={styles.card}>
              {/* Header */}
              <View style={styles.header}>
                <LinearGradient
                  colors={[colors.primary, colors.accent]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconTile}
                >
                  <Ionicons name="globe-outline" size={26} color={colors.bg} />
                </LinearGradient>
                <Text variant="h2" style={{ marginTop: 14, textAlign: 'center' }}>
                  Where are you looking?
                </Text>
                <Text variant="muted" style={{ marginTop: 6, textAlign: 'center' }}>
                  Set your location to find the best local businesses around you.
                </Text>
              </View>

              {/* Weekly location-change limit banner */}
              {plan !== 'max' ? (
                <View style={[styles.banner, limitReached ? styles.bannerAlert : styles.bannerInfo]}>
                  <Text
                    style={{
                      fontFamily: font.body,
                      fontSize: 13,
                      lineHeight: 18,
                      color: limitReached ? colors.primary : colors.textMuted,
                    }}
                  >
                    {limitReached
                      ? `You have reached your limit of ${limit} location changes this week.`
                      : `You have ${remaining} out of ${limit} location changes remaining this week.`}
                  </Text>
                </View>
              ) : null}

              {/* Form */}
              <View style={styles.form}>
                <Dropdown
                  label="Country"
                  value={countryIso}
                  options={countries}
                  onSelect={onCountry}
                  placeholder="Select a country…"
                  searchable
                />

                <Dropdown
                  label="State / Region"
                  value={stateIso}
                  options={stateOptions}
                  onSelect={onState}
                  placeholder={countryIso ? 'Select a state / region…' : 'Select a country first'}
                  disabled={!countryIso}
                  searchable
                />

                {districtFreeText ? (
                  <View>
                    <Text variant="label" style={styles.lbl}>
                      District / City
                    </Text>
                    <Input
                      placeholder="Enter your district / city"
                      value={district}
                      onChangeText={onDistrict}
                      autoCapitalize="words"
                    />
                    <Text variant="muted" style={styles.hint}>
                      No preset list for this region — type it in.
                    </Text>
                  </View>
                ) : (
                  <Dropdown
                    label="District / City"
                    value={district}
                    options={districtOptions}
                    onSelect={onDistrict}
                    placeholder={stateIso ? 'Select a district / city…' : 'Select a state first'}
                    disabled={!stateIso}
                    searchable
                  />
                )}

                <View>
                  <Text variant="label" style={styles.lbl}>
                    Town <Text style={styles.optional}>(optional)</Text>
                  </Text>
                  <Input
                    placeholder="e.g. Sinnar, Brooklyn, Shibuya"
                    value={town}
                    onChangeText={setTown}
                    autoCapitalize="words"
                  />
                </View>

                {error ? (
                  <View style={styles.errBanner}>
                    <Ionicons name="alert-circle" size={16} color={colors.error} />
                    <Text style={styles.errText}>{error}</Text>
                  </View>
                ) : null}

                <Button
                  title={limitReached ? 'Limit Reached' : 'Complete Setup'}
                  onPress={onSave}
                  loading={loading}
                  disabled={limitReached}
                  icon={
                    <Ionicons
                      name={limitReached ? 'lock-closed' : 'checkmark-circle'}
                      size={18}
                      color={colors.white}
                    />
                  }
                  style={{ marginTop: 4 }}
                />
              </View>
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GlowBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    padding: spacing.xl,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  iconTile: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: spacing.md,
  },
  bannerInfo: {
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  bannerAlert: {
    borderColor: 'rgba(108,99,255,0.35)',
    backgroundColor: 'rgba(108,99,255,0.10)',
  },
  form: {
    gap: 14,
  },
  lbl: {
    marginBottom: 6,
  },
  optional: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  hint: {
    fontSize: 12,
    marginTop: 6,
  },
  errBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,83,112,0.30)',
    backgroundColor: 'rgba(255,83,112,0.12)',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errText: {
    flex: 1,
    fontFamily: font.body,
    fontSize: 13,
    color: colors.error,
  },
});
