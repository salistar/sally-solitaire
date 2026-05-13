/**
 * @file game/race/[code].tsx
 * @description 1v1 race wrapper. Loads a SolitaireMatch by code from the API,
 * polls every 1s for the opponent's progress, and embeds the variant's engine
 * screen inside a RaceContext so the embedded screen can report progress.
 *
 * Variant-agnostic: dispatches to the same engine screens used by Solo. The
 * race adds:
 *   - A header showing both players' score / moves / finished status
 *   - Auto-detection of "I finished" or "opponent finished first"
 *   - Result overlay (win / lose) when match.status === 'finished'
 *
 * Powers all 177 variants in 1v1 mode (limited by the underlying engines'
 * support for seeded deals; see "Limites" in PR notes).
 */

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import * as api from '../../../shared/api';
import { findVariant, type Variant } from '../../../src/game/variants';
import { RaceProvider } from '../../../src/contexts/RaceContext';
import { useAchievementToast } from '../../../src/contexts/AchievementToastContext';
import RaceHeader from '../../../src/components/RaceHeader';
import RaceVoiceChat from '../../../src/components/RaceVoiceChat';

// Engine screens — generic engines have their own components, legacy engines
// (klondike/spider/freecell/yukon/golf/pyramid/tripeaks/fortythieves/accordion)
// live in app/game/solo.tsx. For race mode we reuse the Solo route as an
// embedded view: it already imports useRaceReport, so when it mounts inside
// a RaceProvider, its inner screens auto-report progress.
import GenericTableauScreen from '../../../src/components/GenericTableauScreen';
import GenericDistributionScreen from '../../../src/components/GenericDistributionScreen';
import PairsScreen from '../../../src/components/PairsScreen';
import GolfChainScreen from '../../../src/components/GolfScreen';
import MathScreen from '../../../src/components/MathScreen';
import SpiderV2Screen from '../../../src/components/SpiderV2Screen';
import MazeScreen from '../../../src/components/MazeScreen';

// Legacy inline screens from solo.tsx — exported there so race mode can embed them.
// Each calls useRaceReport internally so progress is auto-reported.
import {
  KlondikeScreen, SpiderScreen, FreeCellScreen, YukonScreen, GolfScreen,
  PyramidScreen, TriPeaksScreen, FortyThievesScreen, AccordionScreen,
} from '../solo';

const POLL_MS = 1000;

