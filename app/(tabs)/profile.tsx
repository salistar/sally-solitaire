/**
 * @file (tabs)/profile.tsx
 * @description Profil Solitaire avec vraies valeurs (stats/coins/achievements/
 * recent games) depuis le backend. Synchronisé à chaque focus.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import { useTheme } from '../../src/contexts/AppProviders';
import { useIsLocal } from '../../src/contexts/useAppMode';
import { logger } from '../../src/utils/logger';
import * as api from '../../shared/api';

const HERO = require('../../assets/hero/welcome-deck.jpg');
const log = logger.scoped('ProfileScreen');

function StatCard({ icon, label, value, color, palette }: any) {
  return (
    <LinearGradient colors={palette.cardGradient} style={[statStyles.card, { borderColor: palette.border }]}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[statStyles.value, { color: palette.text }]}>{value}</Text>
      <Text style={[statStyles.label, { color: palette.textSecondary }]}>{label}</Text>
    </LinearGradient>
  );
}
const statStyles = StyleSheet.create({
  card: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1 },
  value: { fontSize: 18, fontFamily: 'Inter-Black', marginTop: 4 },
  label: { fontSize: 10, fontFamily: 'Inter-Regular', marginTop: 2 },
});

export default function ProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = createStyles(palette);
  const isLocal = useIsLocal();
  const [user, setUser] = useState<any>(null);
  const [rank, setRank] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Solitaire ecosystem (race + daily rewards) — orthogonal to the legacy
  // `user.stats` aggregate. Fetched best-effort, never blocks the page.
  const [raceElo, setRaceElo] = useState<api.RaceEloEntry | null>(null);
  const [rewards, setRewards] = useState<api.UserRewards | null>(null);

  useEffect(() => {
    log.screen('mounted');
    // Local mode = no account, no /users/me, no rank. Skip all backend calls.
    if (isLocal) {
      log.explain('mode local — aucun appel backend, UI offline');
      return;
    }
    (async () => {
      // 1) /users/me : critique
      try {
        log.bin('GET /users/me');
        const u: any = await api.getMe();
        log.bout('200 /users/me', { username: u.username, elo: u.elo });
        setUser(u);
        setLoadError(null);

        // 1a) Solitaire ecosystem stats — fire after we have a userId.
        // Failures are silent: the section just hides or shows zeros.
        api.fetchUserRaceElo(u.id, 'global').then(setRaceElo).catch(() => {});
        api.fetchUserRewards(u.id).then(setRewards).catch(() => {});
      } catch (e: any) {
        // NoSessionError = no token in memory. Don't redirect (could be a
        // legit guest UI that just hasn't logged in yet). Don't log noise.
        if (e?.name === 'NoSessionError') {
          log.explain('pas de session — UI invite à se connecter');
          return;
        }
        const msg = e?.message ?? e?.toString?.() ?? 'unknown';
        const status = e?.status ?? '?';
        log.error('GET /users/me failed', { status, msg });
        if (status === 401 || /unauthorized/i.test(msg)) {
          router.replace('/auth/welcome');
          return;
        }
        setLoadError(msg);
      }
      // 2) /leaderboards/solitaire/my-rank : best-effort
      try {
        log.bin('GET /leaderboards/solitaire/my-rank');
        const r = await api.getMyRank('solitaire', 'season');
        log.bout('200 my-rank', r);
        setRank(r);
        log.explain('profil + rang chargés');
      } catch (e: any) {
        const status = e?.status ?? '?';
        if (status === 404) log.explain('pas encore de rang solitaire pour ce joueur');
        else if (status === 401) log.explain('rang non chargé — pas de session');
        else log.error('GET /my-rank failed (non bloquant)', { status, msg: e?.message });
      }
    })();
  }, [isLocal]);

  // Local mode: no account, no backend stats. Show a focused offline profile
  // with a CTA to switch to cloud mode if the user wants online features.
  if (isLocal) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={palette.bgGradient} style={StyleSheet.absoluteFill} />
        <AppHeader title={t('profile')} />
        <View style={{ padding: 24, alignItems: 'center', marginTop: 40, gap: 14 }}>
          <Ionicons name="person-circle-outline" size={84} color={palette.textSecondary} />
          <Text style={{ color: palette.text, fontSize: 18, fontFamily: 'Inter-Black' }}>
            Mode local
          </Text>
          <Text style={{ color: palette.textSecondary, fontSize: 13, textAlign: 'center', maxWidth: 280, lineHeight: 18 }}>
            Tu joues hors-ligne. Aucun compte requis. Tes parties restent sur cet appareil.
          </Text>
          <TouchableOpacity
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingHorizontal: 18, paddingVertical: 12,
              borderRadius: 10, backgroundColor: '#7C3AED', marginTop: 8,
            }}
            onPress={() => router.push('/auth/mode-select')}
          >
            <Ionicons name="cloud-upload" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontFamily: 'Inter-Bold', fontSize: 13 }}>
              Passer en mode connecté
            </Text>
          </TouchableOpacity>
          <Text style={{ color: palette.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 12, maxWidth: 260 }}>
            Le mode connecté débloque : classements mondiaux, multijoueur 1v1, tournois, daily challenge, achievements en ligne.
          </Text>
        </View>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={palette.bgGradient} style={StyleSheet.absoluteFill} />
        <AppHeader title={t('profile')} />
        {loadError ? (
          <View style={{ padding: 24, alignItems: 'center', marginTop: 40 }}>
            <Ionicons name="cloud-offline-outline" size={42} color={palette.textSecondary} />
            <Text style={{ textAlign: 'center', color: palette.text, marginTop: 12, fontFamily: 'Inter-Bold' }}>
              {t('error')}
            </Text>
            <Text style={{ textAlign: 'center', color: palette.textSecondary, marginTop: 6 }}>
              {loadError}
            </Text>
          </View>
        ) : (
          <Text style={{ textAlign: 'center', color: palette.textSecondary, marginTop: 30 }}>
            {t('loading')}
          </Text>
        )}
      </View>
    );
  }

  const stats = user.stats || {};
  const location = user.location || {};
  const achievements = user.achievements || [];
  const recent = user.recentGames || [];

  return (
    <View style={styles.container}>
      <LinearGradient colors={palette.bgGradient} style={StyleSheet.absoluteFill} />
      <AppHeader title={t('profile') ?? 'Profil'} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Hero + avatar */}
        <ImageBackground source={HERO} style={styles.hero} imageStyle={styles.heroImg}>
          <LinearGradient
            colors={['rgba(124,58,237,0.25)', 'rgba(10,10,26,0.85)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.avatarWrap}>
            <LinearGradient colors={palette.accentGradient} style={styles.avatarRing}>
              <View style={styles.avatarInner}>
                <Ionicons name="person" size={48} color="#fff" />
              </View>
            </LinearGradient>
          </View>
          <Text style={styles.heroUsername}>{user.username}</Text>
          {location.city && (
            <View style={styles.locationRow}>
              <Ionicons name="location" size={12} color="rgba(255,255,255,0.75)" />
              <Text style={styles.locationText}>
                {location.city}, {location.countryName || location.country}
              </Text>
            </View>
          )}
          {rank?.rank && (
            <View style={styles.rankBadge}>
              <Ionicons name="trophy" size={14} color="#F59E0B" />
              <Text style={styles.rankBadgeText}>Rang #{rank.rank} · top {100 - rank.percentile}%</Text>
            </View>
          )}
          <TouchableOpacity style={styles.editButton} onPress={() => router.push('/settings')}>
            <Ionicons name="pencil" size={12} color="#fff" />
            <Text style={styles.editButtonText}>{t('edit')}</Text>
          </TouchableOpacity>
        </ImageBackground>

        {/* Coins + Diamonds */}
        <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 14, marginTop: 10 }}>
          <LinearGradient colors={['#F59E0B', '#D97706']} style={[styles.walletCard, { flex: 1 }]}>
            <Ionicons name="wallet" size={22} color="#fff" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.walletValue}>{user.coins ?? 0}</Text>
              <Text style={styles.walletLabel}>{t('walletCoins')}</Text>
            </View>
            <TouchableOpacity style={styles.shopBtn} onPress={() => router.push('/shop')}>
              <Text style={styles.shopBtnText}>+</Text>
            </TouchableOpacity>
          </LinearGradient>
          <LinearGradient colors={['#06B6D4', '#0891B2']} style={[styles.walletCard, { flex: 1 }]}>
            <Ionicons name="diamond" size={22} color="#fff" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.walletValue}>{user.diamonds ?? 0}</Text>
              <Text style={styles.walletLabel}>{t('walletDiamonds')}</Text>
            </View>
          </LinearGradient>
        </View>

        {/* ─── Solitaire ecosystem : Race ELO + Daily rewards ──────────── */}
        {/* This section bridges the legacy `user.stats` aggregate (above) and
           the new solitaire-specific layers (race ELO, daily rewards, shop,
           achievements). Each card is tappable and routes to the matching
           feature screen. Hidden if both data sources are still loading. */}
        {(raceElo || rewards) && (
          <View style={styles.soloSection}>
            <Text style={[styles.sectionTitle, { color: palette.text, marginLeft: 0, marginTop: 0 }]}>
              🎯 Solitaire Race & Daily
            </Text>

            <View style={styles.soloStatsRow}>
              {raceElo && (
                <TouchableOpacity
                  onPress={() => router.push('/leaderboard-race')}
                  activeOpacity={0.85}
                  style={[styles.soloStatCard, { backgroundColor: palette.card, borderColor: palette.border }]}
                >
                  <Text style={styles.soloStatValue}>{raceElo.elo}</Text>
                  <Text style={[styles.soloStatLabel, { color: palette.textSecondary }]}>RACE ELO</Text>
                  <Text style={[styles.soloStatSub, { color: palette.textSecondary }]}>
                    {raceElo.wins}V · {raceElo.losses}D · {Math.round(raceElo.winRate * 100)}%
                  </Text>
                </TouchableOpacity>
              )}

              {rewards && (
                <TouchableOpacity
                  onPress={() => router.push('/daily-challenge')}
                  activeOpacity={0.85}
                  style={[styles.soloStatCard, { backgroundColor: palette.card, borderColor: palette.border }]}
                >
                  <Text style={[styles.soloStatValue, { color: '#EF4444' }]}>🔥 {rewards.dailyStreak}</Text>
                  <Text style={[styles.soloStatLabel, { color: palette.textSecondary }]}>STREAK</Text>
                  <Text style={[styles.soloStatSub, { color: palette.textSecondary }]}>
                    Best {rewards.bestStreak} · {rewards.xp} XP
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Quick-nav grid : 4 entry points to the solitaire ecosystem.
                Same pattern as the multiplayer hub — chips with icon + label. */}
            <View style={styles.soloLinksGrid}>
              <TouchableOpacity
                style={[styles.soloLinkChip, { backgroundColor: palette.card, borderColor: palette.border }]}
                onPress={() => router.push('/race-history')}
              >
                <Ionicons name="time" size={16} color="#0EA5E9" />
                <Text style={[styles.soloLinkText, { color: palette.text }]}>Mes races</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.soloLinkChip, { backgroundColor: palette.card, borderColor: palette.border }]}
                onPress={() => router.push('/achievements-online')}
              >
                <Ionicons name="trophy" size={16} color="#F59E0B" />
                <Text style={[styles.soloLinkText, { color: palette.text }]}>Achievements</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.soloLinkChip, { backgroundColor: palette.card, borderColor: palette.border }]}
                onPress={() => router.push('/spend')}
              >
                <Ionicons name="cart" size={16} color="#A78BFA" />
                <Text style={[styles.soloLinkText, { color: palette.text }]}>Boutique</Text>
              </TouchableOpacity>
              {user?.id && (
                <TouchableOpacity
                  style={[styles.soloLinkChip, { backgroundColor: palette.card, borderColor: palette.border }]}
                  onPress={() => router.push(`/user/${user.id}`)}
                >
                  <Ionicons name="person" size={16} color="#10B981" />
                  <Text style={[styles.soloLinkText, { color: palette.text }]}>Profil public</Text>
                </TouchableOpacity>
              )}
            </View>

            {rewards && rewards.coins > 0 && (
              <View style={[styles.soloRewardsBalance, { borderColor: palette.border }]}>
                <Text style={[styles.soloRewardsBalanceText, { color: palette.textSecondary }]}>
                  🪙 {rewards.coins} coins gagnés à dépenser en boutique items
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Stats grid 3x2 */}
        <View style={styles.statsGrid}>
          <View style={styles.statsRow}>
            <StatCard icon="game-controller" label={t('statGames')} value={stats.gamesPlayed || 0} color="#3B82F6" palette={palette} />
            <View style={{ width: 8 }} />
            <StatCard icon="trophy" label={t('statWins')} value={stats.gamesWon || 0} color="#F59E0B" palette={palette} />
            <View style={{ width: 8 }} />
            <StatCard icon="trending-up" label={t('elo')} value={stats.elo || 1000} color="#10B981" palette={palette} />
          </View>
          <View style={[styles.statsRow, { marginTop: 8 }]}>
            <StatCard icon="flame" label={t('statStreak')} value={stats.winStreak || 0} color="#EF4444" palette={palette} />
            <View style={{ width: 8 }} />
            <StatCard icon="medal" label={t('statBest')} value={stats.bestWinStreak || 0} color="#A855F7" palette={palette} />
            <View style={{ width: 8 }} />
            <StatCard icon="analytics" label={t('winRate')} value={`${user.winRate || 0}%`} color="#14B8A6" palette={palette} />
          </View>
        </View>

        {/* Achievements */}
        {achievements.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>
              🏅 {t('achievements')} ({achievements.length})
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 14 }}>
              {achievements.map((a: any) => (
                <LinearGradient
                  key={a.id}
                  colors={palette.accentGradient}
                  style={styles.achievementPill}
                >
                  <Ionicons name="star" size={14} color="#fff" />
                  <Text style={styles.achievementText}>{a.name}</Text>
                </LinearGradient>
              ))}
            </ScrollView>
          </>
        )}

        {/* Recent games */}
        <Text style={[styles.sectionTitle, { color: palette.text }]}>📜 {t('recentGames')}</Text>
        {recent.length === 0 ? (
          <LinearGradient colors={palette.cardGradient} style={[styles.emptyState, { borderColor: palette.border }]}>
            <Ionicons name="game-controller-outline" size={42} color={palette.textSecondary} />
            <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
              {t('noRecentGames')}
            </Text>
          </LinearGradient>
        ) : (
          recent.map((g: any, i: number) => (
            <LinearGradient
              key={i}
              colors={palette.cardGradient}
              style={[styles.gameRow, { borderColor: palette.border }]}
            >
              <Ionicons
                name={g.result === 'win' ? 'checkmark-circle' : 'close-circle'}
                size={28}
                color={g.result === 'win' ? palette.success : palette.danger}
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.gameOpponent, { color: palette.text }]}>
                  vs {g.opponent}
                </Text>
                <Text style={[styles.gameMeta, { color: palette.textSecondary }]}>
                  {new Date(g.playedAt).toLocaleDateString('fr-FR')} · {Math.round((g.durationMs || 0) / 60000)} min
                </Text>
              </View>
              <Text style={[styles.gameElo, { color: g.eloChange > 0 ? palette.success : palette.danger }]}>
                {g.eloChange > 0 ? '+' : ''}{g.eloChange} ELO
              </Text>
            </LinearGradient>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(palette: ReturnType<typeof useTheme>['palette']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.bg },
    scrollContent: { padding: 0, paddingBottom: 40 },

    hero: { height: 260, alignItems: 'center', justifyContent: 'center', paddingTop: 16 },
    heroImg: { opacity: 0.95 },
    avatarWrap: { marginBottom: 8 },
    avatarRing: {
      width: 92, height: 92, borderRadius: 46,
      alignItems: 'center', justifyContent: 'center',
    },
    avatarInner: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: '#1E1B3A', alignItems: 'center', justifyContent: 'center',
    },
    heroUsername: { fontSize: 22, fontFamily: 'Inter-Black', color: '#fff', letterSpacing: 0.5 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    locationText: { fontSize: 11, fontFamily: 'Inter-Regular', color: 'rgba(255,255,255,0.75)' },
    rankBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: 'rgba(245,158,11,0.2)',
      borderWidth: 1, borderColor: 'rgba(245,158,11,0.6)',
      paddingHorizontal: 10, paddingVertical: 4,
      borderRadius: 999, marginTop: 6,
    },
    rankBadgeText: { color: '#F59E0B', fontSize: 11, fontFamily: 'Inter-Bold' },
    editButton: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: '#7C3AED',
      paddingHorizontal: 14, paddingVertical: 6,
      borderRadius: 999, marginTop: 8,
    },
    editButtonText: { color: '#fff', fontSize: 11, fontFamily: 'Inter-Bold' },

    walletCard: {
      flexDirection: 'row', alignItems: 'center',
      borderRadius: 14, padding: 14,
    },
    walletValue: { color: '#fff', fontSize: 18, fontFamily: 'Inter-Black' },
    walletLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontFamily: 'Inter-SemiBold' },
    shopBtn: {
      backgroundColor: 'rgba(255,255,255,0.2)',
      width: 28, height: 28, borderRadius: 14,
      alignItems: 'center', justifyContent: 'center',
    },
    shopBtnText: { color: '#fff', fontSize: 20, fontWeight: '900', lineHeight: 22 },

    statsGrid: { padding: 14 },
    statsRow: { flexDirection: 'row' },

    soloSection: { paddingHorizontal: 14, paddingTop: 14, gap: 10 },
    soloStatsRow: { flexDirection: 'row', gap: 8 },
    soloStatCard: {
      flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', gap: 2,
    },
    soloStatValue: { color: '#FCD34D', fontSize: 20, fontFamily: 'Inter-Black' },
    soloStatLabel: { fontSize: 9, fontFamily: 'Inter-Black', letterSpacing: 1, marginTop: 2 },
    soloStatSub: { fontSize: 10, fontFamily: 'Inter-Regular', marginTop: 2 },
    soloLinksGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    soloLinkChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
    },
    soloLinkText: { fontSize: 12, fontFamily: 'Inter-Bold' },
    soloRewardsBalance: {
      padding: 10, borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, marginTop: 4,
    },
    soloRewardsBalanceText: { fontSize: 11, fontFamily: 'Inter-Regular', textAlign: 'center' },

    sectionTitle: { fontSize: 14, fontFamily: 'Inter-Bold', marginHorizontal: 14, marginTop: 10, marginBottom: 8 },
    achievementPill: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 12, paddingVertical: 8,
      borderRadius: 999, marginRight: 8,
    },
    achievementText: { color: '#fff', fontSize: 12, fontFamily: 'Inter-Bold' },

    emptyState: {
      alignItems: 'center', paddingVertical: 24,
      marginHorizontal: 14, borderRadius: 12, borderWidth: 1, gap: 6,
    },
    emptyText: { fontSize: 13, fontFamily: 'Inter-SemiBold' },

    gameRow: {
      flexDirection: 'row', alignItems: 'center',
      marginHorizontal: 14, marginBottom: 6,
      padding: 12, borderRadius: 12, borderWidth: 1,
    },
    gameOpponent: { fontSize: 14, fontFamily: 'Inter-SemiBold' },
    gameMeta: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
    gameElo: { fontSize: 13, fontFamily: 'Inter-Black' },
  });
}
