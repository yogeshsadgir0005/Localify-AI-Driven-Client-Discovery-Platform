import React from 'react';
import {
  Text as RNText,
  TextInput,
  Pressable,
  View,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { MotiView } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, font, spacing } from '../theme/colors';

/* ---------------- Text ---------------- */
export function Text({ style, variant = 'body', color, children, ...rest }) {
  const map = {
    h1: { fontFamily: font.display, fontSize: 30, color: colors.text },
    h2: { fontFamily: font.display, fontSize: 22, color: colors.text },
    h3: { fontFamily: font.displaySemi, fontSize: 18, color: colors.text },
    body: { fontFamily: font.body, fontSize: 15, color: colors.text },
    muted: { fontFamily: font.body, fontSize: 14, color: colors.textMuted },
    label: { fontFamily: font.bodySemi, fontSize: 13, color: colors.textMuted },
  };
  return (
    <RNText style={[map[variant], color && { color }, style]} {...rest}>
      {children}
    </RNText>
  );
}

/* ---------------- Button ---------------- */
export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, style }) {
  const isPrimary = variant === 'primary';
  const isOutline = variant === 'outline';
  const content = (
    <View style={styles.btnRow}>
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.white : colors.primary} />
      ) : (
        <>
          {icon}
          <RNText
            style={[
              styles.btnText,
              { color: isPrimary ? colors.white : isOutline ? colors.text : colors.primary },
            ]}
          >
            {title}
          </RNText>
        </>
      )}
    </View>
  );
  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      style={({ pressed }) => [
        styles.btnBase,
        isOutline && styles.btnOutline,
        variant === 'ghost' && styles.btnGhost,
        (disabled || loading) && { opacity: 0.6 },
        pressed && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {isPrimary ? (
        <LinearGradient
          colors={[colors.primary, colors.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.btnFill}
        >
          {content}
        </LinearGradient>
      ) : (
        content
      )}
    </Pressable>
  );
}

/* ---------------- Input ---------------- */
export function Input({ style, ...rest }) {
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      style={[styles.input, style]}
      selectionColor={colors.primary}
      {...rest}
    />
  );
}

/* ---------------- Card (with entrance animation) ---------------- */
export function Card({ children, style, index = 0, onPress }) {
  const inner = (
    <MotiView
      from={{ opacity: 0, translateY: 16 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 420, delay: Math.min(index * 60, 400) }}
      style={[styles.card, style]}
    >
      {children}
    </MotiView>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.92 }}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

/* ---------------- Badge ---------------- */
export function Badge({ label, tone = 'default' }) {
  const tones = {
    default: { bg: colors.surface2, fg: colors.textMuted, bd: colors.border },
    primary: { bg: 'rgba(108,99,255,0.14)', fg: colors.primary, bd: 'rgba(108,99,255,0.35)' },
    accent: { bg: 'rgba(0,212,170,0.12)', fg: colors.accent, bd: 'rgba(0,212,170,0.30)' },
    error: { bg: 'rgba(255,83,112,0.12)', fg: colors.error, bd: 'rgba(255,83,112,0.30)' },
  };
  const t = tones[tone] || tones.default;
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.bd }]}>
      <RNText style={[styles.badgeText, { color: t.fg }]}>{label}</RNText>
    </View>
  );
}

/* ---------------- IconTile (gradient thumbnail / fallback) ---------------- */
export function IconTile({ icon = 'storefront-outline', size = 84, round = radius.md, tone = 'primary' }) {
  const g = tone === 'accent'
    ? ['rgba(0,212,170,0.22)', 'rgba(0,212,170,0.06)']
    : ['rgba(108,99,255,0.24)', 'rgba(108,99,255,0.06)'];
  return (
    <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: round, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
      <Ionicons name={icon} size={size * 0.34} color={tone === 'accent' ? colors.accent : colors.primary} />
    </LinearGradient>
  );
}

/* ---------------- Chip (filter pill) ---------------- */
export function Chip({ label, active, onPress, icon }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
      {active ? (
        <LinearGradient colors={[colors.primary, colors.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.chip}>
          {icon}
          <RNText style={[styles.chipText, { color: colors.white }]}>{label}</RNText>
        </LinearGradient>
      ) : (
        <View style={[styles.chip, styles.chipIdle]}>
          {icon}
          <RNText style={[styles.chipText, { color: colors.textMuted }]}>{label}</RNText>
        </View>
      )}
    </Pressable>
  );
}

/* ---------------- SectionTitle ---------------- */
export function SectionTitle({ title, icon, action, onAction }) {
  return (
    <View style={styles.sectionTitle}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon ? <Ionicons name={icon} size={18} color={colors.accent} /> : null}
        <RNText style={{ fontFamily: font.displaySemi, fontSize: 18, color: colors.text }}>{title}</RNText>
      </View>
      {action ? (
        <Pressable onPress={onAction}><RNText style={{ fontFamily: font.bodySemi, fontSize: 13, color: colors.primary }}>{action}</RNText></Pressable>
      ) : null}
    </View>
  );
}

/* ---------------- Divider ---------------- */
export function Divider({ style }) {
  return <View style={[{ height: 1, backgroundColor: colors.border, opacity: 0.7 }, style]} />;
}

/* ---------------- Loader ---------------- */
export function Loader({ label }) {
  return (
    <View style={styles.loader}>
      <ActivityIndicator color={colors.primary} size="large" />
      {label ? <RNText style={styles.loaderLabel}>{label}</RNText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  btnBase: { borderRadius: radius.md, overflow: 'hidden' },
  btnFill: { paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center' },
  btnOutline: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  btnGhost: { paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  btnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnText: { fontFamily: font.bodySemi, fontSize: 15 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: colors.text,
    fontFamily: font.body,
    fontSize: 15,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  badge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  badgeText: { fontFamily: font.bodySemi, fontSize: 11 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 15, paddingVertical: 9, borderRadius: radius.pill },
  chipIdle: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipText: { fontFamily: font.bodySemi, fontSize: 13 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 40 },
  loaderLabel: { color: colors.textMuted, fontFamily: font.body, fontSize: 14 },
});
