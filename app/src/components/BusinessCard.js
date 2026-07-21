import React, { useState } from 'react';
import { View, Image, StyleSheet, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Text, Badge, IconTile } from './ui';
import { colors, radius, spacing, font } from '../theme/colors';
import { photoUrl, categoryOf } from '../utils/helpers';

const CATEGORY_ICON = {
  Restaurants: 'restaurant-outline',
  Shops: 'bag-handle-outline',
  Services: 'construct-outline',
  Healthcare: 'medkit-outline',
  Education: 'school-outline',
  Others: 'storefront-outline',
};

export default function BusinessCard({ business, index, onPress, user, onUnhide }) {
  const [imgOk, setImgOk] = useState(true);
  const cat = categoryOf(business);
  const img = photoUrl(business?.photos?.[0]?.ref, 400);
  const rating = business?.rating;
  const hasWebsite = Boolean(business?.website);

  const isFree = !user?.plan || user.plan === 'free';
  const unlocked = user?.phoneUnhides?.unlockedPlaceIds || [];
  const isUnhidden = unlocked.includes(business?.placeId);
  const remaining = Math.max(0, 3 - unlocked.length);
  const showMasked = isFree && !isUnhidden && !!business?.phone;

  const onPhone = () => {
    if (showMasked) onUnhide?.(business.placeId);
    else if (business?.phone) Linking.openURL(`tel:${business.phone}`);
  };

  return (
    <Card index={index} onPress={onPress} style={styles.card}>
      <View style={styles.row}>
        <View style={styles.thumbWrap}>
          {img && imgOk ? (
            <Image source={{ uri: img }} style={styles.thumb} resizeMode="cover" onError={() => setImgOk(false)} />
          ) : (
            <IconTile icon={CATEGORY_ICON[cat] || 'storefront-outline'} size={84} round={radius.md} />
          )}
        </View>

        <View style={styles.body}>
          <View style={styles.topRow}>
            <Badge label={cat} tone="primary" />
            {!hasWebsite && <Badge label="No website" tone="accent" />}
          </View>

          <Text variant="h3" numberOfLines={1} style={{ marginTop: 8, fontSize: 16 }}>
            {business?.name || 'Unnamed business'}
          </Text>

          <Text variant="muted" numberOfLines={2} style={{ marginTop: 3, fontSize: 13, lineHeight: 18 }}>
            {business?.address || 'Address unavailable'}
          </Text>
        </View>
      </View>

      {/* Phone (masked with remaining count for free plan, tap to unhide) */}
      {business?.phone ? (
        <Pressable onPress={onPhone} style={styles.phoneRow} hitSlop={6}>
          <Ionicons name={showMasked ? 'eye-off-outline' : 'call-outline'} size={15} color={showMasked ? colors.textMuted : colors.accent} />
          {showMasked ? (
            <>
              <Text style={styles.masked}>+91 ••••••••••</Text>
              <Text style={styles.remaining}>({remaining} remaining)</Text>
            </>
          ) : (
            <Text style={{ fontFamily: font.bodySemi, fontSize: 13, color: colors.text }}>{business.phone}</Text>
          )}
        </Pressable>
      ) : null}

      <View style={styles.metaRow}>
        {rating != null && rating !== 'N/A' && (
          <View style={styles.metaItem}>
            <Ionicons name="star" size={13} color="#FBBF24" />
            <Text variant="label" color={colors.text} style={styles.metaText}>
              {rating}{business?.reviewCount ? ` (${business.reviewCount})` : ''}
            </Text>
          </View>
        )}
        <View style={styles.spacer} />
        <View style={styles.metaItem}>
          <Text variant="label" color={colors.primary} style={styles.metaText}>View details</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, gap: 10 },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  thumbWrap: { width: 84, height: 84, borderRadius: radius.md, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%', backgroundColor: colors.surface2 },
  body: { flex: 1, minWidth: 0 },
  topRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  masked: { fontFamily: font.body, fontSize: 13, color: colors.textMuted, letterSpacing: 1 },
  remaining: { fontFamily: font.body, fontSize: 10, color: colors.textMuted, opacity: 0.7 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  spacer: { flex: 1 },
  metaText: { fontFamily: font.bodySemi },
});
