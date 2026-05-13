/**
 * @file (tabs)/multiplayer.tsx
 * @description Hub Multijoueur Solitaire — point d'entrée vers Quick Match,
 * création/jointure de room, défi du jour. Comble le trou de navigation :
 * jusqu'ici les écrans `room/*` et `quick-match` existaient mais n'étaient
 * jamais accessibles depuis le tab navigator.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import { useTheme } from '../../src/contexts/AppProviders';
import { logger } from '../../src/utils/logger';
import * as api from '../../shared/api';

const log = logger.scoped('MultiplayerHub');

type HubAction = {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  gradient: [string, string];
  onPress: () => void;
};

export default function MultiplayerHubScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [busy, setBusy] = useState(false);

  const goQuickMatch = useCallback(() => {
    log.screen('nav → /quick-match');
    router.push('/quick-match');
  }, [router]);

  const goCreateRoom = useCallback(() => {
    log.screen('nav → /room/create');
    router.push('/room/create');
  }, [router]);

  const goJoinRoom = useCallback(() => {
    log.screen('nav → /room/join');
    router.push('/room/join');
  }, [router]);

  const goRaceHistory = useCallback(() => {
    log.screen('nav → /race-history');
    router.push('/race-history');
  }, [router]);

  const goTournaments = useCallback(() => {
    log.screen('nav → /tournaments');
    router.push('/tournaments');
  }, [router]);

  const goDailyChallenge = useCallback(async () => {
    setBusy(true);
    try {
      log.bin('POST /challenges/daily/solitaire/matchmake');
      const room = await api.joinDailyChallenge('solitaire');
      log.bout('200 matchmake', { code: room.code });
      router.push(`/room/lobby?code=${room.code}`);
    } catch (e: any) {
      log.error('daily matchmake failed', e?.message);
      Alert.alert(
        t('error', { defaultValue: 'Erreur' }),
        e?.message || t('matchmakingUnavailable', { defaultValue: 'Matchmaking indisponible' }),
      );
    } finally {
      setBusy(false);
    }
  }, [router, t]);

  const actions: HubAction[] = [
    {
      key: 'quickmatch',
      title: t('multiplayer.quickMatch', { defaultValue: 'Quick Match' }),
      subtitle: t('multiplayer.quickMatchSub', { defaultValue: 'Match 1v1 sur le même deal' }),
      icon: 'flash',
      gradient: ['#7C3AED', '#EC4899'],
      onPress: goQuickMatch,
    },
    {
      key: 'create',
      title: t('multiplayer.createRoom', { defaultValue: 'Créer une room' }),
      subtitle: t('multiplayer.createRoomSub', { defaultValue: 'Invite un adversaire (1v1)' }),
      icon: 'add-circle',
      gradient: ['#16A34A', '#10B981'],
      onPress: goCreateRoom,
    },
    {
      key: 'join',
      title: t('multiplayer.joinRoom', { defaultValue: 'Rejoindre une room' }),
      subtitle: t('multiplayer.joinRoomSub', { defaultValue: 'Entrer un code' }),
      icon: 'log-in',
      gradient: ['#2563EB', '#06B6D4'],
      onPress: goJoinRoom,
    },
    {
      key: 'daily',
      title: t('multiplayer.dailyChallenge', { defaultValue: 'Défi du jour' }),
      subtitle: t('multiplayer.dailyChallengeSub', { defaultValue: 'Matchmaking automatique' }),
      icon: 'trophy',
      gradient: ['#F59E0B', '#EF4444'],
      onPress: goDailyChallenge,
    },
    {
      key: 'history',
      title: t('multiplayer.raceHistory', { defaultValue: 'Mes races' }),
      subtitle: t('multiplayer.raceHistorySub', { defaultValue: 'Historique & replays' }),
      icon: 'time',
      gradient: ['#0EA5E9', '#6366F1'],
      onPress: goRaceHistory,
    },
    {
      key: 'tournaments',
      title: t('multiplayer.tournaments', { defaultValue: 'Tournois' }),
      subtitle: t('multiplayer.tournamentsSub', { defaultValue: 'Bracket 4 / 8 / 16 joueurs' }),
      icon: 'trophy-outline',
      gradient: ['#F59E0B', '#7C3AED'],
      onPress: goTournaments,
    },
  ];

  const styles = createStyles(palette);

  return (
    <View style={styles.root}>
      <LinearGradient colors={palette.bgGradient} style={StyleSheet.absoluteFill} />
      <AppHeader
        title={t('multiplayer.title', { defaultValue: 'Multijoueur' })}
        subtitle={t('multiplayer.subtitle', { defaultValue: 'Affronte d\'autres joueurs ou crée ta room' })}
      />

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.intro, { color: palette.textSecondary }]}>
          {t('multiplayer.intro', { defaultValue: 'Le Solitaire en mode versus : même deal, deux joueurs, premier à terminer ou à marquer le plus de points.' })}
        </Text>

        {actions.map((a) => (
          <TouchableOpacity
            key={a.key}
            onPress={a.onPress}
            disabled={busy}
            activeOpacity={0.85}
            style={[styles.card, busy && { opacity: 0.6 }]}
          >
            <LinearGradient
              colors={a.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardInner}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={a.icon} size={28} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{a.title}</Text>
                <Text style={styles.cardSub}>{a.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.85)" />
            </LinearGradient>
          </TouchableOpacity>
        ))}

        <View style={[styles.note, { borderColor: palette.border, backgroundColor: palette.card }]}>
          <Ionicons name="information-circle" size={18} color={palette.textSecondary} />
          <Text style={[styles.noteText, { color: palette.textSecondary }]}>
            {t('multiplayer.note', { defaultValue: 'Astuce : Quick Match utilise le même deal pour les 2 joueurs — la chance n\'entre pas en jeu, seule l\'efficacité compte.' })}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(palette: ReturnType<typeof useTheme>['palette']) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: palette.bg },
    body: { padding: 14, paddingBottom: 40, gap: 12 },
    intro: { fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 20, marginBottom: 4 },
    card: { borderRadius: 16, overflow: 'hidden' },
    cardInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 18,
    },
    iconWrap: {
      width: 48, height: 48, borderRadius: 24,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center', justifyContent: 'center',
    },
    cardTitle: { color: '#fff', fontSize: 16, fontFamily: 'Inter-Black', letterSpacing: 0.4 },
    cardSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontFamily: 'Inter-SemiBold', marginTop: 2 },
    note: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 8,
    },
    noteText: { flex: 1, fontSize: 12, fontFamily: 'Inter-Regular', lineHeight: 18 },
  });
}

/* === End of (tabs)/multiplayer.tsx — Solitaire — SallyCards === */
