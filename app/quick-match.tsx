/**
 * @file quick-match.tsx
 * @description Lobby Quick Match 1v1. Crée ou rejoint un match basé sur un
 * deal BD identique pour les 2 joueurs. Polling 1.5s pour suivre le score
 * adverse en temps quasi-réel (pas de WS pour la v1).
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../src/components/AppHeader';
import { useTheme } from '../src/contexts/AppProviders';
import { useIsLocal } from '../src/contexts/useAppMode';
import * as api from '../shared/api';
import { AVAILABLE_VARIANTS } from '../src/game/variants';

// All 177 playable variants are exposed to the matchmaking screen so a 1v1
// race can be launched on any of them. Sorted alphabetically by display name
// for predictable scrolling.
const VARIANTS: { key: string; label: string }[] = AVAILABLE_VARIANTS
  .map((v) => ({ key: v.key, label: v.name }))
  .sort((a, b) => a.label.localeCompare(b.label));

function genGuestUserId(): string {
  // Fallback : identifiant local éphémère utilisé UNIQUEMENT si l'auth
  // backend n'a pas encore résolu un user id (cas rare — éphémère/guest).
  return 'guest-' + Math.random().toString(36).substr(2, 9);
}

export default function QuickMatchScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const isLocal = useIsLocal();
  // Pre-select the variant from the URL (`?variant=klondike-1`) — used by the
  // race finish overlay's "Revanche" button to launch a new match on the
  // variant just played. Falls back to klondike-1 when absent or invalid.
  const { variant: variantParam } = useLocalSearchParams<{ variant?: string }>();
  const initialVariant =
    variantParam && AVAILABLE_VARIANTS.some((v) => v.key === variantParam)
      ? variantParam
      : 'klondike-1';
  const [variant, setVariant] = useState(initialVariant);
  const [displayName, setDisplayName] = useState('Joueur');
  const [match, setMatch] = useState<api.SolitaireMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  // Le userId provient maintenant du backend (api.getMe()) au lieu d'un
  // random local. Indispensable pour que les 2 joueurs d'un même match
  // soient identifiés correctement côté serveur et puissent reprendre
  // leurs progrès sur des sessions différentes.
  const [userId, setUserId] = useState<string>(genGuestUserId());
  const [meReady, setMeReady] = useState(false);

  // Hydrate l'identité depuis /users/me (cloud uniquement — en local on
  // garde le guest random et on bloque le matchmaking, parce qu'il
  // dépend du backend).
  useEffect(() => {
    if (isLocal) { setMeReady(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const me = await api.getMe();
        if (cancelled) return;
        if (me?.id) {
          setUserId(me.id);
          if (me.username) setDisplayName(me.username);
          // eslint-disable-next-line no-console
          console.log('[QuickMatch] identité chargée', { userId: me.id, username: me.username });
        }
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.warn('[QuickMatch] /users/me failed — fallback guest id', e?.message ?? e);
      } finally {
        if (!cancelled) setMeReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [isLocal]);

  const startQuickMatch = useCallback(async () => {
    if (isLocal) {
      setError('Le matchmaking nécessite le mode connecté. Passe par /auth/mode-select.');
      return;
    }
    setLoading(true);
    setError(null);
    const res = await api.quickMatch({ variant, userId, displayName });
    setLoading(false);
    if (res.ok) {
      setMatch(res.match);
    } else {
      // Affiche le message d'erreur réel (BAD_REQUEST, Network request
      // failed, API error: 500, etc.) au lieu d'un générique trompeur.
      setError(`Création/jointure impossible : ${res.error}`);
    }
  }, [variant, userId, displayName, isLocal]);

  const joinByCode = useCallback(async () => {
    if (!joinCode.trim()) return;
    if (isLocal) {
      setError('Le matchmaking nécessite le mode connecté.');
      return;
    }
    setLoading(true);
    setError(null);
    const res = await api.joinMatch(joinCode.trim().toUpperCase(), { userId, displayName });
    setLoading(false);
    if (res.ok) setMatch(res.match);
    else setError(`Impossible de rejoindre : ${res.error}`);
  }, [joinCode, userId, displayName, isLocal]);

  // Polling toutes les 500ms (compromis : pas de SSE/WS natif sur mobile RN
  // sans polyfill — on garde du polling mais à fréquence + élevée. Le backend
  // SSE est utilisé par le client web pour latence < 100ms).
  useEffect(() => {
    if (!match || match.status === 'finished') return;
    const timer = setInterval(async () => {
      const m = await api.getMatch(match.code);
      if (m) setMatch(m);
    }, 500);
    return () => clearInterval(timer);
  }, [match]);

  // When match transitions to 'playing', auto-navigate to the embedded race
  // screen. The race screen takes over polling + socket sync + voice chat.
  useEffect(() => {
    if (match?.status === 'playing' && match.code) {
      router.replace(`/game/race/${match.code}`);
    }
  }, [match?.status, match?.code, router]);

  if (!match) {
    return (
      <View style={[styles.root, { backgroundColor: palette.bg }]}>
        <AppHeader title="Quick Match 1v1" showBack />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={[styles.label, { color: palette.text }]}>Pseudo</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholderTextColor={palette.textSecondary}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />

            <Text style={[styles.label, { color: palette.text, marginTop: 12 }]}>Variante</Text>
            <View style={styles.variantsRow}>
              {VARIANTS.map((v) => (
                <TouchableOpacity
                  key={v.key}
                  onPress={() => setVariant(v.key)}
                  style={[
                    styles.variantChip,
                    { backgroundColor: variant === v.key ? '#0EA5E9' : palette.border },
                  ]}>
                  <Text style={[styles.variantText, { color: variant === v.key ? '#fff' : palette.text }]}>
                    {v.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity onPress={startQuickMatch} disabled={loading}
              style={[styles.bigBtn, { backgroundColor: '#10B981', marginTop: 16, opacity: loading ? 0.5 : 1 }]}>
              <Ionicons name="flash" size={18} color="#fff" />
              <Text style={styles.bigBtnText}>Trouver une partie</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={[styles.label, { color: palette.text }]}>Rejoindre par code</Text>
            <TextInput
              value={joinCode}
              onChangeText={setJoinCode}
              placeholder="ABC123"
              placeholderTextColor={palette.textSecondary}
              autoCapitalize="characters"
              maxLength={6}
              style={[styles.input, { color: palette.text, borderColor: palette.border, fontFamily: 'monospace' }]}
            />
            <TouchableOpacity onPress={joinByCode} disabled={loading || !joinCode.trim()}
              style={[styles.bigBtn, { backgroundColor: '#7C3AED', marginTop: 8, opacity: (loading || !joinCode.trim()) ? 0.5 : 1 }]}>
              <Ionicons name="enter" size={18} color="#fff" />
              <Text style={styles.bigBtnText}>Rejoindre</Text>
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={[styles.errorBox, { borderColor: '#EF4444' }]}>
              <Ionicons name="warning" size={16} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  // En partie : afficher status + joueurs
  // Defensive : le backend renvoie parfois `match` sans `players` (race
  // condition entre create et fetch, ou shape différente selon endpoint).
  const players = Array.isArray(match.players) ? match.players : [];
  const me = players.find((p) => p.userId === userId);
  const opponent = players.find((p) => p.userId !== userId);
  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <AppHeader title={`Match ${match.code}`} showBack />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.statusCard, {
          backgroundColor: match.status === 'playing' ? 'rgba(16,185,129,0.15)' :
                           match.status === 'finished' ? 'rgba(124,58,237,0.15)' :
                           'rgba(245,158,11,0.15)',
          borderColor: match.status === 'playing' ? '#10B981' :
                       match.status === 'finished' ? '#7C3AED' : '#F59E0B',
        }]}>
          <Ionicons
            name={match.status === 'playing' ? 'flash' :
                  match.status === 'finished' ? 'trophy' : 'hourglass'}
            size={22}
            color={match.status === 'playing' ? '#10B981' :
                   match.status === 'finished' ? '#7C3AED' : '#F59E0B'} />
          <Text style={[styles.statusText, { color: palette.text }]}>
            {match.status === 'waiting' ? `En attente d'un adversaire — code ${match.code}` :
             match.status === 'playing' ? 'Partie en cours' :
             `Partie terminée — ${match.winnerId === userId ? '🏆 Tu as gagné !' :
                                  match.winnerId ? `${opponent?.displayName ?? '?'} a gagné` : 'Ex aequo'}`}
          </Text>
        </View>

        {players.map((p) => (
          <View key={p.userId} style={[styles.playerCard, {
            backgroundColor: palette.card,
            borderColor: p.userId === userId ? '#0EA5E9' : palette.border,
            borderWidth: p.userId === userId ? 2 : 1,
          }]}>
            <View style={styles.playerHeader}>
              <Text style={[styles.playerName, { color: palette.text }]}>
                {p.displayName} {p.userId === userId ? '(toi)' : ''}
              </Text>
              {p.finished ? (
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
              ) : null}
            </View>
            <View style={styles.playerStats}>
              <View style={styles.statBox}>
                <Text style={[styles.statLabel, { color: palette.textSecondary }]}>Score</Text>
                <Text style={[styles.statValue, { color: palette.text }]}>{p.score}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statLabel, { color: palette.textSecondary }]}>Coups</Text>
                <Text style={[styles.statValue, { color: palette.text }]}>{p.moves}</Text>
              </View>
            </View>
          </View>
        ))}

        {match.status === 'playing' ? (
          <Text style={[styles.note, { color: palette.textSecondary }]}>
            ▶ Le jeu démarre — redirection vers la course en cours…
          </Text>
        ) : null}

        {match.status === 'finished' ? (
          <TouchableOpacity onPress={() => setMatch(null)}
            style={[styles.bigBtn, { backgroundColor: '#0EA5E9' }]}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.bigBtnText}>Nouvelle partie</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 8 },
  label: { fontSize: 13, fontFamily: 'Inter-Black' },
  input: {
    borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  variantsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  variantChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
  },
  variantText: { fontSize: 12, fontFamily: 'Inter-Black' },
  bigBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 14, borderRadius: 10,
  },
  bigBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Inter-Black' },
  errorBox: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    padding: 12, borderWidth: 1, borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  errorText: { color: '#EF4444', fontSize: 13, fontFamily: 'Inter-Medium', flex: 1 },
  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderWidth: 1, borderRadius: 10,
  },
  statusText: { fontSize: 14, fontFamily: 'Inter-Black', flex: 1 },
  playerCard: { borderRadius: 12, padding: 14, gap: 8 },
  playerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  playerName: { fontSize: 14, fontFamily: 'Inter-Black' },
  playerStats: { flexDirection: 'row', gap: 16 },
  statBox: { flex: 1 },
  statLabel: { fontSize: 10, fontFamily: 'Inter-Medium', opacity: 0.7 },
  statValue: { fontSize: 20, fontFamily: 'Inter-Black' },
  note: { fontSize: 11, fontFamily: 'Inter-Regular', fontStyle: 'italic', opacity: 0.7, padding: 12 },
});