export default function RaceScreen() {
  const { code: rawCode } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const code = String(rawCode || '').toUpperCase();

  const [match, setMatch] = useState<api.SolitaireMatch | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const achievementToast = useAchievementToast();
  const toastedUnlocksRef = React.useRef(false);

  // Trigger toasts ONCE when match flips to 'finished' with unlocks for current user.
  useEffect(() => {
    if (!match || match.status !== 'finished' || !userId || toastedUnlocksRef.current) return;
    const myUnlocks =
      match.winnerId === userId
        ? match.winnerAchievementsUnlocked
        : match.loserAchievementsUnlocked;
    if (myUnlocks && myUnlocks.length > 0) {
      achievementToast.showAchievements(myUnlocks);
    }
    toastedUnlocksRef.current = true;
  }, [match?.status, match?.winnerId, match?.winnerAchievementsUnlocked, match?.loserAchievementsUnlocked, userId, achievementToast]);

  // Hydrate userId from auth + initial match fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api.getMe().catch(() => null);
        if (cancelled) return;
        const uid = me?.id || ('guest-' + Math.random().toString(36).slice(2, 9));
        setUserId(uid);
        const m = await api.getMatch(code);
        if (cancelled) return;
        if (!m) {
          setError('Match introuvable');
          return;
        }
        setMatch(m);
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message || e));
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  // Poll match state every second
  useEffect(() => {
    if (!code) return;
    const id = setInterval(async () => {
      const m = await api.getMatch(code).catch(() => null);
      if (m) setMatch(m);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [code]);

  if (error) {
    return (
      <View style={s.center}>
        <LinearGradient colors={['#0F172A', '#1E1B4B']} style={StyleSheet.absoluteFill} />
        <Text style={s.error}>{error}</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backBtnText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!match || !userId) {
    return (
      <View style={s.center}>
        <LinearGradient colors={['#0F172A', '#1E1B4B']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color="#A78BFA" />
        <Text style={s.loadingText}>Chargement du match {code}…</Text>
      </View>
    );
  }

  // Resolve the variant + appropriate engine screen
  const v = findVariant(match.variant);
  if (!v) {
    return (
      <View style={s.center}>
        <LinearGradient colors={['#0F172A', '#1E1B4B']} style={StyleSheet.absoluteFill} />
        <Text style={s.error}>Variant inconnu : {match.variant}</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backBtnText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Wait for second player to join
  if (match.status === 'waiting') {
    return (
      <View style={s.center}>
        <LinearGradient colors={['#0F172A', '#1E1B4B']} style={StyleSheet.absoluteFill} />
        <Text style={s.code}>{code}</Text>
        <Text style={s.subtitle}>{v.name}</Text>
        <ActivityIndicator size="large" color="#A78BFA" style={{ marginTop: 24 }} />
        <Text style={s.loadingText}>En attente d'un second joueur…</Text>
        <Text style={s.hint}>Partage ce code avec un ami :</Text>
        <View style={s.codeBox}>
          <Text style={s.codeBig}>{code}</Text>
        </View>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backBtnText}>Annuler</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Match finished — show result overlay with ELO summary
  if (match.status === 'finished' && match.winnerId) {
    const youWon = match.winnerId === userId;
    return (
      <View style={s.center}>
        <LinearGradient colors={youWon ? ['#065F46', '#10B981'] : ['#7F1D1D', '#DC2626']} style={StyleSheet.absoluteFill} />
        <Text style={s.bigResult}>{youWon ? '🏆 Victoire !' : '💀 Vaincu.'}</Text>
        <Text style={s.subtitle}>{v.name} • {code}</Text>
        <View style={{ marginTop: 24 }}>
          <RaceHeader match={match} selfUserId={userId} />
        </View>
        <RaceEloDisplay userId={userId} variant={match.variant} youWon={youWon} />
        <TouchableOpacity
          style={[s.backBtn, { marginTop: 16, backgroundColor: 'rgba(124,58,237,0.95)' }]}
          onPress={() => router.replace(`/quick-match?variant=${encodeURIComponent(match.variant)}`)}
        >
          <Text style={s.backBtnText}>🔁 Revanche (même variante)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.backBtn, { marginTop: 8, backgroundColor: 'rgba(14,165,233,0.85)' }]}
          onPress={() => router.push(`/race-replay/${code}`)}
        >
          <Text style={s.backBtnText}>🎞 Voir le replay</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.backBtn, { marginTop: 8 }]} onPress={() => router.back()}>
          <Text style={s.backBtnText}>Retour au menu</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Active race — header + embedded engine. All 177 variants now have an
  // engine screen that calls useRaceReport internally; the dispatcher just
  // selects the right one based on variant.engine.
  let engineScreen: React.ReactNode = null;
  if (v.engine === 'generic_tableau') engineScreen = <GenericTableauScreen variant={v} />;
  else if (v.engine === 'generic_distribution') engineScreen = <GenericDistributionScreen variant={v} />;
  else if (v.engine === 'pairs') engineScreen = <PairsScreen variant={v} />;
  else if (v.engine === 'golf_chain') engineScreen = <GolfChainScreen variant={v} />;
  else if (v.engine === 'math') engineScreen = <MathScreen variant={v} />;
  else if (v.engine === 'spider_v2') engineScreen = <SpiderV2Screen variant={v} />;
  else if (v.engine === 'maze') engineScreen = <MazeScreen variant={v} />;
  // Legacy engines (live in solo.tsx, exported for race-mode embedding)
  else if (v.engine === 'klondike') engineScreen = <KlondikeScreen variant={v} difficulty={'medium' as any} />;
  else if (v.engine === 'spider') engineScreen = <SpiderScreen variant={v} difficulty={'medium' as any} />;
  else if (v.engine === 'freecell') engineScreen = <FreeCellScreen variant={v} difficulty={'medium' as any} />;
  else if (v.engine === 'yukon') engineScreen = <YukonScreen variant={v} difficulty={'medium' as any} />;
  else if (v.engine === 'golf') engineScreen = <GolfScreen variant={v} difficulty={'medium' as any} />;
  else if (v.engine === 'pyramid') engineScreen = <PyramidScreen variant={v} difficulty={'medium' as any} />;
  else if (v.engine === 'tripeaks') engineScreen = <TriPeaksScreen variant={v} difficulty={'medium' as any} />;
  else if (v.engine === 'fortythieves') engineScreen = <FortyThievesScreen variant={v} difficulty={'medium' as any} />;
  else if (v.engine === 'accordion') engineScreen = <AccordionScreen variant={v} difficulty={'medium' as any} />;
  else {
    engineScreen = (
      <View style={s.placeholderWrap}>
        <Text style={s.placeholderTitle}>{v.name}</Text>
        <Text style={s.placeholderText}>Moteur "{v.engine}" non pris en charge en mode race.</Text>
        <TouchableOpacity
          style={s.reportBtn}
          onPress={() => api.reportMatchProgress(code, { userId, score: 0, moves: 0, finished: true, actions: [] })}
        >
          <Text style={s.reportBtnText}>Déclarer "J'ai fini"</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Extract the deterministic seed from the match. The backend may store it
  // under initialState.seed, dealHash, or — as a guaranteed-shared fallback —
  // the match code itself (which both peers see identically).
  const seed: string =
    (typeof match.initialState === 'object' && match.initialState?.seed != null
      ? String(match.initialState.seed)
      : null) ??
    (match as any).dealHash ??
    code;

  // Live peer-progress handler: when the socket pushes an opponent update,
  // splice it into the local match.players array WITHOUT waiting for the
  // next REST poll. The polling will reconcile authoritative state ~1s later.
  const onPeerProgress = (p: { userId: string; score: number; moves: number; finished: boolean }) => {
    setMatch((prev) => {
      if (!prev) return prev;
      const players = prev.players.map((pl) =>
        pl.userId === p.userId
          ? { ...pl, score: p.score, moves: p.moves, finished: p.finished, finishedAt: p.finished ? Date.now() : pl.finishedAt }
          : pl,
      );
      return { ...prev, players };
    });
  };

  const onFinished = (p: { winnerUserId: string }) => {
    setMatch((prev) => (prev ? { ...prev, status: 'finished', winnerId: p.winnerUserId, finishedAt: Date.now() } : prev));
  };

  const selfDisplayName = match.players.find((p) => p.userId === userId)?.displayName ?? 'Moi';
  const authToken = api.getAuthToken() ?? '';

  return (
    <View style={{ flex: 1 }}>
      <RaceProvider
        code={code}
        userId={userId}
        displayName={selfDisplayName}
        seed={seed}
        onProgressSent={(m) => m && setMatch(m)}
        onPeerProgress={onPeerProgress}
        onFinished={onFinished}
      >
        <RaceHeader match={match} selfUserId={userId} />
        <RaceVoiceChat code={code} displayName={selfDisplayName} authToken={authToken} />
        {engineScreen}
      </RaceProvider>
    </View>
  );
}

/**
 * Tiny inline component that fetches the user's race-ELO right after the
 * match ends and displays it. The backend computes deltas synchronously
 * during the finish-write, so by the time we mount and fetch, the row is
 * already updated.
 */
function RaceEloDisplay({ userId, variant, youWon }: { userId: string; variant: string; youWon: boolean }) {
  const [globalElo, setGlobalElo] = useState<api.RaceEloEntry | null>(null);
  const [variantElo, setVariantElo] = useState<api.RaceEloEntry | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Small delay so the server-side write definitely lands before we fetch
      await new Promise((r) => setTimeout(r, 500));
      const [g, v] = await Promise.all([
        api.fetchUserRaceElo(userId, 'global'),
        api.fetchUserRaceElo(userId, variant),
      ]);
      if (!cancelled) {
        setGlobalElo(g);
        setVariantElo(v);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, variant]);

  if (!globalElo && !variantElo) {
    return (
      <View style={s.eloCard}>
        <Text style={s.eloLoadingText}>Chargement de ton classement…</Text>
      </View>
    );
  }

  return (
    <View style={s.eloCard}>
      <Text style={s.eloHeader}>📊 Classement ELO {youWon ? '↑' : '↓'}</Text>
      {variantElo && (
        <View style={s.eloRow}>
          <Text style={s.eloLabel}>{variant}</Text>
          <Text style={[s.eloValue, youWon && s.eloValueWin, !youWon && s.eloValueLose]}>
            {variantElo.elo}
          </Text>
        </View>
      )}
      {globalElo && (
        <View style={s.eloRow}>
          <Text style={s.eloLabel}>Global</Text>
          <Text style={[s.eloValue, youWon && s.eloValueWin, !youWon && s.eloValueLose]}>
            {globalElo.elo}
          </Text>
        </View>
      )}
      {globalElo && (
        <Text style={s.eloSubText}>
          {globalElo.wins}V • {globalElo.losses}D • {Math.round(globalElo.winRate * 100)}% win rate
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#F87171', fontSize: 16, textAlign: 'center', marginBottom: 16 },
  loadingText: { color: '#C4B5FD', fontSize: 14, marginTop: 12 },
  subtitle: { color: '#A78BFA', fontSize: 13, marginTop: 4 },
  hint: { color: '#9CA3AF', fontSize: 12, marginTop: 24 },
  code: { color: '#FCD34D', fontSize: 22, fontFamily: 'Inter-Black' },
  codeBox: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(124,58,237,0.25)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.4)' },
  codeBig: { color: '#FCD34D', fontSize: 32, fontFamily: 'Inter-Black', letterSpacing: 4 },
  backBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 16 },
  backBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Bold' },
  bigResult: { color: '#fff', fontSize: 42, fontFamily: 'Inter-Black' },
  eloCard: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 16, borderRadius: 14, backgroundColor: 'rgba(15,11,40,0.6)', borderWidth: 1, borderColor: 'rgba(252,211,77,0.3)', minWidth: 260, alignItems: 'center' },
  eloHeader: { color: '#FCD34D', fontSize: 14, fontFamily: 'Inter-Black', marginBottom: 8, letterSpacing: 1 },
  eloRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingVertical: 3 },
  eloLabel: { color: '#C4B5FD', fontSize: 13 },
  eloValue: { color: '#fff', fontSize: 16, fontFamily: 'Inter-Black' },
  eloValueWin: { color: '#10B981' },
  eloValueLose: { color: '#F87171' },
  eloLoadingText: { color: '#9CA3AF', fontSize: 12, fontStyle: 'italic' },
  eloSubText: { color: '#9CA3AF', fontSize: 11, marginTop: 6 },
  placeholderWrap: { padding: 32, alignItems: 'center', justifyContent: 'center', flex: 1 },
  placeholderTitle: { color: '#FCD34D', fontSize: 22, fontFamily: 'Inter-Black', marginBottom: 12 },
  placeholderText: { color: '#C4B5FD', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  reportBtn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, backgroundColor: '#7C3AED' },
  reportBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Black' },
});
