/**
 * @file tournament/[code].tsx
 * @description Détail d'un tournoi — liste participants, bracket text-based
 * par round, et actions contextuelles (s'inscrire, lancer, rejoindre son
 * match en cours).
 *
 * Bracket viz minimaliste : pas de SVG / lignes — chaque round est une
 * colonne empilée verticalement. Match en cours = tap pour rejoindre la
 * race. Match futur = état "en attente".
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../../src/components/AppHeader';
import { useTheme } from '../../src/contexts/AppProviders';
import * as api from '../../shared/api';
import TournamentBracketViz from '../../src/components/TournamentBracketViz';

const STATUS_META: Record<string, { label: string; color: string }> = {
  registration: { label: 'INSCRIPTIONS', color: '#10B981' },
  playing:      { label: 'EN COURS',     color: '#0EA5E9' },
  finished:     { label: 'TERMINÉ',      color: '#A78BFA' },
};

/**
 * Mirror of the backend's `payoutsForSize` so the prize is visible during
 * registration. Must stay in sync — if you tune one, tune the other.
 */
function prizeForSize(size: number): { champion: number; runnerUp: number } {
  if (size === 4)  return { champion: 200,  runnerUp: 80 };
  if (size === 8)  return { champion: 500,  runnerUp: 200 };
  if (size === 16) return { champion: 1000, runnerUp: 400 };
  return { champion: 0, runnerUp: 0 };
}

