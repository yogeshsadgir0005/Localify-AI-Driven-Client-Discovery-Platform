import React, { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, Image, StyleSheet, Pressable, Linking, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as Clipboard from 'expo-clipboard';
import GlowBackground from '../components/GlowBackground';
import { Text, Button, Card, Badge, Loader, IconTile, SectionTitle, Divider } from '../components/ui';
import { colors, radius, spacing, font } from '../theme/colors';
import api, { getErrorMessage } from '../api/client';
import { photoUrl, categoryOf } from '../utils/helpers';
import { getSurveyQuestions } from '../utils/survey';
import { useAuthStore } from '../store/authStore';

const waNumber = (b) => {
  const d = String(b?.phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10) return `91${d}`;
  return d;
};
const isMasked = (p) => /[•*xX]{2,}/.test(String(p || ''));

export default function BusinessDetailScreen({ route, navigation }) {
  const { placeId } = route.params;
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const plan = user?.plan || 'free';
  const isAdmin = (user?.roles || []).includes('admin');
  const isFreePlan = plan === 'free';
  // AI insight features (summary/insights/outreach) are Pro/Max only.
  const canAI = isAdmin || plan === 'pro' || plan === 'max';
  // Website generation runs on weekly quota (free=0) or bought credits.
  const genLimit = plan === 'max' ? 9 : plan === 'pro' ? 3 : 0;
  const canGenerate = isAdmin || genLimit > 0 || (user?.aiQuota?.extraCredits > 0);

  const [business, setBusiness] = useState(null);
  const [hasWebsite, setHasWebsite] = useState(false);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [surveyOpen, setSurveyOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  // AI features
  const [summary, setSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [drafts, setDrafts] = useState(null);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [lang, setLang] = useState('english');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const { data } = await api.get(`/business/${placeId}`);
      setBusiness(data.business || data);
      try {
        const w = await api.get(`/website/${placeId}`);
        setHasWebsite(Boolean(w.data?.pages?.html));
      } catch { setHasWebsite(false); }
      setStatus('success');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load this business.'));
      setStatus('error');
    }
  }, [placeId]);

  useEffect(() => { load(); }, [load]);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 2200); };
  const handleAiError = (err, fallback) => {
    if (err.response?.status === 403) { flash('AI features need a Pro plan.'); navigation.navigate('Subscriptions'); }
    else flash(getErrorMessage(err, fallback));
  };

  const openMaps = () => {
    const q = encodeURIComponent(business?.address || business?.name || '');
    Linking.openURL(`https://maps.google.com/?q=${q}`);
  };

  const revealContact = async () => {
    try {
      const { data } = await api.post('/auth/unhide-phone', { placeId });
      if (data.success) {
        flash(`Contact unhidden! ${data.remaining ?? ''} left this week.`);
        if (data.user) setUser(data.user);
        await load();
      }
    } catch (err) {
      if (err.response?.status === 403) {
        flash('Upgrade to Pro to view more contacts.');
        navigation.navigate('Subscriptions');
      } else {
        flash(getErrorMessage(err, 'Could not unhide contact.'));
      }
    }
  };

  const call = () => {
    if (isFreePlan && isMasked(business?.phone)) return revealContact();
    if (business?.phone) Linking.openURL(`tel:${business.phone}`);
  };

  const sendWhatsApp = (text) => {
    const n = waNumber(business);
    if (!n) return flash('No phone number available.');
    Linking.openURL(`https://wa.me/${n}?text=${encodeURIComponent(text)}`);
  };

  const genSummary = async () => {
    setSummaryLoading(true);
    try {
      const { data } = await api.post(`/summary/${placeId}`);
      setSummary(data.summary || data.message || 'AI summary unavailable.');
    } catch (err) { handleAiError(err, 'Could not generate summary.'); }
    finally { setSummaryLoading(false); }
  };

  const genInsights = async () => {
    setInsightsLoading(true);
    try {
      const { data } = await api.post(`/summary/${placeId}/reviews`);
      setInsights(data);
    } catch (err) { handleAiError(err, 'Could not analyze reviews.'); }
    finally { setInsightsLoading(false); }
  };

  const genOutreach = async () => {
    setOutreachLoading(true);
    try {
      const { data } = await api.post(`/summary/${placeId}/outreach`);
      setDrafts(data.messages || null);
    } catch (err) { handleAiError(err, 'Could not draft a message.'); }
    finally { setOutreachLoading(false); }
  };

  const copyDraft = async () => {
    if (!drafts?.[lang]) return;
    await Clipboard.setStringAsync(drafts[lang]);
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  const runGeneration = (answers) => {
    setSurveyOpen(false);
    // Hand off to the streamed progress screen (live % + status), matching the website.
    navigation.navigate('GeneratorProgress', { placeId, name: business?.name, survey: answers });
  };

  if (status === 'loading') {
    return <GlowBackground><SafeAreaView style={{ flex: 1 }}><Loader label="Loading business…" /></SafeAreaView></GlowBackground>;
  }
  if (status === 'error') {
    return (
      <GlowBackground><SafeAreaView style={{ flex: 1 }}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.error} />
          <Text variant="h3" style={{ marginTop: 12 }}>Something went wrong</Text>
          <Text variant="muted" style={{ marginTop: 6, textAlign: 'center' }}>{error}</Text>
          <Button title="Go back" style={{ marginTop: 18 }} onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView></GlowBackground>
    );
  }

  const photos = business?.photos || [];
  const reviews = business?.reviews || [];
  const hours = Array.isArray(business?.openingHours) ? business.openingHours : [];
  const mapQuery = business?.location ? `${business.location.lat},${business.location.lng}` : `${business?.name} ${business?.address}`;
  const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`;
  const heroUri = photoUrl(photos[0]?.ref, 800);
  const masked = isFreePlan && isMasked(business?.phone);

  return (
    <GlowBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <Pressable style={styles.back} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
          <Text variant="body" style={{ fontFamily: font.bodySemi }}>Back</Text>
        </Pressable>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48, gap: 18 }}>
          {/* Hero */}
          <View>
            {heroUri ? (
              <Image source={{ uri: heroUri }} style={styles.hero} resizeMode="cover" />
            ) : (
              <View style={styles.heroFallback}><IconTile icon="storefront-outline" size={72} round={radius.lg} /></View>
            )}
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              <Badge label={categoryOf(business)} tone="primary" />
              {!business?.website && <Badge label="No website" tone="accent" />}
              {business?.rating && business.rating !== 'N/A' && (
                <Badge label={`★ ${business.rating}${business.reviewCount ? ` (${business.reviewCount})` : ''}`} tone="default" />
              )}
            </View>
            <Text variant="h1" style={{ marginTop: 10 }}>{business?.name}</Text>
            {business?.address ? <Text variant="muted" style={{ marginTop: 4 }}>{business.address}</Text> : null}
          </View>

          {notice ? <View style={styles.notice}><Text variant="label" color={colors.accent}>{notice}</Text></View> : null}

          {/* Contact */}
          <Card>
            <SectionTitle title="Contact" icon="call-outline" />
            {business?.phone ? (
              <Pressable onPress={call} style={styles.contactRow}>
                <Ionicons name="call" size={18} color={colors.primary} />
                <Text style={{ fontFamily: font.bodySemi, flex: 1 }}>{business.phone}</Text>
                {masked ? <Badge label="Tap to reveal" tone="accent" /> : <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
              </Pressable>
            ) : (
              <Text variant="muted">Phone not listed.</Text>
            )}
            <Divider style={{ marginVertical: 12 }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Directions" variant="outline" style={{ flex: 1 }} icon={<Ionicons name="navigate" size={16} color={colors.text} />} onPress={openMaps} />
              {business?.phone && !masked && (
                <Button title="WhatsApp" variant="outline" style={{ flex: 1 }} icon={<Ionicons name="logo-whatsapp" size={16} color={colors.accent} />} onPress={() => sendWhatsApp(`Hi, I found ${business?.name} on Localify.`)} />
              )}
            </View>
            {business?.website && (
              <Button title="Visit their website" variant="ghost" style={{ marginTop: 8 }} onPress={() => Linking.openURL(business.website)} />
            )}
          </Card>

          {/* Opening hours */}
          {hours.length > 0 && (
            <Card>
              <SectionTitle title="Opening hours" icon="time-outline" />
              <View style={{ gap: 6 }}>
                {hours.map((h, i) => <Text key={i} variant="muted" style={{ fontSize: 13 }}>{h}</Text>)}
              </View>
            </Card>
          )}

          {/* AI Website */}
          <Card>
            <SectionTitle title="AI Website" icon="sparkles" />
            <Text variant="muted">
              {hasWebsite ? 'A generated prototype exists for this business.' : 'Generate a modern one-page site from this business’s photos & reviews.'}
            </Text>
            <View style={{ marginTop: 14, gap: 10 }}>
              {hasWebsite && (
                <Button title="View Generated Website" icon={<Ionicons name="eye" size={17} color={colors.white} />}
                  onPress={() => navigation.navigate('GeneratedWebsite', { placeId, name: business?.name })} />
              )}
              {canGenerate ? (
                <Button title={hasWebsite ? 'Regenerate' : 'Generate Website'} variant={hasWebsite ? 'outline' : 'primary'} onPress={() => setSurveyOpen(true)} />
              ) : (
                <UpgradePrompt navigation={navigation} label={hasWebsite ? 'Regenerating needs credits or a plan.' : 'Website generation is a paid feature.'} />
              )}
            </View>
          </Card>

          {/* AI Summary */}
          <Card>
            <SectionTitle title="AI Summary" icon="document-text-outline" action={canAI && summary ? 'Refresh' : undefined} onAction={genSummary} />
            {!canAI ? (
              <UpgradePrompt navigation={navigation} label="AI summary is a Pro feature." />
            ) : summaryLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />
            ) : summary ? (
              <Text variant="body" style={{ lineHeight: 22, color: colors.text }}>{summary}</Text>
            ) : (
              <Button title="Generate AI summary" variant="outline" icon={<Ionicons name="sparkles-outline" size={16} color={colors.text} />} onPress={genSummary} />
            )}
          </Card>

          {/* Review insights */}
          <Card>
            <SectionTitle title="Review insights" icon="analytics-outline" action={canAI && insights ? 'Refresh' : undefined} onAction={genInsights} />
            {!canAI ? (
              <UpgradePrompt navigation={navigation} label="Review insights are a Pro feature." />
            ) : insightsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />
            ) : insights ? (
              <View style={{ gap: 12 }}>
                {insights.summary ? <Text variant="muted" style={{ lineHeight: 20 }}>{insights.summary}</Text> : null}
                <View style={{ gap: 8 }}>
                  {(insights.aspects || []).map((a) => (
                    <View key={a.key || a.label} style={styles.aspectRow}>
                      <Text variant="body" style={{ flex: 1 }}>{a.label}</Text>
                      <Sentiment value={a.sentiment} />
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <Button title="Analyze reviews" variant="outline" icon={<Ionicons name="analytics-outline" size={16} color={colors.text} />} onPress={genInsights} />
            )}
          </Card>

          {/* Outreach */}
          <Card>
            <SectionTitle title="Outreach message" icon="chatbubbles-outline" action={canAI && drafts ? 'Regenerate' : undefined} onAction={genOutreach} />
            {!canAI ? (
              <UpgradePrompt navigation={navigation} label="Outreach drafts are a Pro feature." />
            ) : outreachLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />
            ) : drafts ? (
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {['english', 'marathi', 'manglish'].map((l) => (
                    <Pressable key={l} onPress={() => setLang(l)} style={[styles.langTab, lang === l && styles.langTabActive]}>
                      <Text variant="label" color={lang === l ? colors.white : colors.textMuted} style={{ textTransform: 'capitalize' }}>{l}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.draftBox}><Text variant="muted" style={{ lineHeight: 21 }}>{drafts[lang]}</Text></View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button title={copied ? 'Copied!' : 'Copy'} variant="outline" style={{ flex: 1 }} icon={<Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={colors.text} />} onPress={copyDraft} />
                  <Button title="Send on WhatsApp" style={{ flex: 1.4 }} icon={<Ionicons name="logo-whatsapp" size={16} color={colors.white} />} onPress={() => sendWhatsApp(drafts[lang])} />
                </View>
              </View>
            ) : (
              <>
                <Text variant="muted" style={{ marginBottom: 12 }}>Draft a personalised message to pitch this business, in English, Marathi or Manglish.</Text>
                <Button title="Draft an outreach message" variant="outline" icon={<Ionicons name="create-outline" size={16} color={colors.text} />} onPress={genOutreach} />
              </>
            )}
          </Card>

          {/* Map — embedded inside an iframe (Google's embed requires it) */}
          <View>
            <SectionTitle title="Location" icon="location-outline" action="Open in Maps" onAction={openMaps} />
            <View style={styles.mapWrap}>
              <WebView
                originWhitelist={['*']}
                source={{ html: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>html,body{margin:0;padding:0;height:100%;background:#161A23;overflow:hidden}iframe{border:0;width:100%;height:100%}</style></head><body><iframe src="${mapSrc}" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></body></html>` }}
                style={{ flex: 1, backgroundColor: colors.surface2 }}
                scrollEnabled={false}
              />
            </View>
          </View>

          {/* Photos */}
          {photos.length > 0 && (
            <View>
              <SectionTitle title="Photos" icon="images-outline" />
              <View style={styles.photoGrid}>
                {photos.slice(0, 6).map((p, i) => (
                  <Image key={i} source={{ uri: photoUrl(p.ref, 400) }} style={styles.photo} resizeMode="cover" />
                ))}
              </View>
            </View>
          )}

          {/* Reviews */}
          {reviews.length > 0 && (
            <View>
              <SectionTitle title={`Reviews (${reviews.length})`} icon="star-outline" />
              <View style={{ gap: 10 }}>
                {reviews.slice(0, 6).map((r, i) => (
                  <Card key={i} index={i}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontFamily: font.bodySemi }}>{r.authorName || 'Customer'}</Text>
                      <Text color="#FBBF24" style={{ fontSize: 13 }}>{'★'.repeat(Math.round(r.rating || 5))}{'☆'.repeat(5 - Math.round(r.rating || 5))}</Text>
                    </View>
                    <Text variant="muted" style={{ marginTop: 6, lineHeight: 20 }}>{r.text}</Text>
                  </Card>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        <SurveyModal visible={surveyOpen} onClose={() => setSurveyOpen(false)} onDone={runGeneration} />

        <Modal visible={generating} transparent animationType="fade">
          <View style={styles.genOverlay}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text variant="h3" style={{ marginTop: 16 }}>Building your website…</Text>
            <Text variant="muted" style={{ marginTop: 6, textAlign: 'center', paddingHorizontal: 40 }}>
              Our AI is designing sections, writing copy and coding the page. This can take a couple of minutes.
            </Text>
          </View>
        </Modal>
      </SafeAreaView>
    </GlowBackground>
  );
}

function UpgradePrompt({ navigation, label }) {
  return (
    <View style={styles.upsell}>
      <Ionicons name="sparkles" size={15} color={colors.accent} />
      <Text variant="muted" style={{ flex: 1, fontSize: 13 }}>{label}</Text>
      <Pressable onPress={() => navigation.navigate('Subscriptions')} hitSlop={8} style={styles.upsellBtn}>
        <Text color={colors.accent} style={{ fontFamily: font.bodySemi, fontSize: 13 }}>Upgrade</Text>
        <Ionicons name="arrow-forward" size={13} color={colors.accent} />
      </Pressable>
    </View>
  );
}

function Sentiment({ value }) {
  const map = {
    positive: { c: colors.accent, i: 'happy-outline', t: 'Positive' },
    negative: { c: colors.error, i: 'sad-outline', t: 'Needs work' },
    neutral: { c: colors.textMuted, i: 'remove-outline', t: 'Neutral' },
    unknown: { c: colors.textMuted, i: 'help-outline', t: 'Unknown' },
  };
  const s = map[value] || map.unknown;
  return (
    <View style={[styles.sentiment, { borderColor: s.c }]}>
      <Ionicons name={s.i} size={13} color={s.c} />
      <Text variant="label" color={s.c}>{s.t}</Text>
    </View>
  );
}

/* ---- Inline sequential survey ---- */
function SurveyModal({ visible, onClose, onDone }) {
  const questions = getSurveyQuestions();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const q = questions[step];

  const pick = (opt) => {
    const next = { ...answers, [q.id]: opt };
    setAnswers(next);
    if (step < questions.length - 1) setStep(step + 1);
    else { onDone(next); setStep(0); setAnswers({}); }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text variant="label">Step {step + 1} of {questions.length}</Text>
            <Pressable onPress={onClose}><Ionicons name="close" size={22} color={colors.textMuted} /></Pressable>
          </View>
          <Text variant="h3" style={{ marginTop: 6 }}>{q?.title}</Text>
          <ScrollView style={{ marginTop: 14 }} contentContainerStyle={{ gap: 10, paddingBottom: 10 }}>
            {q?.options.map((opt) => (
              <Pressable key={opt} style={styles.opt} onPress={() => pick(opt)}>
                <Text variant="body">{opt}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {step > 0 && <Button title="Back" variant="ghost" onPress={() => setStep(step - 1)} />}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: spacing.lg, paddingVertical: 8 },
  hero: { width: '100%', height: 200, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  heroFallback: { width: '100%', height: 160, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  notice: { backgroundColor: 'rgba(0,212,170,0.10)', borderWidth: 1, borderColor: 'rgba(0,212,170,0.30)', borderRadius: radius.md, padding: 10 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  aspectRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sentiment: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  upsell: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,212,170,0.07)', borderWidth: 1, borderColor: 'rgba(0,212,170,0.25)', borderRadius: radius.md, padding: 12 },
  upsellBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  langTab: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  langTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  draftBox: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12 },
  mapWrap: { height: 200, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: '31.6%', aspectRatio: 1, borderRadius: radius.md, backgroundColor: colors.surface2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  genOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, maxHeight: '80%' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  opt: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14 },
});
