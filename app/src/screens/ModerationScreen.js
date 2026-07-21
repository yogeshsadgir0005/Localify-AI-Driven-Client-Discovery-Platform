import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlowBackground from '../components/GlowBackground';
import { Text, Card, Badge, Loader, SectionTitle, Divider } from '../components/ui';
import { colors, radius, spacing, font } from '../theme/colors';
import api, { getErrorMessage } from '../api/client';
import { useAuthStore } from '../store/authStore';

/* Maps a profile's review state to one of the shared Badge tones. */
const stateTone = (s) =>
  ({ ok: 'accent', under_review: 'primary', contested: 'primary', flagged: 'error' }[s] || 'default');

/* Fraction → percentage string, matching the web page's `pct` helper. */
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

export default function ModerationScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = Array.isArray(user?.roles) && user.roles.includes('admin');

  const [queue, setQueue] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [dupes, setDupes] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | success | error | forbidden
  const [busy, setBusy] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState(null); // { msg, tone }

  const flash = (msg, tone = 'accent') => {
    setNotice({ msg, tone });
    setTimeout(() => setNotice(null), 2600);
  };

  const load = useCallback(async (isRefresh) => {
    if (!isRefresh) setStatus('loading');
    try {
      const [q, m, d] = await Promise.all([
        api.get('/moderation/queue'),
        api.get('/moderation/metrics'),
        api.get('/moderation/duplicates'),
      ]);
      setQueue(q.data.queue || []);
      setAppeals(q.data.appeals || []);
      setMetrics(m.data);
      setDupes(d.data.groups || []);
      setStatus('success');
    } catch (err) {
      setStatus(err.response?.status === 403 ? 'forbidden' : 'error');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
    else setStatus('forbidden');
  }, [isAdmin, load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  /* POST /moderation/:id/label — human review is ground truth. */
  const label = async (id, value) => {
    setBusy(`${id}:${value}`);
    try {
      await api.post(`/moderation/${id}/label`, { label: value });
      flash(`Labelled ${value}.`);
      await load(true);
    } catch (err) {
      flash(getErrorMessage(err, 'Could not apply label.'), 'error');
    } finally {
      setBusy('');
    }
  };

  /* POST /moderation/appeal/:ticket/resolve */
  const resolveAppeal = async (ticket, decision) => {
    setBusy(`appeal:${ticket}:${decision}`);
    try {
      await api.post(`/moderation/appeal/${ticket}/resolve`, { decision });
      flash(`Appeal ${decision}.`);
      await load(true);
    } catch (err) {
      flash(getErrorMessage(err, 'Could not resolve appeal.'), 'error');
    } finally {
      setBusy('');
    }
  };

  /* POST /moderation/merge */
  const merge = async (keepId, dropId) => {
    setBusy(`merge:${dropId}`);
    try {
      await api.post('/moderation/merge', { keepId, dropId });
      flash('Merged.');
      await load(true);
    } catch (err) {
      flash(getErrorMessage(err, 'Could not merge.'), 'error');
    } finally {
      setBusy('');
    }
  };

  const Header = () => (
    <Pressable style={styles.back} onPress={() => navigation.goBack()}>
      <Ionicons name="chevron-back" size={22} color={colors.text} />
      <Text variant="body" style={{ fontFamily: font.bodySemi }}>Back</Text>
    </Pressable>
  );

  /* ---- Admins only ---- */
  if (status === 'forbidden') {
    return (
      <GlowBackground>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <Header />
          <View style={styles.center}>
            <View style={styles.lockTile}>
              <Ionicons name="lock-closed-outline" size={34} color={colors.textMuted} />
            </View>
            <Text variant="h2" style={{ marginTop: 18 }}>Not authorized</Text>
            <Text variant="muted" style={{ marginTop: 8, textAlign: 'center', lineHeight: 21 }}>
              The moderation console is restricted to trust &amp; safety admins.
            </Text>
          </View>
        </SafeAreaView>
      </GlowBackground>
    );
  }

  return (
    <GlowBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <Header />

        {status === 'loading' ? (
          <Loader label="Loading console…" />
        ) : status === 'error' ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.error} />
            <Text variant="h3" style={{ marginTop: 12 }}>Could not load the console</Text>
            <Text variant="muted" style={{ marginTop: 6, textAlign: 'center' }}>
              Something went wrong reaching the moderation service.
            </Text>
            <Pressable style={styles.retry} onPress={() => load()}>
              <Ionicons name="refresh" size={16} color={colors.primary} />
              <Text variant="label" color={colors.primary}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48, gap: 22 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            }
          >
            {/* Intro */}
            <View>
              <Text variant="h1">Trust &amp; safety</Text>
              <Text variant="muted" style={{ marginTop: 8, lineHeight: 21 }}>
                Review reported and low-trust profiles, resolve duplicates, and track fraud-model accuracy.
              </Text>
            </View>

            {notice ? (
              <View
                style={[
                  styles.notice,
                  notice.tone === 'error' && styles.noticeError,
                ]}
              >
                <Ionicons
                  name={notice.tone === 'error' ? 'alert-circle' : 'checkmark-circle'}
                  size={16}
                  color={notice.tone === 'error' ? colors.error : colors.accent}
                />
                <Text variant="label" color={notice.tone === 'error' ? colors.error : colors.accent}>
                  {notice.msg}
                </Text>
              </View>
            ) : null}

            {/* Metrics */}
            <Card>
              <SectionTitle title="Fraud-model accuracy" icon="bar-chart-outline" />
              {metrics?.sampleSize > 0 ? (
                <View style={styles.pillWrap}>
                  <Badge label={`sample: ${metrics.sampleSize}`} tone="default" />
                  <Badge label={`precision: ${pct(metrics.precision)}`} tone="default" />
                  <Badge label={`recall: ${pct(metrics.recall)}`} tone="default" />
                  {metrics.confusion ? (
                    <Badge
                      label={`TP ${metrics.confusion.tp} · FP ${metrics.confusion.fp} · FN ${metrics.confusion.fn} · TN ${metrics.confusion.tn}`}
                      tone="default"
                    />
                  ) : null}
                </View>
              ) : (
                <Text variant="muted">{metrics?.note || 'No labelled sample yet.'}</Text>
              )}
              <Text variant="muted" style={{ marginTop: 10, fontSize: 12 }}>
                Measured on the real human-labelled sample — not a synthetic benchmark.
              </Text>
            </Card>

            {/* Queue */}
            <View>
              <SectionTitle title="Review queue" icon="shield-outline" />
              {queue.length === 0 ? (
                <Card>
                  <Text variant="muted">Nothing to review — the queue is clear.</Text>
                </Card>
              ) : (
                <View style={{ gap: 12 }}>
                  {queue.map((p, i) => (
                    <Card key={p.id} index={i}>
                      <View style={styles.rowBetween}>
                        <Text style={{ fontFamily: font.bodySemi, flex: 1, marginRight: 8 }} numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Badge label={p.reviewState} tone={stateTone(p.reviewState)} />
                      </View>
                      <View style={[styles.pillWrap, { marginTop: 10 }]}>
                        <Badge label={`reports: ${p.reportCount}`} tone="default" />
                        <Badge label={`fraud: ${Math.round((p.fraudScore || 0) * 100)}%`} tone="default" />
                        <Badge label={`trust: ${p.trustScore}`} tone="default" />
                        {p.claimed ? <Badge label="claimed" tone="default" /> : null}
                      </View>
                      <Divider style={{ marginVertical: 12 }} />
                      <View style={styles.actionRow}>
                        <ActionButton
                          icon="flag-outline"
                          label="Fraud"
                          color={colors.error}
                          loading={busy === `${p.id}:fraud`}
                          disabled={!!busy}
                          onPress={() => label(p.id, 'fraud')}
                        />
                        <ActionButton
                          icon="shield-checkmark-outline"
                          label="Legit"
                          color={colors.accent}
                          loading={busy === `${p.id}:legit`}
                          disabled={!!busy}
                          onPress={() => label(p.id, 'legit')}
                        />
                        <ActionButton
                          icon="shield-half-outline"
                          label="Contested"
                          color={colors.text}
                          loading={busy === `${p.id}:contested`}
                          disabled={!!busy}
                          onPress={() => label(p.id, 'contested')}
                        />
                      </View>
                    </Card>
                  ))}
                </View>
              )}
            </View>

            {/* Appeals */}
            {appeals.length > 0 && (
              <View>
                <SectionTitle title="Trust appeals" icon="megaphone-outline" />
                <View style={{ gap: 12 }}>
                  {appeals.map((a, i) => (
                    <Card key={a.ticket} index={i}>
                      <View style={styles.rowBetween}>
                        <Badge label={a.ticket} tone="primary" />
                        <Badge label={a.status} tone="default" />
                      </View>
                      {a.message ? (
                        <Text variant="muted" style={{ marginTop: 10, lineHeight: 20, fontStyle: 'italic' }}>
                          “{a.message}”
                        </Text>
                      ) : null}
                      <Divider style={{ marginVertical: 12 }} />
                      <View style={styles.actionRow}>
                        <ActionButton
                          icon="shield-checkmark-outline"
                          label="Uphold (restore)"
                          color={colors.accent}
                          loading={busy === `appeal:${a.ticket}:upheld`}
                          disabled={!!busy}
                          onPress={() => resolveAppeal(a.ticket, 'upheld')}
                        />
                        <ActionButton
                          icon="close-circle-outline"
                          label="Reject"
                          color={colors.error}
                          loading={busy === `appeal:${a.ticket}:rejected`}
                          disabled={!!busy}
                          onPress={() => resolveAppeal(a.ticket, 'rejected')}
                        />
                      </View>
                    </Card>
                  ))}
                </View>
              </View>
            )}

            {/* Duplicates */}
            <View>
              <SectionTitle title="Duplicate groups" icon="copy-outline" />
              {dupes.length === 0 ? (
                <Card>
                  <Text variant="muted">No duplicates detected.</Text>
                </Card>
              ) : (
                <View style={{ gap: 12 }}>
                  {dupes.map((g, i) => {
                    const keep = [...g.profiles].sort((a, b) => b.trust - a.trust)[0];
                    return (
                      <Card key={g.key} index={i}>
                        <Text variant="muted" style={{ fontSize: 12 }}>
                          Keeping highest-trust:{' '}
                          <Text color={colors.text} style={{ fontFamily: font.bodySemi, fontSize: 12 }}>
                            {keep?.name}
                          </Text>
                        </Text>
                        <View style={{ gap: 8, marginTop: 10 }}>
                          {g.profiles.map((p) => {
                            const isKeep = p.id === keep?.id;
                            return (
                              <View key={p.id} style={styles.dupeRow}>
                                <View style={{ flex: 1, marginRight: 8 }}>
                                  <Text style={{ fontFamily: font.bodySemi }} numberOfLines={1}>
                                    {p.name}
                                  </Text>
                                  <Text variant="muted" style={{ fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                                    {p.city} · trust {p.trust}
                                  </Text>
                                </View>
                                {isKeep ? (
                                  <Badge label="keep" tone="accent" />
                                ) : (
                                  <ActionButton
                                    icon="git-merge-outline"
                                    label="Merge"
                                    color={colors.text}
                                    compact
                                    loading={busy === `merge:${p.id}`}
                                    disabled={!!busy}
                                    onPress={() => merge(keep.id, p.id)}
                                  />
                                )}
                              </View>
                            );
                          })}
                        </View>
                      </Card>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </GlowBackground>
  );
}

/* Small colored ghost action button — mirrors the web page's btn-ghost pills. */
function ActionButton({ icon, label, color, onPress, disabled, loading, compact }) {
  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      style={({ pressed }) => [
        styles.actionBtn,
        compact && styles.actionBtnCompact,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Ionicons name={icon} size={15} color={color} />
      )}
      <Text variant="label" color={color}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: spacing.lg, paddingVertical: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  lockTile: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,212,170,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(0,212,170,0.30)',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeError: {
    backgroundColor: 'rgba(255,83,112,0.10)',
    borderColor: 'rgba(255,83,112,0.30)',
  },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  actionBtnCompact: { paddingHorizontal: 11, paddingVertical: 7 },
  dupeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: 10,
  },
});
