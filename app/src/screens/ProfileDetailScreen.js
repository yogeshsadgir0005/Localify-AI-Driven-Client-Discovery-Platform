import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Modal,
  Linking,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import GlowBackground from '../components/GlowBackground';
import {
  Text,
  Button,
  Card,
  Badge,
  Input,
  Loader,
  SectionTitle,
  Divider,
} from '../components/ui';
import { colors, radius, spacing, font } from '../theme/colors';
import api, { getErrorMessage } from '../api/client';

const HANDOFF =
  'You are connected. Continue off-platform — Localify does not handle quotes, payments or delivery.';

const TONES = {
  default: { bg: colors.surface2, fg: colors.textMuted, bd: colors.border },
  primary: { bg: 'rgba(108,99,255,0.14)', fg: colors.primary, bd: 'rgba(108,99,255,0.35)' },
  accent: { bg: 'rgba(0,212,170,0.12)', fg: colors.accent, bd: 'rgba(0,212,170,0.30)' },
};

const TRUST_TIERS = {
  listed: { label: 'Listed', icon: 'shield-outline', tone: 'default' },
  phone_verified: { label: 'Phone verified', icon: 'shield-checkmark', tone: 'primary' },
  email_verified: { label: 'Email verified', icon: 'shield-checkmark', tone: 'primary' },
  gst_verified: { label: 'GST verified', icon: 'shield-checkmark', tone: 'accent' },
  kyb_verified: { label: 'KYB verified', icon: 'shield-checkmark', tone: 'accent' },
};

/* ---- small building blocks (mirror the web page) ---- */
function Stars({ n = 0, size = 14 }) {
  const rounded = Math.round(n || 0);
  return (
    <View style={{ flexDirection: 'row' }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons
          key={i}
          name={i < rounded ? 'star' : 'star-outline'}
          size={size}
          color={i < rounded ? colors.accent : colors.border}
        />
      ))}
    </View>
  );
}

function Pill({ tone = 'default', children, style }) {
  const t = TONES[tone] || TONES.default;
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.bd }, style]}>
      {children}
    </View>
  );
}

function TrustPill({ trust }) {
  const tier = trust?.tier || 'listed';
  const meta = TRUST_TIERS[tier] || TRUST_TIERS.listed;
  const t = TONES[meta.tone] || TONES.default;
  const caveats = trust?.caveats || [];
  return (
    <Pill tone={meta.tone}>
      <Ionicons name={meta.icon} size={12} color={t.fg} />
      <Text variant="label" color={t.fg} style={styles.pillText}>{meta.label}</Text>
      {typeof trust?.score === 'number' && (
        <Text variant="label" color={t.fg} style={[styles.pillText, { opacity: 0.7 }]}>· {trust.score}</Text>
      )}
      {caveats.length > 0 && (
        <Ionicons name="warning-outline" size={12} color={t.fg} style={{ opacity: 0.7 }} />
      )}
    </Pill>
  );
}

