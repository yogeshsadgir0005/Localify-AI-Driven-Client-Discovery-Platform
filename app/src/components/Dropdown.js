import React, { useMemo, useState } from 'react';
import { View, Modal, Pressable, StyleSheet, FlatList, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './ui';
import { colors, radius, spacing, font } from '../theme/colors';

/**
 * A searchable modal select that matches the app's dark theme. Mirrors the
 * website's country/state/city dropdowns.
 *
 * Props:
 *  - label?: string
 *  - value: string (selected value)
 *  - placeholder?: string
 *  - options: Array<string | { label, value }>
 *  - onSelect: (value) => void
 *  - disabled?: boolean
 *  - searchable?: boolean (default true)
 */
export default function Dropdown({ label, value, placeholder = 'Select…', options = [], onSelect, disabled, searchable = true }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const norm = useMemo(
    () => options.map((o) => (typeof o === 'string' ? { label: o, value: o } : o)),
    [options]
  );
  const selected = norm.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return norm;
    return norm.filter((o) => o.label.toLowerCase().includes(q));
  }, [norm, query]);

  const choose = (v) => { onSelect?.(v); setOpen(false); setQuery(''); };

  return (
    <View>
      {label ? <Text variant="label" style={{ marginBottom: 6 }}>{label}</Text> : null}
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        style={[styles.field, disabled && { opacity: 0.5 }]}
      >
        <Text style={{ flex: 1, color: selected ? colors.text : colors.textMuted, fontFamily: font.body, fontSize: 15 }} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => { setOpen(false); setQuery(''); }}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => { setOpen(false); setQuery(''); }} />
          <SafeAreaView style={styles.sheet} edges={['bottom']}>
            <View style={styles.handle} />
            <View style={styles.headRow}>
              <Text variant="h3">{label || 'Select'}</Text>
              <Pressable onPress={() => { setOpen(false); setQuery(''); }} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </Pressable>
            </View>
            {searchable && norm.length > 6 ? (
              <View style={styles.searchWrap}>
                <Ionicons name="search" size={16} color={colors.textMuted} />
                <TextInput
                  placeholder="Search…"
                  placeholderTextColor={colors.textMuted}
                  value={query}
                  onChangeText={setQuery}
                  style={styles.searchInput}
                  selectionColor={colors.primary}
                  returnKeyType="search"
                  autoCorrect={false}
                />
                {query ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={8}><Ionicons name="close-circle" size={16} color={colors.textMuted} /></Pressable>
                ) : null}
              </View>
            ) : null}
            <FlatList
              data={filtered}
              keyExtractor={(o) => o.value}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 12 }}
              initialNumToRender={20}
              renderItem={({ item }) => {
                const active = item.value === value;
                return (
                  <Pressable onPress={() => choose(item.value)} style={styles.row}>
                    <Text style={{ flex: 1, color: active ? colors.primary : colors.text, fontFamily: active ? font.bodySemi : font.body, fontSize: 15 }}>
                      {item.label}
                    </Text>
                    {active && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                  </Pressable>
                );
              }}
              ListEmptyComponent={<Text variant="muted" style={{ textAlign: 'center', padding: 24 }}>No matches.</Text>}
            />
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13,
  },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    height: '90%',
    backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingTop: 10,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 8 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, marginBottom: 10,
  },
  searchInput: { flex: 1, color: colors.text, fontFamily: font.body, fontSize: 15, paddingVertical: 11 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(42,49,66,0.5)' },
  rowActive: {},
});
