import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import GlowBackground from '../components/GlowBackground';
import { Text, Button } from '../components/ui';
import { colors, radius, spacing } from '../theme/colors';
import { API_BASE } from '../api/client';
import { useAuthStore } from '../store/authStore';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

// Ionicons + tint that mirror the web page's phase icons (Server → Layout → Code → Check).
const phaseIcon = (progress) => {
  if (progress >= 100) return { name: 'checkmark-circle', tint: colors.accent };
  if (progress > 50) return { name: 'code-slash', tint: colors.primary };
  if (progress > 10) return { name: 'browsers-outline', tint: colors.accent };
  return { name: 'server-outline', tint: colors.primary };
};

export default function GeneratorProgressScreen({ route, navigation }) {
  const { placeId, name, survey } = route.params || {};

  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Initializing AI Core…');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const [barWidth, setBarWidth] = useState(0);

  // Stable start time for the elapsed clock.
  const [startTime] = useState(() => Date.now());

  // Guards: startedRef fires generation exactly once; activeRef blocks any
  // setState / navigation after unmount so a racing stream can't touch a dead
  // component. Mirrors the web page's run-once + active-gate pattern.
  const startedRef = useRef(false);
  const activeRef = useRef(true);
  const xhrRef = useRef(null);

  // Elapsed mm:ss timer — ticks every second, cleaned up on unmount.
  useEffect(() => {
    const timer = setInterval(() => {
      if (activeRef.current) setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  useEffect(() => {
    activeRef.current = true;

    if (!survey) {
      setError('Missing survey data. Please start generation from the business profile.');
      return () => { activeRef.current = false; };
    }

    if (startedRef.current) {
      return () => { activeRef.current = false; };
    }
    startedRef.current = true;

    const fail = (msg) => { if (activeRef.current) setError(msg); };

    // Parse the cumulative SSE buffer. `xhr.responseText` grows on every
    // onprogress, so we track how many complete "\n\n"-delimited events we've
    // already consumed and only handle new ones.
    let consumed = 0;
    let finished = false;
    const processBuffer = (text, isFinal) => {
      const parts = text.split('\n\n');
      const end = isFinal ? parts.length : parts.length - 1; // last part may be partial
      for (let i = consumed; i < end; i += 1) {
        const part = parts[i];
        if (!part) continue;
        for (const line of part.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          let data;
          try {
            data = JSON.parse(trimmed.slice(trimmed.indexOf('data:') + 5).trim());
          } catch {
            continue; // ignore incomplete / non-JSON keepalive lines
          }
          if (!activeRef.current) return;

          if (data.error) { setError(data.error); finished = true; return; }
          if (data.progress !== undefined) setProgress((p) => Math.max(p, data.progress));
          if (data.message) setStatus(data.message);

          if (data.status === 'Done') {
            finished = true;
            setProgress(100);
            setStatus('Website Generation Complete!');
            setTimeout(() => {
              if (activeRef.current) navigation.replace('GeneratedWebsite', { placeId, name });
            }, 1000);
            return;
          }
        }
      }
      consumed = end;
    };

    try {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open('POST', `${API_BASE}/website/${placeId}/generate?stream=true`);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', `Bearer ${useAuthStore.getState().token}`);

      xhr.onreadystatechange = () => {
        if (xhr.readyState === 2) {
          // Headers received — surface non-streaming HTTP failures early.
          if (xhr.status === 403) fail('AI Quota Exceeded. Please upgrade your plan.');
          else if (xhr.status === 409) fail('A website is already being generated for this business. Please wait for it to finish, then refresh.');
          else if (xhr.status >= 400) fail('Failed to connect to AI generation server.');
        }
      };

      xhr.onprogress = () => {
        if (!activeRef.current || finished) return;
        if (xhr.status >= 400) return;
        processBuffer(xhr.responseText, false);
      };

      xhr.onload = () => {
        if (!activeRef.current || finished) return;
        if (xhr.status >= 400) return;
        processBuffer(xhr.responseText, true);
      };

      xhr.onerror = () => {
        if (!activeRef.current || finished) return;
        fail('Failed to connect to AI generation server.');
      };

      xhr.onabort = () => {}; // intentional unmount abort — no error

      xhr.send(JSON.stringify({ survey }));
    } catch (e) {
      fail('Failed to connect to AI generation server.');
    }

    return () => {
      activeRef.current = false;
      try { xhrRef.current?.abort(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId, name]);

  /* ----------------------------- Error state ----------------------------- */
  if (error) {
    return (
      <GlowBackground>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={styles.center}>
            <MotiView
              from={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'timing', duration: 360 }}
              style={styles.errIcon}
            >
              <Ionicons name="flash" size={30} color={colors.error} />
            </MotiView>
            <Text variant="h2" style={{ marginTop: 20, textAlign: 'center' }}>Generation Failed</Text>
            <Text variant="muted" style={{ marginTop: 8, textAlign: 'center', lineHeight: 21 }}>{error}</Text>
            <Button
              title="Return to Profile"
              icon={<Ionicons name="arrow-back" size={16} color={colors.white} />}
              style={{ marginTop: 28, alignSelf: 'stretch' }}
              onPress={() => navigation.goBack()}
            />
          </View>
        </SafeAreaView>
      </GlowBackground>
    );
  }

  /* --------------------------- Progress state ---------------------------- */
  const icon = phaseIcon(progress);
  const fillWidth = barWidth > 0 ? (barWidth * Math.min(progress, 100)) / 100 : 0;

  return (
    <GlowBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.center}>
          {/* Pulsing AI core */}
          <View style={styles.coreWrap}>
            {/* Soft glow halo */}
            <MotiView
              from={{ opacity: 0.35, scale: 0.9 }}
              animate={{ opacity: 0.7, scale: 1.1 }}
              transition={{ type: 'timing', duration: 1800, loop: true, repeatReverse: true }}
              style={styles.halo}
            />
            {/* Outer spinning ring */}
            <MotiView
              from={{ rotate: '0deg' }}
              animate={{ rotate: '360deg' }}
              transition={{ type: 'timing', duration: 9000, loop: true, repeatReverse: false }}
              style={[styles.ring, styles.ringOuter]}
            />
            {/* Inner reverse-spinning ring */}
            <MotiView
              from={{ rotate: '0deg' }}
              animate={{ rotate: '-360deg' }}
              transition={{ type: 'timing', duration: 7000, loop: true, repeatReverse: false }}
              style={[styles.ring, styles.ringInner]}
            />
            {/* Core disc + phase icon */}
            <View style={styles.coreDisc}>
              <MotiView
                key={icon.name}
                from={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'timing', duration: 300 }}
              >
                <Ionicons name={icon.name} size={38} color={icon.tint} />
              </MotiView>
            </View>
          </View>

          <Text variant="h1" style={{ marginTop: 40, textAlign: 'center' }}>Building Your Website</Text>

          {/* Percent | elapsed clock */}
          <View style={styles.clockRow}>
            <Text style={[styles.mono, { color: colors.primary }]}>{Math.round(progress)}%</Text>
            <View style={styles.clockDivider} />
            <Text style={[styles.mono, { color: colors.text }]}>{formatTime(elapsed)}</Text>
          </View>

          {/* Live status message */}
          <View style={styles.statusWrap}>
            <MotiView
              key={status}
              from={{ opacity: 0, translateY: 6 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 320 }}
            >
              <Text variant="body" color={colors.textMuted} style={{ fontSize: 16, textAlign: 'center' }}>
                {status}
              </Text>
            </MotiView>
          </View>

          {/* Gradient progress bar */}
          <View
            style={styles.barTrack}
            onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
          >
            <MotiView
              animate={{ width: fillWidth }}
              transition={{ type: 'timing', duration: 500 }}
              style={styles.barClip}
            >
              {barWidth > 0 ? (
                <LinearGradient
                  colors={[colors.primary, colors.accent]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ width: barWidth, height: '100%' }}
                />
              ) : null}
            </MotiView>
          </View>

          <Text variant="muted" style={styles.hint}>
            Our AI is designing sections, writing copy and coding your page. This can take a couple of minutes.
          </Text>
        </View>
      </SafeAreaView>
    </GlowBackground>
  );
}

const CORE = 132;
const DISC = 84;

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },

  /* Error */
  errIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,83,112,0.10)',
    borderWidth: 1, borderColor: 'rgba(255,83,112,0.30)',
    alignItems: 'center', justifyContent: 'center',
  },

  /* Core */
  coreWrap: { width: CORE, height: CORE, alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: CORE, height: CORE, borderRadius: CORE / 2,
    backgroundColor: colors.primaryGlow,
  },
  ring: { position: 'absolute', borderRadius: CORE / 2, borderWidth: 1 },
  ringOuter: {
    width: CORE - 8, height: CORE - 8,
    borderColor: 'rgba(108,99,255,0.50)',
    borderTopColor: colors.primary,
  },
  ringInner: {
    width: CORE - 26, height: CORE - 26,
    borderColor: 'rgba(0,212,170,0.28)',
    borderBottomColor: colors.accent,
  },
  coreDisc: {
    width: DISC, height: DISC, borderRadius: DISC / 2,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },

  /* Clock */
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 18 },
  clockDivider: { width: 1, height: 22, backgroundColor: colors.border },
  mono: {
    fontFamily: MONO,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 2,
  },

  /* Status */
  statusWrap: { minHeight: 44, marginTop: 16, marginBottom: 24, justifyContent: 'center', width: '100%' },

  /* Bar */
  barTrack: {
    width: '100%',
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  barClip: { height: '100%', borderRadius: radius.pill, overflow: 'hidden' },

  hint: {
    marginTop: 22,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: spacing.md,
  },
});