export default function TournamentDetailScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const [t, setT] = useState<api.Tournament | null>(null);
  const [me, setMe] = useState<{ id: string; username: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!code) return;
    setLoading(true);
    try {
      const [data, user] = await Promise.all([
        api.fetchTournament(code),
        api.getMe().catch(() => null),
      ]);
      setT(data);
      setMe(user ? { id: user.id, username: user.username } : null);
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => { load(); }, [load]);

  // Poll while playing — bracket advances need fresh data
  useEffect(() => {
    if (!t || t.status !== 'playing') return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [t?.status, load]);

  const isRegistered = useMemo(
    () => !!(t && me && t.participants.some((p) => p.userId === me.id)),
    [t, me],
  );
  const isHost = !!(t && me && t.hostUserId === me.id);
  const isFull = !!(t && t.participants.length >= t.maxParticipants);

  // The user's current playable match (a node where they're a slot + matchCode is set + no winner yet)
  const myActiveMatch = useMemo(() => {
    if (!t || !me) return null;
    return t.bracket.find((n) =>
      (n.p1UserId === me.id || n.p2UserId === me.id) &&
      n.matchCode &&
      !n.winnerUserId,
    );
  }, [t, me]);

  const register = async () => {
    if (!t || !me || busy) return;
    setBusy(true);
    try {
      const result = await api.registerToTournament(t.code, me.id, me.username);
      if (!result) Alert.alert('Erreur', "Inscription refusée (tournoi plein ou déjà commencé).");
      else setT(result);
    } finally { setBusy(false); }
  };

  const start = async () => {
    if (!t || !me || busy) return;
    if (!isFull) {
      Alert.alert('Attente', `Il manque ${t.maxParticipants - t.participants.length} joueur(s) avant de pouvoir lancer.`);
      return;
    }
    setBusy(true);
    try {
      const result = await api.startTournament(t.code, me.id);
      if (!result) Alert.alert('Erreur', 'Le lancement a échoué.');
      else setT(result);
    } finally { setBusy(false); }
  };

  if (!t) {
    return (
      <View style={[styles.root, { backgroundColor: palette.bg }]}>
        <AppHeader title="Tournoi" showBack />
        <View style={styles.center}>
          <Text style={{ color: palette.textSecondary }}>{loading ? 'Chargement…' : 'Introuvable'}</Text>
        </View>
      </View>
    );
  }

  const status = STATUS_META[t.status] ?? STATUS_META.finished;

  // Round-robin standings: live wins per participant, computed from current
  // bracket state. Shown below the matches grid for round-robin format only.
  const standings = t.format === 'round-robin'
    ? (() => {
        const wins = new Map<string, number>();
        for (const n of t.bracket) {
          if (n.p1UserId) wins.set(n.p1UserId, wins.get(n.p1UserId) ?? 0);
          if (n.p2UserId) wins.set(n.p2UserId, wins.get(n.p2UserId) ?? 0);
          if (n.winnerUserId) wins.set(n.winnerUserId, (wins.get(n.winnerUserId) ?? 0) + 1);
        }
        return Array.from(wins.entries())
          .map(([uid, w]) => {
            const p = t.participants.find((x) => x.userId === uid);
            return { userId: uid, displayName: p?.displayName ?? uid, wins: w };
          })
          .sort((a, b) => b.wins - a.wins || a.userId.localeCompare(b.userId));
      })()
    : null;

  // Group bracket nodes for the column layout. Single-elim: one section,
  // rounds as columns. Double-elim: 3 sections (Winners / Losers / Grand
  // final), each with their own rounds. Round-robin: one section listing
  // every pair-match (no rounds to advance).
  type RoundColumn = { sectionLabel: string | null; label: string; nodes: api.TournamentBracketNode[] };
  const columns: RoundColumn[] = [];
  if (t.format === 'round-robin') {
    columns.push({
      sectionLabel: 'ROUND-ROBIN',
      label: `${t.bracket.length} matches`,
      nodes: [...t.bracket].sort((a, b) => a.position - b.position),
    });
  } else if (t.format === 'double-elim') {
    const wb = t.bracket.filter((n) => (n.bracketType ?? 'winners') === 'winners');
    const lb = t.bracket.filter((n) => n.bracketType === 'losers');
    const gf = t.bracket.filter((n) => n.bracketType === 'grand-final');
    const groupByRound = (nodes: api.TournamentBracketNode[]) => {
      const byRound: Record<number, api.TournamentBracketNode[]> = {};
      for (const n of nodes) (byRound[n.round] ??= []).push(n);
      return Object.entries(byRound)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([r, list]) => ({
          round: parseInt(r),
          list: list.sort((a, b) => a.position - b.position),
        }));
    };
    const wbGrouped = groupByRound(wb);
    const lbGrouped = groupByRound(lb);
    wbGrouped.forEach((g, i) => columns.push({
      sectionLabel: i === 0 ? 'WINNERS BRACKET' : null,
      label: `WB R${g.round + 1}`,
      nodes: g.list,
    }));
    lbGrouped.forEach((g, i) => columns.push({
      sectionLabel: i === 0 ? 'LOSERS BRACKET' : null,
      label: `LB R${g.round + 1}`,
      nodes: g.list,
    }));
    if (gf.length > 0) columns.push({
      sectionLabel: 'GRAND FINAL',
      label: 'GF',
      nodes: gf,
    });
  } else {
    const byRound: Record<number, api.TournamentBracketNode[]> = {};
    for (const n of t.bracket) (byRound[n.round] ??= []).push(n);
    const totalRounds = Math.log2(t.maxParticipants);
    const labels = (() => {
      const out: string[] = [];
      if (t.maxParticipants === 16) out.push('16ème');
      if (totalRounds >= 3) out.push('Quarts');
      if (totalRounds >= 2) out.push('Demis');
      out.push('Finale');
      return out;
    })();
    Object.entries(byRound)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .forEach(([r, list]) => {
        const ri = parseInt(r);
        columns.push({
          sectionLabel: null,
          label: labels[ri] ?? `R${ri + 1}`,
          nodes: list.sort((a, b) => a.position - b.position),
        });
      });
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <AppHeader title={t.name} subtitle={t.code} showBack />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={palette.text} />}
      >
        {/* Header card */}
        <View style={[styles.heroCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.statusLabel, { color: status.color }]}>{status.label}</Text>
          <Text style={[styles.heroTitle, { color: palette.text }]}>{t.name}</Text>
          <Text style={[styles.heroSub, { color: palette.textSecondary }]}>
            {t.variant} · {t.maxParticipants} joueurs · single-elimination
          </Text>
          {t.status === 'finished' && t.championDisplayName && (
            <>
              <Text style={styles.championLine}>🏆 Champion : {t.championDisplayName}</Text>
              {t.championLifetimeWins > 0 && (
                <Text style={[styles.heroSub, { color: palette.textSecondary }]}>
                  {t.championLifetimeWins === 1
                    ? 'Premier tournoi remporté !'
                    : `${t.championLifetimeWins} tournois remportés au total`}
                </Text>
              )}
            </>
          )}
        </View>

        {/* Payout pot — always visible (prize during reg, awarded after finish) */}
        {t.status !== 'finished' && (
          <View style={[styles.payoutCard, { borderColor: palette.border, backgroundColor: 'rgba(252,211,77,0.08)' }]}>
            <Text style={styles.payoutTitle}>🪙 Cagnotte du tournoi</Text>
            <Text style={[styles.payoutLine, { color: palette.textSecondary }]}>
              Champion : <Text style={styles.payoutBold}>{prizeForSize(t.maxParticipants).champion} coins</Text>
              {'  ·  '}Finaliste : <Text style={styles.payoutBold}>{prizeForSize(t.maxParticipants).runnerUp} coins</Text>
            </Text>
          </View>
        )}
        {t.status === 'finished' && t.rewardsPaid && (
          <View style={[styles.payoutCard, { borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,0.12)' }]}>
            <Text style={styles.payoutTitle}>✅ Récompenses distribuées</Text>
            <Text style={[styles.payoutLine, { color: palette.textSecondary }]}>
              🏆 {t.championDisplayName} : <Text style={styles.payoutBold}>+{t.championCoinsRewarded} coins</Text>
            </Text>
            {t.runnerUpCoinsRewarded > 0 && (
              <Text style={[styles.payoutLine, { color: palette.textSecondary }]}>
                🥈 Finaliste : <Text style={styles.payoutBold}>+{t.runnerUpCoinsRewarded} coins</Text>
              </Text>
            )}
          </View>
        )}

        {/* Action zone */}
        <View style={styles.actions}>
          {/* Active match for current user → primary CTA */}
          {myActiveMatch && myActiveMatch.matchCode && (
            <TouchableOpacity
              onPress={() => router.push(`/game/race/${myActiveMatch.matchCode}`)}
              style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
            >
              <Ionicons name="play-circle" size={20} color="#fff" />
              <Text style={styles.actionBtnText}>Rejoindre ton match</Text>
            </TouchableOpacity>
          )}

          {t.status === 'registration' && me && !isRegistered && !isFull && (
            <TouchableOpacity
              onPress={register}
              disabled={busy}
              style={[styles.actionBtn, { backgroundColor: '#7C3AED', opacity: busy ? 0.6 : 1 }]}
            >
              <Ionicons name="person-add" size={20} color="#fff" />
              <Text style={styles.actionBtnText}>{busy ? '…' : 'S\'inscrire'}</Text>
            </TouchableOpacity>
          )}

          {t.status === 'registration' && isRegistered && !isHost && (
            <View style={[styles.actionBtn, { backgroundColor: 'rgba(16,185,129,0.2)', borderWidth: 1, borderColor: '#10B981' }]}>
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              <Text style={[styles.actionBtnText, { color: '#10B981' }]}>Tu es inscrit · attente</Text>
            </View>
          )}

          {t.status === 'registration' && isHost && (
            <TouchableOpacity
              onPress={start}
              disabled={busy || !isFull}
              style={[styles.actionBtn, { backgroundColor: isFull ? '#F59E0B' : '#475569', opacity: busy ? 0.6 : 1 }]}
            >
              <Ionicons name="flash" size={20} color="#fff" />
              <Text style={styles.actionBtnText}>
                {isFull ? 'Lancer le tournoi' : `Attente (${t.participants.length}/${t.maxParticipants})`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Participants list */}
        <Text style={[styles.sectionHeader, { color: palette.textSecondary }]}>
          PARTICIPANTS ({t.participants.length}/{t.maxParticipants})
        </Text>
        <View style={[styles.participantsCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
          {t.participants.map((p, i) => (
            <TouchableOpacity
              key={p.userId}
              onPress={() => router.push(`/user/${p.userId}`)}
              style={styles.participantRow}
            >
              <Text style={[styles.participantRank, { color: palette.textSecondary }]}>#{i + 1}</Text>
              <Text style={[styles.participantName, {
                color: p.eliminated ? palette.textSecondary : palette.text,
                textDecorationLine: p.eliminated ? 'line-through' : 'none',
              }]} numberOfLines={1}>
                {p.userId === t.hostUserId ? '👑 ' : ''}{p.displayName}
                {p.finalRank ? ` · #${p.finalRank}` : ''}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={palette.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Standings (round-robin only) */}
        {standings && (
          <>
            <Text style={[styles.sectionHeader, { color: palette.textSecondary }]}>
              CLASSEMENT
            </Text>
            <View style={[styles.participantsCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
              {standings.map((s, i) => (
                <View key={s.userId} style={styles.participantRow}>
                  <Text style={[styles.participantRank, { color: i < 2 ? '#FCD34D' : palette.textSecondary }]}>
                    #{i + 1}
                  </Text>
                  <Text style={[styles.participantName, { color: palette.text, flex: 1 }]} numberOfLines={1}>
                    {s.displayName}
                  </Text>
                  <Text style={{ color: '#10B981', fontSize: 13, fontFamily: 'Inter-Black' }}>
                    {s.wins} W
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Bracket */}
        {t.bracket.length > 0 && t.format === 'round-robin' && (
          <>
            <Text style={[styles.sectionHeader, { color: palette.textSecondary }]}>MATCHES</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.bracketWrap}>
                {columns.map((col, i) => (
                  <View key={i} style={styles.bracketCol}>
                    {col.sectionLabel && (
                      <Text style={[styles.bracketSectionLabel, { color: '#FCD34D' }]}>
                        {col.sectionLabel}
                      </Text>
                    )}
                    {col.nodes.map((n) => {
                      const isPlayable = n.matchCode && !n.winnerUserId;
                      return (
                        <TouchableOpacity
                          key={`${n.bracketType ?? 'w'}-${n.round}-${n.position}`}
                          onPress={() => isPlayable && n.matchCode && router.push(`/game/race/${n.matchCode}`)}
                          disabled={!isPlayable}
                          activeOpacity={isPlayable ? 0.85 : 1}
                          style={[styles.bracketNode, {
                            backgroundColor: palette.card,
                            borderColor: isPlayable ? '#0EA5E9' : palette.border,
                          }]}
                        >
                          <BracketSlot
                            name={n.p1DisplayName}
                            isWinner={n.winnerUserId === n.p1UserId}
                            palette={palette}
                          />
                          <View style={[styles.bracketSep, { backgroundColor: palette.border }]} />
                          <BracketSlot
                            name={n.p2DisplayName}
                            isWinner={n.winnerUserId === n.p2UserId}
                            palette={palette}
                          />
                          {isPlayable && <Text style={styles.bracketLive}>● LIVE</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          </>
        )}

        {/* SVG bracket viz : single-elim and double-elim. Renders WB / LB /
            GF as separate sections so the connection lines stay readable
            even at 16p. Round-robin uses the list above instead. */}
        {t.bracket.length > 0 && t.format !== 'round-robin' && (
          <>
            <Text style={[styles.sectionHeader, { color: palette.textSecondary }]}>BRACKET</Text>
            {t.format === 'double-elim' ? (
              <>
                <TournamentBracketViz
                  bracket={t.bracket}
                  filter={(n) => (n.bracketType ?? 'winners') === 'winners'}
                  onTapMatch={(code) => router.push(`/game/race/${code}`)}
                  title="WINNERS BRACKET"
                  palette={palette}
                />
                <TournamentBracketViz
                  bracket={t.bracket}
                  filter={(n) => n.bracketType === 'losers'}
                  onTapMatch={(code) => router.push(`/game/race/${code}`)}
                  title="LOSERS BRACKET"
                  palette={palette}
                />
                <TournamentBracketViz
                  bracket={t.bracket}
                  filter={(n) => n.bracketType === 'grand-final'}
                  onTapMatch={(code) => router.push(`/game/race/${code}`)}
                  title="GRAND FINAL"
                  palette={palette}
                />
              </>
            ) : (
              <TournamentBracketViz
                bracket={t.bracket}
                onTapMatch={(code) => router.push(`/game/race/${code}`)}
                palette={palette}
              />
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function BracketSlot({ name, isWinner, palette }: { name: string | null; isWinner: boolean; palette: any }) {
  return (
    <Text
      style={[
        styles.bracketSlot,
        {
          color: name ? (isWinner ? '#10B981' : palette.text) : palette.textSecondary,
          fontFamily: isWinner ? 'Inter-Black' : 'Inter-Regular',
        },
      ]}
      numberOfLines={1}
    >
      {isWinner ? '✓ ' : ''}{name ?? '— (en attente)'}
    </Text>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 14, gap: 10, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  heroCard: { padding: 16, borderWidth: 1, borderRadius: 14, gap: 4 },
  statusLabel: { fontSize: 10, fontFamily: 'Inter-Black', letterSpacing: 1 },
  heroTitle: { fontSize: 18, fontFamily: 'Inter-Black', marginTop: 2 },
  heroSub: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
  championLine: { fontSize: 14, fontFamily: 'Inter-Black', color: '#FCD34D', marginTop: 6 },

  payoutCard: { padding: 12, borderWidth: 1, borderRadius: 10, gap: 4 },
  payoutTitle: { fontSize: 12, fontFamily: 'Inter-Black', color: '#FCD34D', letterSpacing: 0.5 },
  payoutLine: { fontSize: 12, fontFamily: 'Inter-Regular' },
  payoutBold: { color: '#FCD34D', fontFamily: 'Inter-Black' },

  actions: { gap: 8 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 10,
  },
  actionBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Black' },

  sectionHeader: { fontSize: 10, fontFamily: 'Inter-Black', letterSpacing: 1, marginTop: 8, marginLeft: 4 },
  participantsCard: { borderWidth: 1, borderRadius: 12, padding: 4 },
  participantRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
  participantRank: { fontSize: 12, fontFamily: 'Inter-Black', width: 26 },
  participantName: { flex: 1, fontSize: 13 },

  bracketWrap: { flexDirection: 'row', gap: 12, paddingVertical: 8 },
  bracketCol: { gap: 8, minWidth: 160 },
  bracketRoundLabel: { fontSize: 10, fontFamily: 'Inter-Black', letterSpacing: 1, marginBottom: 4 },
  bracketSectionLabel: { fontSize: 9, fontFamily: 'Inter-Black', letterSpacing: 1.5, marginBottom: 2 },
  bracketNode: { padding: 10, borderWidth: 1, borderRadius: 8, gap: 4 },
  bracketSlot: { fontSize: 12 },
  bracketSep: { height: 1 },
  bracketLive: { color: '#0EA5E9', fontSize: 9, fontFamily: 'Inter-Black', letterSpacing: 1, marginTop: 4 },
  bracketReplay: { fontSize: 9, fontFamily: 'Inter-Regular', marginTop: 2 },
});
