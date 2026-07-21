import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, Share } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Loader } from '../components/ui';
import { colors, spacing, font } from '../theme/colors';
import api, { getErrorMessage, API_BASE } from '../api/client';

// Point any localhost/stale photo-proxy URL at THIS app's configured backend so
// images always load (mirrors the web viewer's fixPhotoUrls).
const fixPhotoUrls = (html) => {
  if (!html) return html;
  const origin = API_BASE.replace(/\/api\/?$/, '');
  return html.replace(/https?:\/\/[^/"'\s)]+\/api\/business\/photo/g, `${origin}/api/business/photo`);
};

export default function GeneratedWebsiteScreen({ route, navigation }) {
  const { placeId, name } = route.params;
  const [html, setHtml] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/website/${placeId}`);
        if (data?.pages?.html) setHtml(fixPhotoUrls(data.pages.html));
        else setError('No generated website found.');
      } catch (err) {
        setError(getErrorMessage(err, 'Could not load the website.'));
      }
    })();
  }, [placeId]);

  const onShare = () => {
    Share.share({ message: `Check out ${name || 'this business'} on Localify.` }).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.bar}>
        <Pressable style={styles.barBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
          <Text style={{ fontFamily: font.bodySemi, color: colors.text }}>Back</Text>
        </Pressable>
        <Text numberOfLines={1} style={styles.barTitle}>{name || 'Preview'}</Text>
        <Pressable style={styles.barBtn} onPress={onShare}>
          <Ionicons name="share-outline" size={20} color={colors.text} />
        </Pressable>
      </View>

      {error ? (
        <View style={styles.center}><Text variant="muted">{error}</Text></View>
      ) : html ? (
        <WebView
          originWhitelist={['*']}
          source={{ html }}
          style={{ flex: 1, backgroundColor: colors.bg }}
          startInLoadingState
          renderLoading={() => <View style={styles.center}><Loader label="Rendering website…" /></View>}
          javaScriptEnabled
          domStorageEnabled
        />
      ) : (
        <View style={styles.center}><Loader label="Loading website…" /></View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  bar: {
    height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  barBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 60 },
  barTitle: { flex: 1, textAlign: 'center', color: colors.text, fontFamily: font.displaySemi, fontSize: 15 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
