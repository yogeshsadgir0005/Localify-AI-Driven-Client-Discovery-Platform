import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, FlatList, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlowBackground from '../components/GlowBackground';
import { Text, Input, Loader, Chip } from '../components/ui';
import BusinessCard from '../components/BusinessCard';
import { colors, radius, spacing, font } from '../theme/colors';
import api, { getErrorMessage } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { CATEGORIES, categoryOf } from '../utils/helpers';

export default function SearchScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const plan = user?.plan || 'free';
  const address = user?.address || {};

  const [all, setAll] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasLocked, setHasLocked] = useState(false);
  const [noWebsiteCount, setNoWebsiteCount] = useState(0);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('All');
  const [noWebsiteOnly, setNoWebsiteOnly] = useState(false);

  const flash = (m) => { setNotice(m); setTimeout(() => setNotice(''), 2600); };

  const fetchResults = useCallback(async () => {
    if (!address?.district || !address?.state) { setStatus('idle'); return; }
    setStatus('loading'); setError('');
    try {
      const { data } = await api.get('/business/search', {
        params: {
          country: address.country,
          city: address.city || address.district,
          district: address.district,
          state: address.state,
          plan,
        },
      });
      setAll(Array.isArray(data.results) ? data.results : []);
      setTotal(typeof data.total === 'number' ? data.total : (data.results?.length || 0));
      setHasLocked(Boolean(data.hasLockedResults));
      setNoWebsiteCount(typeof data.noWebsiteCount === 'number' ? data.noWebsiteCount : 0);
      setStatus('success');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load businesses.'));
      setStatus('error');
    }
  }, [address?.country, address?.city, address?.district, address?.state, plan]);

  // Free-plan phone reveal — POST /auth/unhide-phone, refresh profile, or gate to plans.
  const unhidePhone = useCallback(async (placeId) => {
    try {
      const { data } = await api.post('/auth/unhide-phone', { placeId });
      if (data?.user) setUser(data.user);
      else { try { const p = await api.get('/auth/profile'); if (p.data?.user) setUser(p.data.user); } catch {} }
      flash(`Contact unhidden${data?.remaining != null ? ` · ${data.remaining} left this week` : ''}`);
    } catch (err) {
      if (err.response?.status === 403) { flash('Upgrade to reveal more contacts'); navigation.navigate('Subscriptions'); }
      else flash(getErrorMessage(err, 'Could not unhide contact.'));
    }
  }, [setUser, navigation]);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return all.filter((b) => {
      if (noWebsiteOnly && b.website) return false;
      if (category !== 'All' && categoryOf(b) !== category) return false;
      if (!kw) return true;
      return [b.name, b.address, ...(b.types || [])].join(' ').toLowerCase().includes(kw);
    });
  }, [all, keyword, category, noWebsiteOnly]);

  const Header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <View>
          <Text variant="h1">Discover</Text>
          <Text variant="muted" style={{ marginTop: 2 }}>
            {address.city || address.district || 'Your area'}
            {address.state ? `, ${address.state}` : ''}
          </Text>
        </View>
        <Pressable style={styles.notifBtn} onPress={() => navigation.navigate('Notifications')}>
          <Ionicons name="notifications-outline" size={22} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <Input
          placeholder="Filter by name, category or keyword…"
          value={keyword}
          onChangeText={setKeyword}
          style={styles.searchInput}
        />
      </View>

      <FlatList
        data={CATEGORIES}
        keyExtractor={(c) => c}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        renderItem={({ item }) => (
          <Chip label={item} active={item === category} onPress={() => setCategory(item)} />
        )}
      />

      <Pressable style={styles.filterRow} onPress={() => setNoWebsiteOnly((v) => !v)}>
        <Ionicons
          name={noWebsiteOnly ? 'checkbox' : 'square-outline'}
          size={18}
          color={noWebsiteOnly ? colors.accent : colors.textMuted}
        />
        <Text variant="muted" style={{ color: noWebsiteOnly ? colors.text : colors.textMuted }}>
          Show only businesses without a website{noWebsiteCount > 0 ? ` (${noWebsiteCount})` : ''}
        </Text>
      </Pressable>

      <Text variant="label" style={{ marginTop: 4 }}>
        {total > filtered.length
          ? `Showing 1–${filtered.length} of ${total} fetched businesses`
          : `${filtered.length} result${filtered.length === 1 ? '' : 's'}`}
      </Text>
      {notice ? (
        <View style={styles.notice}>
          <Ionicons name="checkmark-circle" size={15} color={colors.accent} />
          <Text variant="label" color={colors.accent} style={{ flex: 1 }}>{notice}</Text>
        </View>
      ) : null}
    </View>
  );

  const LockedCard = (
    <Pressable onPress={() => navigation.navigate('Subscriptions')} style={styles.locked}>
      <View style={styles.lockIcon}>
        <Ionicons name="lock-closed" size={26} color={colors.white} />
      </View>
      <Text variant="h2" style={{ marginTop: 14, textAlign: 'center' }}>Unlock more results</Text>
      <Text variant="muted" style={{ marginTop: 6, textAlign: 'center', paddingHorizontal: 12 }}>
        You are on the <Text color={colors.text} style={{ fontFamily: font.bodySemi, textTransform: 'capitalize' }}>{plan}</Text> plan. Upgrade to view all {total} results.
      </Text>
      <View style={styles.viewPlans}>
        <Text color={colors.accent} style={{ fontFamily: font.bodySemi }}>View Plans & Pricing</Text>
        <Ionicons name="arrow-forward" size={15} color={colors.accent} />
      </View>
    </Pressable>
  );

  return (
    <GlowBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {status === 'loading' && all.length === 0 ? (
          <>
            {Header}
            <Loader label="Finding local businesses…" />
          </>
        ) : status === 'idle' ? (
          <View style={styles.center}>
            <Text variant="h3">Set your area first</Text>
            <Text variant="muted" style={{ marginTop: 6, textAlign: 'center' }}>
              Add your district in Profile to see nearby businesses.
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(b) => b.placeId}
            ListHeaderComponent={Header}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: 12 }}
            refreshControl={
              <RefreshControl refreshing={status === 'loading'} onRefresh={fetchResults} tintColor={colors.primary} />
            }
            renderItem={({ item, index }) => (
              <BusinessCard
                business={item}
                index={index}
                user={user}
                onUnhide={unhidePhone}
                onPress={() => navigation.navigate('BusinessDetail', { placeId: item.placeId, name: item.name })}
              />
            )}
            ListFooterComponent={hasLocked && filtered.length > 0 ? LockedCard : null}
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="search-outline" size={30} color={colors.textMuted} />
                <Text variant="muted" style={{ marginTop: 10, textAlign: 'center' }}>
                  {error || 'No businesses match your filters.'}
                </Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </GlowBackground>
  );
}

const styles = StyleSheet.create({
  header: { gap: 14, marginBottom: 6 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,212,170,0.10)', borderWidth: 1, borderColor: 'rgba(0,212,170,0.28)', borderRadius: radius.md, padding: 10, marginTop: 2 },
  locked: {
    alignItems: 'center', marginTop: 8, padding: 28, borderRadius: radius.xl,
    backgroundColor: 'rgba(0,212,170,0.06)', borderWidth: 1, borderColor: 'rgba(0,212,170,0.25)',
  },
  lockIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.accent, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  viewPlans: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  notifBtn: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12,
  },
  searchInput: { flex: 1, borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 0 },
  chips: { gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.textMuted },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
});
