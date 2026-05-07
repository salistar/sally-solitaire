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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../src/components/AppHeader';
import { useTheme } from '../src/contexts/AppProviders';
import * as api from '../shared/api';

const VARIANTS: { key: string; label: string }[] = [
  { key: 'klondike-1', label: 'Klondike 1' },
  { key: 'klondike-3', label: 'Klondike 3' },
  { key: 'spider-1', label: 'Spider 1' },
  { key: 'spider-2', label: 'Spider 2' },
  { key: 'spider-4', label: 'Spider 4' },
  { key: 'freecell', label: 'FreeCell' },
  { key: 'yukon', label: 'Yukon' },
  { key: 'golf', label: 'Golf' },
  { key: 'pyramid', label: 'Pyramid' },
  { key: 'tripeaks', label: 'TriPeaks' },
  { key: 'forty-thieves', label: 'Forty Thieves' },
  { key: 'accordion', label: 'Accordion' },
];

function genUserId(): string {
  // Identifiant local éphémère (pas auth)
  return 'user-' + Math.random().toString(36).substr(2, 9);
}

export default function QuickMatchScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const [variant, setVariant] = useState('klondike-1');
  const [displayName, setDisplayName] = useState('Joueur');
  const [match, setMatch] = useState<api.SolitaireMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [userId] = useState(genUserId());

  const startQuickMatch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const m = await api.quickMatch({ variant, userId, displayName });
      if (!m) {
        setError('Impossible de créer/rejoindre — backend offline ?');
      } else {
        setMatch(m);
      }
    } finally {
      setLoading(false);
    }
  }, [variant, userId, displayName]);

  const joinByCode = useCallback(async () => {
    if (!joinCode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const m = await api.joinMatch(joinCode.trim().toUpperCase(), { userId, displayName });
      if (!m) setError('Code invalide ou match plein.');
      else setMatch(m);
    } finally {
      setLoading(false);
    }
  }, [joinCode, userId, displayName]);

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

  // Quand status passe à 'playing' → rediriger vers la partie ?
  // Pour la v1, on affiche juste le code + l'état adverse.

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
            ⚠️ Note v1 : le mobile ne synchronise pas encore le state du jeu.
            Pour jouer, ouvre la variante {match.variant} dans Solo et reporte ton score
            via cette page (à venir : embed direct du jeu).
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
