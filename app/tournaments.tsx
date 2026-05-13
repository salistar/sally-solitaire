/**
 * @file tournaments.tsx
 * @description Liste des tournois Solitaire (en inscription ou en cours).
 * Permet à l'utilisateur de :
 *   - Parcourir les tournois ouverts
 *   - Tap → écran de détail / inscription
 *   - Créer un nouveau tournoi (CTA flottant)
 *
 * Single-elimination uniquement pour le MVP — 4/8/16 joueurs.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Modal, TextInput, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AppHeader from '../src/components/AppHeader';
import { useTheme } from '../src/contexts/AppProviders';
import { AVAILABLE_VARIANTS } from '../src/game/variants';
import * as api from '../shared/api';

/** Status row metadata — labels resolved through i18n at render time. */
const STATUS_COLOR: Record<string, { color: string; bg: string }> = {
  registration: { color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
  playing:      { color: '#0EA5E9', bg: 'rgba(14,165,233,0.15)' },
  finished:     { color: '#A78BFA', bg: 'rgba(167,139,250,0.15)' },
};

export default function TournamentsScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const { t } = useTranslation('screens');
  const statusLabel: Record<string, string> = {
    registration: t('tournaments.statusRegistration'),
    playing: t('tournaments.statusPlaying'),
    finished: t('tournaments.statusFinished'),
  };
  const [items, setItems] = useState<api.Tournament[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [me, setMe] = useState<{ id: string; username: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, user] = await Promise.all([
        api.fetchTournaments({ limit: 30 }),
        api.getMe().catch(() => null),
      ]);
      setItems(list);
      setMe(user ? { id: user.id, username: user.username } : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <AppHeader
        title={t('tournaments.title')}
        subtitle={t('tournaments.subtitle')}
        showBack
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={palette.text} />}
      >
        {me && (
          <TouchableOpacity
            onPress={() => setCreateOpen(true)}
            style={[styles.createBtn, { backgroundColor: '#7C3AED' }]}
            activeOpacity={0.85}
          >
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={styles.createBtnText}>{t('tournaments.create')}</Text>
          </TouchableOpacity>
        )}

        {items.length === 0 && !loading && (
          <View style={[styles.emptyBox, { borderColor: palette.border, backgroundColor: palette.card }]}>
            <Ionicons name="trophy-outline" size={32} color={palette.textSecondary} />
            <Text style={[styles.emptyText, { color: palette.text }]}>
              {t('tournaments.emptyTitle')}
            </Text>
            {me && (
              <Text style={[styles.emptyHint, { color: palette.textSecondary }]}>
                {t('tournaments.emptyHintHost')}
              </Text>
            )}
          </View>
        )}

        {items.map((tour) => {
          const color = STATUS_COLOR[tour.status] ?? STATUS_COLOR.finished;
          const label = statusLabel[tour.status] ?? tour.status;
          return (
            <TouchableOpacity
              key={tour.code}
              onPress={() => router.push(`/tournament/${tour.code}`)}
              style={[styles.row, { backgroundColor: palette.card, borderColor: palette.border }]}
              activeOpacity={0.85}
            >
              <View style={styles.rowTop}>
                <View style={[styles.statusBadge, { backgroundColor: color.bg }]}>
                  <Text style={[styles.statusBadgeText, { color: color.color }]}>{label}</Text>
                </View>
                <Text style={[styles.code, { color: palette.textSecondary }]}>{tour.code}</Text>
              </View>
              <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>{tour.name}</Text>
              <Text style={[styles.meta, { color: palette.textSecondary }]}>
                {tour.variant} · {tour.participants.length}/{tour.maxParticipants} · {tour.format}
              </Text>
              {tour.status === 'finished' && tour.championDisplayName && (
                <Text style={styles.champion}>🏆 {tour.championDisplayName}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <CreateTournamentModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        me={me}
        onCreated={(t) => {
          setCreateOpen(false);
          load();
          router.push(`/tournament/${t.code}`);
        }}
      />
    </View>
  );
}

function CreateTournamentModal({
  open, onClose, me, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  me: { id: string; username: string } | null;
  onCreated: (tournament: api.Tournament) => void;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('screens');
  const [name, setName] = useState('');
  const [variant, setVariant] = useState('klondike-1');
  const [size, setSize] = useState<4 | 8 | 16>(4);
  const [format, setFormat] = useState<api.TournamentFormat>('single-elim');
  const [busy, setBusy] = useState(false);

  // Round-robin is 4p only. Double-elim supports 4/8/16. Single-elim too.
  const formatAllowsSize = (f: api.TournamentFormat, s: number): boolean => {
    if (f === 'round-robin') return s === 4;
    return true; // single-elim and double-elim both support 4/8/16
  };

  const submit = async () => {
    if (!me || busy) return;
    if (!name.trim()) {
      Alert.alert(t('tournaments.newModal.nameRequiredTitle'), t('tournaments.newModal.nameRequiredBody'));
      return;
    }
    setBusy(true);
    try {
      const created = await api.createTournament({
        name: name.trim(),
        variant,
        difficulty: 'medium',
        maxParticipants: size,
        hostUserId: me.id,
        hostDisplayName: me.username,
        format,
      });
      if (!created) {
        Alert.alert(t('tournaments.newModal.createErrorBody'), '');
        return;
      }
      onCreated(created);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.modalTitle, { color: palette.text }]}>{t('tournaments.newModal.title')}</Text>

          <Text style={[styles.modalLabel, { color: palette.textSecondary }]}>{t('tournaments.newModal.name')}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('tournaments.newModal.namePlaceholder')}
            placeholderTextColor={palette.textSecondary}
            style={[styles.modalInput, { color: palette.text, borderColor: palette.border }]}
          />

          <Text style={[styles.modalLabel, { color: palette.textSecondary }]}>{t('tournaments.newModal.variant')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
            {AVAILABLE_VARIANTS.slice(0, 12).map((v) => (
              <TouchableOpacity
                key={v.key}
                onPress={() => setVariant(v.key)}
                style={[
                  styles.variantChip,
                  { borderColor: variant === v.key ? '#0EA5E9' : palette.border },
                ]}
              >
                <Text style={[styles.variantChipText, { color: variant === v.key ? '#0EA5E9' : palette.text }]}>
                  {v.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.modalLabel, { color: palette.textSecondary }]}>{t('tournaments.newModal.size')}</Text>
          <View style={styles.sizeRow}>
            {[4, 8, 16].map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => {
                  setSize(n as 4 | 8 | 16);
                  // Auto-downgrade to single-elim if user picks 8/16 with double-elim selected
                  if (!formatAllowsSize(format, n)) setFormat('single-elim');
                }}
                style={[
                  styles.sizeChip,
                  { backgroundColor: size === n ? '#7C3AED' : palette.border },
                ]}
              >
                <Text style={[styles.sizeChipText, { color: size === n ? '#fff' : palette.text }]}>
                  {n}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.modalLabel, { color: palette.textSecondary }]}>{t('tournaments.newModal.format')}</Text>
          <View style={styles.sizeRow}>
            <TouchableOpacity
              onPress={() => setFormat('single-elim')}
              style={[styles.sizeChip, {
                backgroundColor: format === 'single-elim' ? '#0EA5E9' : palette.border,
              }]}
            >
              <Text style={[styles.sizeChipText, {
                color: format === 'single-elim' ? '#fff' : palette.text, fontSize: 11,
              }]}>
                {t('tournaments.newModal.singleElim')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setFormat('double-elim')}
              style={[styles.sizeChip, {
                backgroundColor: format === 'double-elim' ? '#0EA5E9' : palette.border,
              }]}
            >
              <Text style={[styles.sizeChipText, {
                color: format === 'double-elim' ? '#fff' : palette.text, fontSize: 11,
              }]}>
                {t('tournaments.newModal.doubleElim')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (formatAllowsSize('round-robin', size)) setFormat('round-robin');
                else Alert.alert(t('tournaments.newModal.unavailableTitle'), t('tournaments.newModal.roundRobin4pOnly'));
              }}
              style={[styles.sizeChip, {
                backgroundColor: format === 'round-robin' ? '#0EA5E9' : palette.border,
                opacity: formatAllowsSize('round-robin', size) ? 1 : 0.5,
              }]}
            >
              <Text style={[styles.sizeChipText, {
                color: format === 'round-robin' ? '#fff' : palette.text, fontSize: 11,
              }]}>
                {t('tournaments.newModal.roundRobin')}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity onPress={onClose} style={[styles.modalBtn, { backgroundColor: palette.border }]}>
              <Text style={[styles.modalBtnText, { color: palette.text }]}>{t('tournaments.newModal.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={submit}
              disabled={busy}
              style={[styles.modalBtn, { backgroundColor: '#7C3AED', opacity: busy ? 0.6 : 1 }]}
            >
              <Text style={[styles.modalBtnText, { color: '#fff' }]}>
                {busy ? '…' : t('tournaments.newModal.create')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 14, gap: 10, paddingBottom: 32 },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12,
  },
  createBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Black' },
  emptyBox: {
    alignItems: 'center', gap: 8, padding: 24, borderWidth: 1, borderRadius: 14,
  },
  emptyText: { fontSize: 14, fontFamily: 'Inter-SemiBold', textAlign: 'center' },
  emptyHint: { fontSize: 12, fontFamily: 'Inter-Regular' },
  row: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusBadgeText: { fontSize: 9, fontFamily: 'Inter-Black', letterSpacing: 1 },
  code: { fontSize: 11, fontFamily: 'monospace' },
  title: { fontSize: 15, fontFamily: 'Inter-Black', marginTop: 4 },
  meta: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
  champion: { fontSize: 12, fontFamily: 'Inter-Bold', color: '#FCD34D', marginTop: 4 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: {
    padding: 18, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, gap: 6,
  },
  modalTitle: { fontSize: 18, fontFamily: 'Inter-Black', marginBottom: 6 },
  modalLabel: { fontSize: 10, fontFamily: 'Inter-Black', letterSpacing: 1, marginTop: 4 },
  modalInput: {
    paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderRadius: 8,
    fontSize: 14, fontFamily: 'Inter-Regular',
  },
  variantChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderRadius: 999, marginRight: 6,
  },
  variantChipText: { fontSize: 11, fontFamily: 'Inter-Bold' },
  sizeRow: { flexDirection: 'row', gap: 8, marginVertical: 4 },
  sizeChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8 },
  sizeChipText: { fontSize: 14, fontFamily: 'Inter-Black' },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  modalBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10 },
  modalBtnText: { fontSize: 13, fontFamily: 'Inter-Black' },
});
