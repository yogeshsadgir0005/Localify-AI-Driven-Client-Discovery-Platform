import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlowBackground from '../components/GlowBackground';
import {
  Text,
  Button,
  Card,
  Badge,
  Input,
  Chip,
  SectionTitle,
  Divider,
  IconTile,
} from '../components/ui';
import { colors, radius, spacing, font } from '../theme/colors';
import api, { getErrorMessage } from '../api/client';

/* Trust tiers — mirrors ProfileDetailScreen / the web TrustBadge. */
const TRUST_TIERS = {
  listed: { label: 'Listed', icon: 'shield-outline', tone: 'default' },
  phone_verified: { label: 'Phone verified', icon: 'shield-checkmark', tone: 'primary' },
  email_verified: { label: 'Email verified', icon: 'shield-checkmark', tone: 'primary' },
  gst_verified: { label: 'GST verified', icon: 'shield-checkmark', tone: 'accent' },
  kyb_verified: { label: 'KYB verified', icon: 'shield-checkmark', tone: 'accent' },
};

const TONE_COLOR = {
  default: { fg: colors.textMuted, bd: colors.border, bg: colors.surface2 },
  primary: { fg: colors.primary, bd: 'rgba(108,99,255,0.35)', bg: 'rgba(108,99,255,0.12)' },
  accent: { fg: colors.accent, bd: 'rgba(0,212,170,0.30)', bg: 'rgba(0,212,170,0.10)' },
};

const SELLER_KINDS = [
  { key: 'any', label: 'Any' },
  { key: 'business', label: 'Business' },
  { key: 'freelancer', label: 'Freelancer' },
];

function TrustPill({ trust }) {
  const tier = trust?.tier || 'listed';
  const meta = TRUST_TIERS[tier] || TRUST_TIERS.listed;
  const c = TONE_COLOR[meta.tone] || TONE_COLOR.default;
  return (
    <View style={[styles.trustPill, { borderColor: c.bd, backgroundColor: c.bg }]}>
      <Ionicons name={meta.icon} size={11} color={c.fg} />
      <Text variant="label" color={c.fg} style={{ fontSize: 11 }}>{meta.label}</Text>
    </View>
  );
}

function MatchRow({ match, onPress }) {
  const p = match?.profile || {};
  const pct = Math.round((match?.fitScore || 0) * 100);
  const sub = [p.vertical, p.location?.city].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.matchRow, pressed && { opacity: 0.9, borderColor: colors.primary }]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: font.bodySemi }} numberOfLines={1}>{p.name || 'Unnamed'}</Text>
        {sub ? (
          <Text variant="muted" numberOfLines={1} style={{ fontSize: 12, marginTop: 2 }}>{sub}</Text>
        ) : null}
        <View style={{ marginTop: 6 }}><TrustPill trust={p.trust} /></View>
      </View>
      <View style={styles.matchScore}>
        <Text style={{ fontFamily: font.bodySemi, color: pct >= 70 ? colors.accent : colors.text }}>{pct}%</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

