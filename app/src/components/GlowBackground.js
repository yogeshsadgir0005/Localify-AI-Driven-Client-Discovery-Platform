import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';

/**
 * The app-wide animated backdrop — matches the website's drifting aurora glows.
 * Two large, soft, slowly-floating gradient blobs over the dark base, plus a
 * center vignette so content stays readable.
 */
const Blob = ({ start, colorA, delay = 0, size = 420, translate = 26 }) => (
  <MotiView
    from={{ translateY: 0, translateX: 0, opacity: 0.55 }}
    animate={{ translateY: translate, translateX: translate / 2, opacity: 0.8 }}
    transition={{ type: 'timing', duration: 6000, loop: true, repeatReverse: true, delay }}
    style={[styles.blobWrap, start]}
    pointerEvents="none"
  >
    <LinearGradient
      colors={[colorA, 'transparent']}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      start={{ x: 0.5, y: 0.5 }}
      end={{ x: 1, y: 1 }}
    />
  </MotiView>
);

export default function GlowBackground({ children, variant = 'primary' }) {
  return (
    <View style={styles.root}>
      <Blob start={{ top: -120, left: -100 }} colorA={colors.primaryGlow} size={460} />
      <Blob start={{ bottom: -140, right: -120 }} colorA={colors.accentGlow} size={420} delay={1200} translate={-24} />
      {variant === 'auth' && (
        <Blob start={{ top: '35%', left: '30%' }} colorA={colors.primaryGlow} size={360} delay={600} />
      )}
      <View style={styles.vignette} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  blobWrap: { position: 'absolute' },
  vignette: { ...StyleSheet.absoluteFillObject },
});
