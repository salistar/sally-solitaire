/**
 * @file (tabs)/index.tsx
 * @description Home Solitaire — SOLO FIRST.
 *
 * Le Solitaire est un jeu solo : pas de room, pas de simulation par caméra,
 * pas de Jitsi/P2P. La CTA principale ouvre le sélecteur de variantes
 * (Klondike, Spider, FreeCell). On garde aussi l'AI Gemini (vs bot — utile
 * pour des coachings/hints) et le défi du jour pour la rétention.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  ImageBackground,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import { useTheme } from '../../src/contexts/AppProviders';
import { logger } from '../../src/utils/logger';
import * as api from '../../shared/api';
import { computeStreakState, type StreakState } from '../../src/game/daily-reminder';
import { useLocalNotifications } from '../../src/contexts/useLocalNotifications';
import { useExpoPushRegistration } from '../../src/contexts/useExpoPushRegistration';
import { useIsLocal } from '../../src/contexts/useAppMode';

const HERO_IMG = require('../../assets/hero/home-table.jpg');
const log = logger.scoped('HomeScreen');

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  // Separate `screens` namespace handle for the banners (streak, pending
  // tournament match). Avoids polluting the common ns with screen-specific keys.
  const { t: tS } = useTranslation('screens');
  const { palette } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<api.User | null>(null);
  const [challenge, setChallenge] = useState<any>(null);
  const [streakState, setStreakState] = useState<StreakState | null>(null);
  const [pendingTournamentMatches, setPendingTournamentMatches] = useState<api.PendingTournamentMatch[]>([]);
  const notifications = useLocalNotifications();
  const isLocal = useIsLocal();
  // Register device for remote push notifications once the user is loaded.
  // Hook is idempotent + handles tap-to-route via the `routeTo` data field.
  useExpoPushRegistration(user ? { id: user.id, username: user.username } : null);

  const load = useCallback(async () => {
    // Local mode = no backend. Skip all fetches; cloud sections hide
    // automatically because their data stays null.
    if (isLocal) {
      log.explain('home : mode local, aucun fetch backend');
      return;
    }
    try {
      log.bin('GET /users/me');
      const u = await api.getMe();
      log.bout('200 /users/me', { username: u.username, elo: u.elo, coins: (u as any).coins });
      setUser(u);
      log.bin('GET /challenges/daily/solitaire');
      const ch = await api.getDailyChallenge('solitaire');
      if (ch) {
        log.bout('200 /challenges/daily/solitaire', { title: ch.title, reward: ch.rewardCoins });
        setChallenge(ch);
      }
      // Fetch the daily rewards row to derive the streak banner state.
      // Best-effort — failures hide the banner without breaking the page.
      if (u?.id) {
        api.fetchUserRewards(u.id).then((r) => {
          setStreakState(computeStreakState(r));
        }).catch(() => {});
        // Pending tournament matches — surfaces a CTA when the user has a
        // bracket match awaiting their play.
        api.fetchPendingTournamentMatches(u.id).then(setPendingTournamentMatches).catch(() => {});
      }
      log.explain('accueil chargé — stats et défi du jour prêts');
    } catch (e: any) {
      // NoSessionError = legit local-mode user, no token. Don't log noise.
      if (e?.name === 'NoSessionError') {
        log.explain('mode local sans session — skip backend, UI fonctionne offline');
        return;
      }
      log.error('load home failed', e);
    }
  }, []);

  useEffect(() => {
    log.screen(`mounted (mode=${isLocal ? 'local' : 'cloud'})`);
    load();
  }, [load, isLocal]);

  // Poll for new pending tournament matches every 20s while the screen is
  // mounted. Cheap (1 request, indexed query) and lets the banner appear
  // even if the user was already on the home screen when a bracket advanced.
  // Skipped entirely in local mode — no user, no tournaments.
  useEffect(() => {
    if (isLocal || !user?.id) return;
    const id = setInterval(() => {
      api.fetchPendingTournamentMatches(user.id).then(setPendingTournamentMatches).catch(() => {});
    }, 20_000);
    return () => clearInterval(id);
  }, [user?.id, isLocal]);

  // Fire a local notification the first time we see each pending match. The
  // useLocalNotifications hook dedupes per `matchCode`, so the same pending
  // match triggers the notification exactly once per app session.
  useEffect(() => {
    for (const m of pendingTournamentMatches) {
      notifications.notify(
        `tournament-match-ready:${m.matchCode}`,
        '🏆 Match prêt',
        `Tournoi ${m.tournamentCode} · vs ${m.opponentDisplayName ?? 'opposant'} (${m.variant})`,
      );
    }
  }, [pendingTournamentMatches, notifications]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // SOLO Solitaire : la CTA principale ouvre la liste des variantes.
  const handlePlay = () => {
    log.screen('nav → /game/variants');
    router.push('/game/variants');
  };

  // Raccourcis vers une variante déjà connue (sans passer par les règles).
  const goVariant = (key: string) => {
    log.screen(`nav → /game/rules?variant=${key}`);
    router.push(`/game/rules?variant=${key}`);
  };

  const handleVsBot = () => {
    log.screen('nav → /game/local?mode=bot (race vs bot)');
    router.push('/game/local?mode=bot&botCount=1&difficulty=expert');
  };

  const goMultiplayer = () => {
    log.screen('nav → /multiplayer');
    router.push('/multiplayer');
  };

  const goQuickMatch = () => {
    log.screen('nav → /quick-match');
    router.push('/quick-match');
  };

  const handleChallenge = async () => {
    log.bin('POST /challenges/daily/solitaire/matchmake');
    try {
      const room = await api.joinDailyChallenge('solitaire');
      log.bout('200 matchmake', { code: room.code });
      log.explain(`matchmaking défi du jour → room ${room.code}`);
      router.push(`/room/lobby?code=${room.code}`);
    } catch (e: any) {
      log.error('daily matchmake failed', e?.message);
      Alert.alert(t('error'), e?.message || t('matchmakingUnavailable'));
    }
  };

  const styles = createStyles(palette);

  return (
    <View style={styles.root}>
      <LinearGradient colors={palette.bgGradient} style={StyleSheet.absoluteFill} />
      <AppHeader
        title="Solitaire"
        subtitle="Bluff · Stratégie · Victoire"
        rightSlot={
          // Wallet badge is cloud-only — points to the IAP shop. Hidden in
          // local mode to keep the header clean and consistent with the
          // "no backend in local" promise.
          isLocal ? null : (
            <TouchableOpacity onPress={() => router.push('/shop')} style={styles.coinsHeader}>
              <Ionicons name="wallet" size={16} color="#F59E0B" />
              <Text style={styles.coinsHeaderText}>{(user as any)?.coins ?? 0}</Text>
            </TouchableOpacity>
          )
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />}
      >
        {/* Hero photo */}
        <ImageBackground source={HERO_IMG} style={styles.hero} imageStyle={styles.heroImg}>
          <LinearGradient
            colors={['rgba(10,10,26,0.1)', 'rgba(10,10,26,0.85)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroBadge}>
            <Ionicons name="flame" size={14} color="#fff" />
            <Text style={styles.heroBadgeText}>{t('live')}</Text>
          </View>
          <View style={styles.heroBottom}>
            <Text style={styles.heroTitle}>
              {isLocal
                ? t('heroWelcomeGuest')
                : (user ? t('heroWelcomeUser', { name: user.username }) : t('heroWelcomeGuest'))}
            </Text>
            {/* Hide ELO + city in local mode — they'd just show 1000 / Paris
                placeholder values that have nothing to do with the user. */}
            {!isLocal && (
              <Text style={styles.heroSubtitle}>
                {t('elo')} {user?.elo ?? 1000} · {(user as any)?.location?.city || t('defaultCity')}
              </Text>
            )}
          </View>
        </ImageBackground>

        {/* Pending tournament match banner — top priority CTA. Shown when
            the user has at least one bracket match awaiting them, regardless
            of streak state. Tap → straight into the race screen. */}
        {pendingTournamentMatches.length > 0 && (
          <TouchableOpacity
            onPress={() => router.push(`/game/race/${pendingTournamentMatches[0].matchCode}`)}
            activeOpacity={0.85}
            style={{ borderRadius: 14, overflow: 'hidden', marginTop: 12 }}
          >
            <LinearGradient
              colors={['#FCD34D', '#D97706']}
              style={styles.tournamentBanner}
            >
              <Text style={styles.tournamentIcon}>🏆</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.tournamentTitle}>
                  {pendingTournamentMatches.length === 1
                    ? tS('home.tournamentBanner.ready', { code: pendingTournamentMatches[0].tournamentCode })
                    : tS('home.tournamentBanner.readyMany', { count: pendingTournamentMatches.length })}
                </Text>
                <Text style={styles.tournamentSub}>
                  {pendingTournamentMatches.length === 1
                    ? tS('home.tournamentBanner.subOne', {
                        opp: pendingTournamentMatches[0].opponentDisplayName ?? 'opp.',
                        variant: pendingTournamentMatches[0].variant,
                      })
                    : tS('home.tournamentBanner.subMany')}
                </Text>
              </View>
              <Ionicons name="play-circle" size={28} color="rgba(0,0,0,0.55)" />
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Streak-at-risk banner — only shown when the user has an active
            streak but hasn't claimed today's reward yet. Color + label scale
            with urgency: info / warning (< 6h) / urgent (< 2h). Tap routes
            straight to /daily-challenge so they can claim. */}
        {streakState && streakState.streakAtRisk && (
          <TouchableOpacity
            onPress={() => router.push('/daily-challenge')}
            activeOpacity={0.85}
            style={{ borderRadius: 14, overflow: 'hidden', marginTop: 12 }}
          >
            <LinearGradient
              colors={
                streakState.urgency === 'urgent'
                  ? ['#DC2626', '#7F1D1D']
                  : streakState.urgency === 'warning'
                    ? ['#F59E0B', '#92400E']
                    : ['#7C3AED', '#4C1D95']
              }
              style={styles.streakBanner}
            >
              <Text style={styles.streakIcon}>🔥</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.streakTitle}>
                  {streakState.urgency === 'urgent'
                    ? tS('home.streakBanner.urgentTitle', { n: streakState.streak })
                    : streakState.urgency === 'warning'
                      ? tS('home.streakBanner.warningTitle', { n: streakState.streak })
                      : tS('home.streakBanner.infoTitle', { n: streakState.streak })}
                </Text>
                <Text style={styles.streakSub}>
                  {streakState.hoursUntilMidnightUtc < 1
                    ? tS('home.streakBanner.subUnderHour')
                    : tS('home.streakBanner.subWithHours', { h: Math.floor(streakState.hoursUntilMidnightUtc) })}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.85)" />
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* SOLO — CTA principale : ouvre le sélecteur de variantes */}
        <TouchableOpacity style={{ borderRadius: 18, overflow: 'hidden', marginTop: 12 }} onPress={handlePlay} activeOpacity={0.88}>
          <LinearGradient colors={palette.accentGradient} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.heroCta}>
            <View style={styles.heroCtaIconWrap}>
              <Ionicons name="play" size={32} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroCtaTitle}>{t('home.playCta')}</Text>
              <Text style={styles.heroCtaSub}>{t('home.playCtaSub')}</Text>
            </View>
            <View style={styles.heroCtaBadge}>
              <Text style={styles.heroCtaBadgeText}>{t('home.soloBadge')}</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Variantes + AI coach + Daily : ALL hidden in local mode.
            User requirement : in local mode only the big "Jouer maintenant"
            CTA above remains. Quick-variant shortcuts (klondike-1, spider-2,
            freecell) duplicate the /game/variants flow they'd reach via
            "Jouer maintenant" anyway, so removing them is no loss.
            vs Bot is also hidden because the bot path needs cloud (AI key /
            backend Gemini proxy). */}
        {!isLocal && (
          <>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionCard} onPress={() => goVariant('klondike-1')} activeOpacity={0.85}>
                <LinearGradient colors={['#2563EB', '#06B6D4']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.actionGradient}>
                  <Text style={{ fontSize: 32 }}>🃏</Text>
                  <Text style={styles.actionTitle}>{t('home.shortKlondike')}</Text>
                  <Text style={styles.actionSub}>{t('home.klondikeShort')}</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionCard} onPress={() => goVariant('spider-2')} activeOpacity={0.85}>
                <LinearGradient colors={['#7C3AED', '#EC4899']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.actionGradient}>
                  <Text style={{ fontSize: 32 }}>🕷</Text>
                  <Text style={styles.actionTitle}>{t('home.shortSpider')}</Text>
                  <Text style={styles.actionSub}>{t('home.spider2Short')}</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionCard} onPress={() => goVariant('freecell')} activeOpacity={0.85}>
                <LinearGradient colors={['#10B981', '#059669']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.actionGradient}>
                  <Text style={{ fontSize: 32 }}>🧠</Text>
                  <Text style={styles.actionTitle}>{t('home.shortFreeCell')}</Text>
                  <Text style={styles.actionSub}>{t('home.freecellShort')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionCard} onPress={handleVsBot} activeOpacity={0.85}>
                <LinearGradient colors={['#0EA5E9', '#3B82F6']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.actionGradient}>
                  <Ionicons name="sparkles" size={28} color="#fff" />
                  <Text style={styles.actionTitle}>{t('vsGemini')}</Text>
                  <Text style={styles.actionSub}>{t('home.vsBotShort')}</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionCard} onPress={handleChallenge} activeOpacity={0.85}>
                <LinearGradient colors={['#F59E0B', '#EF4444']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.actionGradient}>
                  <Ionicons name="trophy-outline" size={28} color="#fff" />
                  <Text style={styles.actionTitle}>{t('dailyChallenge')}</Text>
                  <Text style={styles.actionSub}>{t('dailyChallengeReward', { coins: challenge?.rewardCoins ?? 50 })}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Multijoueur + Quick Match — cloud-only. Hidden in local mode
            (no account, no socket auth, no opponent to race). */}
        {!isLocal && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionCard} onPress={goMultiplayer} activeOpacity={0.85}>
              <LinearGradient colors={['#7C3AED', '#EC4899']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.actionGradient}>
                <Ionicons name="people" size={28} color="#fff" />
                <Text style={styles.actionTitle}>{t('multiplayer.title', { defaultValue: 'Multijoueur' })}</Text>
                <Text style={styles.actionSub}>{t('multiplayer.shortHub', { defaultValue: 'Rooms · Versus' })}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={goQuickMatch} activeOpacity={0.85}>
              <LinearGradient colors={['#16A34A', '#10B981']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.actionGradient}>
                <Ionicons name="flash" size={28} color="#fff" />
                <Text style={styles.actionTitle}>{t('multiplayer.quickMatch', { defaultValue: 'Quick Match' })}</Text>
                <Text style={styles.actionSub}>{t('multiplayer.shortQM', { defaultValue: '1v1 · même deal' })}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* Local-mode prompt to unlock online features */}
        {isLocal && (
          <TouchableOpacity
            style={{ borderRadius: 16, overflow: 'hidden', marginTop: 12 }}
            onPress={() => router.push('/auth/mode-select')}
            activeOpacity={0.85}
          >
            <LinearGradient colors={['#7C3AED', '#4C1D95']} start={{x:0,y:0}} end={{x:1,y:1}} style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons name="cloud-upload" size={28} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 14, fontFamily: 'Inter-Black' }}>
                  Débloquer le mode connecté
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontFamily: 'Inter-SemiBold', marginTop: 2 }}>
                  Classements · Multijoueur · Tournois · Daily challenge
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.85)" />
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Daily challenge details — cloud only */}
        {!isLocal && challenge && (
          <LinearGradient colors={palette.cardGradient} style={[styles.card, { borderColor: palette.border }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="star" size={20} color={palette.gold} />
              <Text style={[styles.cardTitle, { color: palette.text }]}>{challenge.title}</Text>
              <View style={styles.badgeNew}>
                <Text style={styles.badgeText}>+{challenge.rewardCoins}</Text>
              </View>
            </View>
            <Text style={[styles.cardDescription, { color: palette.textSecondary }]}>
              {challenge.description}
            </Text>
            <TouchableOpacity onPress={handleChallenge} style={styles.challengeBtn}>
              <LinearGradient colors={['#F59E0B', '#FBBF24']} style={styles.challengeGrad}>
                <Text style={styles.challengeText}>{t('startChallenge')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        )}

        {/* Stats grid — cloud only (numbers come from /users/me). Local mode
            doesn't sync to backend so the row would be all zeros. */}
        {!isLocal && (
          <LinearGradient colors={palette.cardGradient} style={[styles.statsRow, { borderColor: palette.border }]}>
            <Stat value={String((user as any)?.stats?.gamesPlayed ?? 0)} label={t('statGames')} palette={palette} />
            <View style={[styles.divider, { backgroundColor: palette.border }]} />
            <Stat value={String((user as any)?.stats?.gamesWon ?? 0)} label={t('statWins')} palette={palette} />
            <View style={[styles.divider, { backgroundColor: palette.border }]} />
            <Stat value={`${user?.winRate ?? 0}%`} label={t('statWinRate')} palette={palette} />
            <View style={[styles.divider, { backgroundColor: palette.border }]} />
            <Stat value={String((user as any)?.stats?.bestWinStreak ?? 0)} label={t('statBestStreak')} palette={palette} />
          </LinearGradient>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ value, label, palette }: { value: string; label: string; palette: ReturnType<typeof useTheme>['palette'] }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 18, fontFamily: 'Inter-Black', color: palette.text }}>{value}</Text>
      <Text style={{ fontSize: 10, fontFamily: 'Inter-Regular', color: palette.textSecondary, marginTop: 3 }}>
        {label}
      </Text>
    </View>
  );
}