export default function ProfileDetailScreen({ route, navigation }) {
  const { id } = route.params || {};

  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | success | notfound | error
  const [cr, setCr] = useState(null);
  const [contacting, setContacting] = useState(false);
  const [notice, setNotice] = useState('');

  // report modal
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reporting, setReporting] = useState(false);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 2600); };

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [p, r] = await Promise.all([
        api.get(`/profiles/${id}`),
        api.get(`/reviews/profile/${id}`),
      ]);
      setProfile(p.data.profile);
      setReviews(r.data.reviews || []);
      setStatus('success');
    } catch (err) {
      setStatus(err.response?.status === 404 ? 'notfound' : 'error');
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const requestContact = async () => {
    setContacting(true);
    try {
      const { data } = await api.post('/contacts', { profileId: id });
      setCr(data.contactRequest);
    } catch (err) {
      flash(getErrorMessage(err, 'Could not request contact.'));
    } finally {
      setContacting(false);
    }
  };

  const submitReport = async () => {
    setReporting(true);
    try {
      await api.post(`/profiles/${id}/report`, { reason: reportReason });
      setReportOpen(false);
      setReportReason('');
      flash('Reported — our team will review it.');
    } catch (err) {
      flash(getErrorMessage(err, 'Could not submit report.'));
    } finally {
      setReporting(false);
    }
  };

  const openTel = (phone) => Linking.openURL(`tel:${phone}`);
  const openMail = (email) => Linking.openURL(`mailto:${email}`);
  const openWebsite = (url) => WebBrowser.openBrowserAsync(url);

  /* ---- loading / error / notfound ---- */
  if (status === 'loading') {
    return (
      <GlowBackground>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <Loader label="Loading profile…" />
        </SafeAreaView>
      </GlowBackground>
    );
  }
  if (status === 'notfound' || status === 'error') {
    return (
      <GlowBackground>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.error} />
            <Text variant="h3" style={{ marginTop: 12 }}>
              {status === 'notfound' ? 'Profile not found' : 'Something went wrong'}
            </Text>
            <Button
              title="Back to search"
              style={{ marginTop: 18 }}
              onPress={() => navigation.navigate('Discover')}
            />
          </View>
        </SafeAreaView>
      </GlowBackground>
    );
  }

  const contact = cr?.revealedContact || {};
  const locBits = [profile?.location?.city, profile?.location?.state].filter(Boolean);
  const hasMeta =
    profile?.moqMin != null ||
    profile?.priceBand ||
    (profile?.categories || []).length > 0;

  return (
    <GlowBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <Pressable style={styles.back} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
          <Text variant="body" style={{ fontFamily: font.bodySemi }}>Back</Text>
        </Pressable>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48, gap: 18 }}>
          {notice ? (
            <View style={styles.notice}>
              <Text variant="label" color={colors.accent}>{notice}</Text>
            </View>
          ) : null}

          {/* Header card */}
          <Card>
            <View style={styles.pillRow}>
              {profile?.vertical ? (
                <Pill tone="primary">
                  <Text variant="label" color={colors.primary} style={styles.pillText}>{profile.vertical}</Text>
                </Pill>
              ) : null}
              <TrustPill trust={profile?.trust} />
              {profile?.reviewCount > 0 ? (
                <Pill>
                  <Stars n={profile.ratingAvg} size={12} />
                  <Text variant="label" style={styles.pillText}>
                    {profile.ratingAvg?.toFixed(1)} · {profile.reviewCount}
                  </Text>
                </Pill>
              ) : null}
            </View>

            <Text variant="h1" style={{ marginTop: 4 }}>{profile?.name}</Text>

            {locBits.length > 0 ? (
              <View style={styles.locRow}>
                <Ionicons name="location-outline" size={15} color={colors.textMuted} />
                <Text variant="muted">{locBits.join(', ')}</Text>
              </View>
            ) : null}

            {profile?.description ? (
              <Text variant="muted" style={{ marginTop: 14, lineHeight: 22 }}>{profile.description}</Text>
            ) : null}

            {hasMeta ? (
              <View style={[styles.pillRow, { marginTop: 14 }]}>
                {(profile?.categories || []).map((c) => (
                  <Badge key={c} label={c} tone="default" />
                ))}
                {profile?.moqMin != null ? <Badge label={`MOQ ${profile.moqMin}`} tone="default" /> : null}
                {profile?.priceBand ? <Badge label={profile.priceBand} tone="default" /> : null}
              </View>
            ) : null}

            {(profile?.trust?.caveats || []).length > 0 ? (
              <View style={{ marginTop: 12, gap: 4 }}>
                {profile.trust.caveats.map((c, i) => (
                  <View key={i} style={styles.caveatRow}>
                    <Text variant="muted" style={{ fontSize: 12 }}>•</Text>
                    <Text variant="muted" style={{ fontSize: 12, flex: 1 }}>{c}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Divider style={{ marginVertical: 18 }} />

            {/* Contact action / state */}
            {!cr ? (
              <Button
                title="Request contact"
                loading={contacting}
                icon={<Ionicons name="chatbubble-ellipses-outline" size={17} color={colors.white} />}
                onPress={requestContact}
              />
            ) : null}

            {cr && cr.status !== 'revealed' ? (
              <View style={styles.pendingBox}>
                <Text variant="muted" style={{ lineHeight: 20 }}>
                  Request sent — track it under{' '}
                  <Text color={colors.primary} onPress={() => navigation.navigate('Discover')} style={{ fontFamily: font.bodySemi }}>
                    My requests
                  </Text>.
                </Text>
              </View>
            ) : null}

            {cr && cr.status === 'revealed' ? (
              <View style={styles.revealBox}>
                <View style={{ gap: 12 }}>
                  {contact.phone ? (
                    <Pressable style={styles.contactLink} onPress={() => openTel(contact.phone)}>
                      <Ionicons name="call" size={17} color={colors.accent} />
                      <Text style={{ fontFamily: font.bodySemi }}>{contact.phone}</Text>
                    </Pressable>
                  ) : null}
                  {contact.email ? (
                    <Pressable style={styles.contactLink} onPress={() => openMail(contact.email)}>
                      <Ionicons name="mail-outline" size={17} color={colors.textMuted} />
                      <Text>{contact.email}</Text>
                    </Pressable>
                  ) : null}
                  {contact.website ? (
                    <Pressable style={styles.contactLink} onPress={() => openWebsite(contact.website)}>
                      <Ionicons name="globe-outline" size={17} color={colors.primary} />
                      <Text color={colors.primary} style={{ fontFamily: font.bodySemi }}>Website</Text>
                    </Pressable>
                  ) : null}
                </View>
                {cr.draftedMessage ? (
                  <View style={styles.draftBox}>
                    <Text style={{ lineHeight: 21 }}>{cr.draftedMessage}</Text>
                  </View>
                ) : null}
                <Text variant="muted" style={{ fontSize: 12, lineHeight: 18 }}>{HANDOFF}</Text>
              </View>
            ) : null}
          </Card>

          {/* Reviews */}
          {reviews.length > 0 ? (
            <View>
              <SectionTitle title="Contact-verified reviews" icon="star-outline" />
              <View style={{ gap: 10 }}>
                {reviews.map((r, i) => (
                  <Card key={i} index={i}>
                    <Stars n={r.rating} />
                    {r.text ? (
                      <Text variant="muted" style={{ marginTop: 8, lineHeight: 20 }}>{r.text}</Text>
                    ) : null}
                  </Card>
                ))}
              </View>
            </View>
          ) : null}

          {/* Report */}
          <View style={{ alignItems: 'flex-end' }}>
            <Pressable style={styles.reportBtn} onPress={() => setReportOpen(true)}>
              <Ionicons name="flag-outline" size={13} color={colors.textMuted} />
              <Text variant="muted" style={{ fontSize: 12 }}>Report this business</Text>
            </Pressable>
          </View>
        </ScrollView>

        {/* Report modal (replaces the web window.prompt) */}
        <Modal visible={reportOpen} transparent animationType="slide" onRequestClose={() => setReportOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setReportOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHead}>
              <Text variant="h3">Report business</Text>
              <Pressable onPress={() => setReportOpen(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text variant="muted" style={{ marginTop: 6, marginBottom: 12 }}>
              Why are you reporting this business? (optional)
            </Text>
            <Input
              placeholder="Reason…"
              value={reportReason}
              onChangeText={setReportReason}
              multiline
              style={{ minHeight: 90, textAlignVertical: 'top' }}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={() => setReportOpen(false)} />
              <Button title="Submit report" style={{ flex: 1.3 }} loading={reporting} onPress={submitReport} />
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </GlowBackground>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: spacing.lg, paddingVertical: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  notice: {
    backgroundColor: 'rgba(0,212,170,0.10)', borderWidth: 1, borderColor: 'rgba(0,212,170,0.30)',
    borderRadius: radius.md, padding: 10,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 11 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  caveatRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  pendingBox: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: 12,
  },
  revealBox: {
    backgroundColor: 'rgba(0,212,170,0.05)', borderWidth: 1, borderColor: 'rgba(0,212,170,0.30)',
    borderRadius: radius.lg, padding: 16, gap: 12,
  },
  contactLink: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  draftBox: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: 12,
  },
  reportBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingBottom: 28, paddingTop: 10,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 8 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
