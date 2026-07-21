import React, { useCallback, useEffect, useState } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlowBackground from '../components/GlowBackground';
import { Text, Card, Badge, Loader, Button } from '../components/ui';
import { colors, radius, spacing, font } from '../theme/colors';
import api, { getErrorMessage } from '../api/client';

/**
 * Per-type presentation, mirroring the website's META map
 * (client/src/pages/NotificationsPage.jsx). Icons swapped for Ionicons.
 */
const META = {
  new_matching_requirement: { icon: 'search', tag: 'New demand', tone: 'primary' },
  contact_request: { icon: 'file-tray-outline', tag: 'Request', tone: 'primary' },
  contact_revealed: { icon: 'people-outline', tag: 'Connected', tone: 'accent' },
  saved_search_match: { icon: 'search', tag: 'Match', tone: 'accent' },
};

const timeAgo = (iso) => {
  const t = new Date(iso).getTime();
  if (!iso || Number.isNaN(t)) return '';
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

/**
 * Resolve a deep-link target from a notification's `data` payload. The website
 * routes every type to /search; on native we prefer a real business/profile
 * screen when the payload carries an id, then fall back to the Discover tab.
 */
const navTarget = (n) => {
  const d = n?.data || {};
  const placeId = d.placeId || d.businessId || d.place_id;
  if (placeId) return { screen: 'BusinessDetail', params: { placeId } };
  if (d.profileId) return { screen: 'ProfileDetail', params: { id: d.profileId } };
  if (d.requirementId) return { screen: 'Requirements', params: { id: d.requirementId } };
  return { screen: 'Discover', params: undefined };
};

export default function NotificationsScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setStatus('loading');
    try {
      const { data } = await api.get('/notifications');
      const list = Array.isArray(data?.notifications)
        ? data.notifications
        : Array.isArray(data)
        ? data
        : [];
      setItems(list);
      setStatus('success');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load notifications.'));
      setStatus('error');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 2200);
  };

  const markAll = async () => {
    const prev = items;
    setItems((list) => list.map((n) => ({ ...n, read: true }))); // optimistic
    try {
      await api.post('/notifications/read-all');
      flash('All caught up.');
    } catch (err) {
      setItems(prev); // rollback
      flash(getErrorMessage(err, 'Could not update.'));
    }
  };

  const open = async (n) => {
    if (!n.read) {
      setItems((list) => list.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      try {
        await api.post(`/notifications/${n._id}/read`);
      } catch {
        /* non-fatal — the mark just doesn't persist */
      }
    }
    const target = navTarget(n);
    if (!target) return;
    try {
      navigation.navigate(target.screen, target.params);
    } catch {
      /* screen may not be registered yet — fail quietly */
    }
  };

  const hasUnread = items.some((n) => !n.read);

  const renderItem = ({ item, index }) => {
    const meta = META[item.type] || { icon: 'notifications-outline', tag: '', tone: 'default' };
    const unread = !item.read;
    return (
      <Card
        index={index}
        onPress={() => open(item)}
        style={[styles.item, unread ? styles.itemUnread : styles.itemRead]}
      >
        <View style={styles.row}>
          <View style={[styles.iconWrap, unread && styles.iconWrapUnread]}>
            <Ionicons
              name={meta.icon}
              size={17}
              color={unread ? colors.primary : colors.textMuted}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.titleRow}>
              <Text
                style={{ flex: 1, fontFamily: font.bodySemi, color: colors.text }}
                numberOfLines={2}
              >
                {item.title || 'Update'}
              </Text>
              {unread ? <View style={styles.dot} /> : null}
            </View>
            {item.body ? (
              <Text variant="muted" style={{ marginTop: 3, lineHeight: 19 }} numberOfLines={2}>
                {item.body}
              </Text>
            ) : null}
            <View style={styles.metaRow}>
              {meta.tag ? <Badge label={meta.tag} tone={meta.tone} /> : null}
              <Text variant="label" style={{ fontSize: 12 }}>
                {timeAgo(item.createdAt)}
              </Text>
            </View>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <GlowBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.head}>
          <Text variant="h1">Notifications</Text>
          {hasUnread ? (
            <Button
              title="Mark all read"
              variant="ghost"
              onPress={markAll}
              icon={<Ionicons name="checkmark-done" size={16} color={colors.primary} />}
              style={styles.markBtn}
            />
          ) : null}
        </View>

        {notice ? (
          <View style={styles.notice}>
            <Text variant="label" color={colors.accent}>
              {notice}
            </Text>
          </View>
        ) : null}

        {status === 'loading' && items.length === 0 ? (
          <Loader label="Loading…" />
        ) : status === 'error' && items.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={38} color={colors.error} />
            <Text variant="h3" style={{ marginTop: 12 }}>
              Couldn’t load notifications
            </Text>
            <Text variant="muted" style={{ marginTop: 6, textAlign: 'center' }}>
              {error}
            </Text>
            <Button title="Try again" style={{ marginTop: 18 }} onPress={() => load()} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(n, i) => n._id || String(i)}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true)}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="notifications-off-outline" size={40} color={colors.textMuted} />
                <Text variant="muted" style={{ marginTop: 12 }}>
                  No notifications yet.
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
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 6,
    paddingBottom: 8,
    minHeight: 48,
  },
  markBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  notice: {
    marginHorizontal: spacing.lg,
    marginBottom: 8,
    backgroundColor: 'rgba(0,212,170,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(0,212,170,0.30)',
    borderRadius: radius.md,
    padding: 10,
  },
  listContent: { padding: spacing.lg, paddingTop: 4, gap: 10, flexGrow: 1 },
  item: { padding: spacing.md },
  itemUnread: {
    borderColor: 'rgba(108,99,255,0.45)',
    backgroundColor: 'rgba(108,99,255,0.06)',
  },
  itemRead: { opacity: 0.72 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapUnread: {
    backgroundColor: 'rgba(108,99,255,0.14)',
    borderColor: 'rgba(108,99,255,0.35)',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 90,
    paddingHorizontal: 40,
  },
});