function createStyles(palette: ReturnType<typeof useTheme>['palette']) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: palette.bg },
    scrollContent: { padding: 14, paddingBottom: 32 },

    coinsHeader: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: 'rgba(245,158,11,0.15)',
      borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
    },
    coinsHeaderText: { color: '#F59E0B', fontSize: 13, fontFamily: 'Inter-Black' },

    hero: { height: 150, borderRadius: 18, overflow: 'hidden', justifyContent: 'flex-end' },
    heroImg: { borderRadius: 18 },
    heroBadge: {
      position: 'absolute', top: 12, right: 12,
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: '#DC2626', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    },
    heroBadgeText: { color: '#fff', fontSize: 10, fontFamily: 'Inter-Black', letterSpacing: 1 },
    heroBottom: { padding: 16 },
    heroTitle: { color: '#fff', fontSize: 20, fontFamily: 'Inter-Black', letterSpacing: 0.5 },
    heroSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontFamily: 'Inter-SemiBold', marginTop: 2 },

    actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    actionCard: { flex: 1, borderRadius: 16, overflow: 'hidden' },
    actionGradient: { alignItems: 'center', paddingVertical: 16, gap: 4 },
    actionTitle: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Black', letterSpacing: 0.5, marginTop: 4 },
    actionSub: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontFamily: 'Inter-SemiBold' },

    heroCta: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      paddingHorizontal: 18, paddingVertical: 20,
    },
    heroCtaIconWrap: {
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center', justifyContent: 'center',
    },
    heroCtaTitle: { color: '#fff', fontSize: 18, fontFamily: 'Inter-Black', letterSpacing: 0.5 },
    heroCtaSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontFamily: 'Inter-SemiBold', marginTop: 2 },
    heroCtaBadge: {
      backgroundColor: 'rgba(255,255,255,0.2)',
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    },
    heroCtaBadgeText: { color: '#fff', fontSize: 10, fontFamily: 'Inter-Black', letterSpacing: 1 },

    card: { borderRadius: 16, padding: 16, marginTop: 12, borderWidth: 1 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    cardTitle: { fontSize: 16, fontFamily: 'Inter-Bold', flex: 1 },
    cardDescription: { fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 19, marginBottom: 12 },
    badgeNew: { backgroundColor: '#F59E0B', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2 },
    badgeText: { color: '#fff', fontSize: 11, fontFamily: 'Inter-Black' },
    challengeBtn: { borderRadius: 12, overflow: 'hidden' },
    challengeGrad: { paddingVertical: 12, alignItems: 'center' },
    challengeText: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Bold' },

    statsRow: {
      flexDirection: 'row', borderRadius: 16, padding: 14,
      alignItems: 'center', borderWidth: 1, marginTop: 12,
    },
    divider: { width: 1, height: 28 },

    streakBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 14, paddingVertical: 12,
    },
    streakIcon: { fontSize: 28 },
    streakTitle: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Black', letterSpacing: 0.3 },
    streakSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontFamily: 'Inter-SemiBold', marginTop: 2 },

    tournamentBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 14, paddingVertical: 12,
    },
    tournamentIcon: { fontSize: 28 },
    tournamentTitle: { color: '#1F2937', fontSize: 14, fontFamily: 'Inter-Black', letterSpacing: 0.3 },
    tournamentSub: { color: 'rgba(31,41,55,0.85)', fontSize: 11, fontFamily: 'Inter-SemiBold', marginTop: 2 },
  });
}