export default function RequirementsScreen({ navigation }) {
  const [status, setStatus] = useState('loading'); // loading | error | success
  const [reqs, setReqs] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [matches, setMatches] = useState({}); // id -> matches[]
  const [loadingId, setLoadingId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState(null); // { text, tone }

  // Create form
  const [rawText, setRawText] = useState('');
  const [sellerKind, setSellerKind] = useState('any');
  const [city, setCity] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const flash = (text, tone = 'accent') => {
    setNotice({ text, tone });
    setTimeout(() => setNotice(null), 2600);
  };

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/requirements');
      setReqs(data.requirements || []);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const loadMatches = useCallback(async (id) => {
    setLoadingId(id);
    try {
      const { data } = await api.get(`/requirements/${id}/matches`);
      setMatches((m) => ({ ...m, [id]: data.matches || [] }));
    } catch (err) {
      flash(getErrorMessage(err, 'Could not load matches.'), 'error');
    } finally {
      setLoadingId(null);
    }
  }, []);

  const toggle = (r) => {
    if (openId === r._id) {
      setOpenId(null);
      return;
    }
    setOpenId(r._id);
    if (!matches[r._id]) loadMatches(r._id);
  };

  const submit = async () => {
    const text = rawText.trim();
    if (text.length < 5) {
      flash('Please describe what you are looking for (at least 5 characters).', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const body = { rawText: text };
      if (sellerKind !== 'any') body.sellerKind = sellerKind;
      if (city.trim()) body.geo = { city: city.trim() };

      const { data } = await api.post('/requirements', body);
      const newId = data?.requirement?.id;
      if (newId && Array.isArray(data.matches)) {
        setMatches((m) => ({ ...m, [newId]: data.matches }));
      }
      // Reset form and refresh the list so shapes stay consistent (_id keyed).
      setRawText('');
      setCity('');
      setSellerKind('any');
      await load();
      if (newId) setOpenId(newId);
      flash('Request posted — showing your matches.', 'accent');
    } catch (err) {
      flash(getErrorMessage(err, 'Could not post your request.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const openMatch = (m) => {
    const id = m?.profile?.id;
    if (id) navigation.navigate('ProfileDetail', { id });
  };

  const renderRequirement = (r, index) => {
    const isOpen = openId === r._id;
    const list = matches[r._id];
    const p = r.parsed || {};
    return (
      <Card key={r._id} index={index} style={{ padding: spacing.lg }}>
        <Pressable onPress={() => toggle(r)} style={styles.reqHead}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: font.bodySemi }}>{r.rawText}</Text>
            <View style={styles.pills}>
              {p.vertical ? <Badge label={p.vertical} tone="primary" /> : null}
              {p.moqBand?.min ? <Badge label={`MOQ ~${p.moqBand.min}`} tone="default" /> : null}
              {p.geo?.city ? <Badge label={p.geo.city} tone="accent" /> : null}
            </View>
          </View>
          <Ionicons
            name={isOpen ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={colors.textMuted}
            style={{ marginTop: 2 }}
          />
        </Pressable>

        {isOpen && (
          <View style={{ marginTop: 14 }}>
            <Divider style={{ marginBottom: 14 }} />
            {loadingId === r._id ? (
              <View style={styles.inlineLoad}>
                <ActivityIndicator color={colors.primary} />
                <Text variant="muted" style={{ fontSize: 13 }}>Loading matches…</Text>
              </View>
            ) : list && list.length === 0 ? (
              <Text variant="muted" style={{ fontSize: 13 }}>No matches right now.</Text>
            ) : (
              <View style={{ gap: 8 }}>
                {(list || []).map((m) => (
                  <MatchRow key={m.profile?.id} match={m} onPress={() => openMatch(m)} />
                ))}
              </View>
            )}
          </View>
        )}
      </Card>
    );
  };

  return (
    <GlowBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48, gap: 16 }}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            }
          >
            <View>
              <Text variant="h1">My requests</Text>
              <Text variant="muted" style={{ marginTop: 6 }}>
                Everything you&apos;ve searched for. Re-open any request to see fresh matches.
              </Text>
            </View>

            {/* Create form */}
            <Card style={{ padding: spacing.lg }}>
              <SectionTitle title="Post a request" icon="search-outline" />
              <Input
                placeholder="Describe what you're looking for — e.g. 500 cotton t-shirts, Pune supplier…"
                value={rawText}
                onChangeText={setRawText}
                multiline
                style={styles.textarea}
              />
              <Text variant="label" style={{ marginTop: 14, marginBottom: 8 }}>Looking for</Text>
              <View style={styles.kindRow}>
                {SELLER_KINDS.map((k) => (
                  <Chip
                    key={k.key}
                    label={k.label}
                    active={sellerKind === k.key}
                    onPress={() => setSellerKind(k.key)}
                  />
                ))}
              </View>
              <Input
                placeholder="City (optional)"
                value={city}
                onChangeText={setCity}
                autoCapitalize="words"
                style={{ marginTop: 14 }}
              />
              <Button
                title="Find matches"
                icon={<Ionicons name="sparkles" size={16} color={colors.white} />}
                onPress={submit}
                loading={submitting}
                style={{ marginTop: 14 }}
              />
            </Card>

            {notice ? (
              <View
                style={[
                  styles.notice,
                  notice.tone === 'error' && { backgroundColor: 'rgba(255,83,112,0.10)', borderColor: 'rgba(255,83,112,0.30)' },
                ]}
              >
                <Text variant="label" color={notice.tone === 'error' ? colors.error : colors.accent}>
                  {notice.text}
                </Text>
              </View>
            ) : null}

            {/* List */}
            {status === 'loading' && (
              <View style={styles.inlineLoad}>
                <ActivityIndicator color={colors.primary} />
                <Text variant="muted">Loading…</Text>
              </View>
            )}

            {status === 'error' && (
              <Card style={{ padding: spacing.lg }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="alert-circle-outline" size={20} color={colors.error} />
                  <Text color={colors.error} style={{ flex: 1 }}>Could not load your requests.</Text>
                </View>
                <Button title="Retry" variant="outline" style={{ marginTop: 14 }} onPress={load} />
              </Card>
            )}

            {status === 'success' && reqs.length === 0 && (
              <Card style={styles.empty}>
                <IconTile icon="file-tray-outline" size={64} round={radius.lg} tone="primary" />
                <Text variant="muted" style={{ marginTop: 14, textAlign: 'center' }}>
                  No requests yet. Describe what you need above to find a match.
                </Text>
              </Card>
            )}

            {status === 'success' && reqs.map((r, i) => renderRequirement(r, i))}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GlowBackground>
  );
}

const styles = StyleSheet.create({
  textarea: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' },
  kindRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  notice: {
    backgroundColor: 'rgba(0,212,170,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(0,212,170,0.30)',
    borderRadius: radius.md,
    padding: 12,
  },
  reqHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  inlineLoad: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
  },
  matchScore: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trustPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  empty: { padding: spacing.xl, alignItems: 'center' },
});
