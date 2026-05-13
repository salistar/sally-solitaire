/**
 * @file auth/mode-select.tsx
 * @description Mode selection screen — appears after onboarding and before login.
 * Lets the user choose between offline (local) play and online (cloud) play.
 *
 * - "Partie Solo Hors-ligne" → no account needed, no network calls, fully local
 *   (uses bundled solitaire deals + local stats only).
 * - "Mode Connecté Multijoueur" → goes to /auth/login for account + cloud sync
 *   (leaderboards, friends, multiplayer rooms, replays, etc.).
 *
 * The mode choice is persisted in AsyncStorage under `app.mode` so the rest
 * of the app can branch on `mode === 'local'` vs `'cloud'`.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ImageBackground, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { BrandLogo } from '../../src/components/BrandLogo';
import { APP_CONFIG } from '../../src/config/app.config';
import { logger } from '../../src/utils/logger';
import * as api from '../../shared/api';
import { useAppMode } from '../../src/contexts/useAppMode';

const APP_COLOR = APP_CONFIG.primary;
const SPLASH_BG = require('../../assets/hero/splash-cards.jpg');
const log = logger.scoped('ModeSelect');

export default function ModeSelectScreen() {
  // Use the `screens` namespace so the i18n fallback resolves regardless of
  // whether the user is on en/fr/ar/es/darija. Old `?? 'fallback'` pattern
  // is removed: i18next returns the key string itself when missing, which
  // makes nullish-coalesce a no-op (the fallback never fires).
  const { t } = useTranslation('screens');

  useEffect(() => {
    log.screen('mounted');
  }, []);

  const { setMode } = useAppMode();
  const selectMode = async (mode: 'local' | 'cloud') => {
    log.explain(`utilisateur a choisi mode '${mode}' — persiste via AppModeProvider`);
    await setMode(mode);
    if (mode === 'local') {
      // Local mode = no backend session. Wipe any lingering tokens from
      // previous cloud-mode runs so HomeScreen's getMe() short-circuits
      // immediately (NoSessionError) instead of spamming /users/me 401s.
      try { await api.logout(); } catch { /* best-effort */ }
      router.replace('/(tabs)');
    } else {
      router.replace('/auth/login');
    }
  };

  return (
    <ImageBackground source={SPLASH_BG} style={{ flex: 1 }} resizeMode="cover">
      <LinearGradient
        colors={['rgba(10,10,26,0.92)', 'rgba(30,27,75,0.96)', 'rgba(10,10,26,1)']}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        {/* Scroll wrapper: previous flex:1 + flex:1 cardsContainer pushed the
            header off the top and the footnote behind the cloud card on
            smaller screens. ScrollView + contentContainerStyle lets the
            layout grow naturally and scroll when content > viewport. */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={s.header}>
            <BrandLogo size={84} />
            <View style={s.titleRow}>
              <Text style={s.sallyText}>Sally</Text>
              <Text style={[s.appNameText, { color: APP_COLOR }]}> Solitaire</Text>
            </View>
            <Text style={s.subtitle}>{t('modeSelect.subtitle')}</Text>
          </View>

          <View style={s.cardsContainer}>
            <ModeCard
              badge={t('modeSelect.local.badge')}
              badgeColor="#34D399"
              title={t('modeSelect.local.title')}
              description={t('modeSelect.local.desc')}
              features={[
                t('modeSelect.local.f1'),
                t('modeSelect.local.f2'),
                t('modeSelect.local.f3'),
              ]}
              gradient={['#065F46', '#10B981']}
              onPress={() => selectMode('local')}
            />

            <ModeCard
              badge={t('modeSelect.cloud.badge')}
              badgeColor="#A78BFA"
              title={t('modeSelect.cloud.title')}
              description={t('modeSelect.cloud.desc')}
              features={[
                t('modeSelect.cloud.f1'),
                t('modeSelect.cloud.f2'),
                t('modeSelect.cloud.f3'),
              ]}
              gradient={['#7C3AED', '#C026D3']}
              recommendedLabel={t('modeSelect.recommendedBadge')}
              onPress={() => selectMode('cloud')}
            />
          </View>

          <Text style={s.footnote}>{t('modeSelect.footnote')}</Text>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

function ModeCard({
  badge,
  badgeColor,
  title,
  description,
  features,
  gradient,
  recommendedLabel,
  onPress,
}: {
  badge: string;
  badgeColor: string;
  title: string;
  description: string;
  features: string[];
  gradient: [string, string];
  /** Label shown on the "recommended" pill (already translated by caller). */
  recommendedLabel?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={s.cardOuter}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.cardGradient}
      >
        <View style={s.cardInner}>
          <View style={s.badgeRow}>
            <View style={[s.badge, { backgroundColor: badgeColor }]}>
              <Text style={s.badgeText}>{badge}</Text>
            </View>
            {recommendedLabel && (
              <View style={s.recommendedBadge}>
                <Text style={s.recommendedText}>{recommendedLabel}</Text>
              </View>
            )}
          </View>
          <Text style={s.cardTitle}>{title}</Text>
          <Text style={s.cardDesc}>{description}</Text>
          <View style={s.featuresList}>
            {features.map((f, i) => (
              <View key={i} style={s.featureRow}>
                <View style={s.checkDot}>
                  <Text style={s.checkText}>✓</Text>
                </View>
                <Text style={s.featureText}>{f}</Text>
              </View>
            ))}
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 22 },
  // ScrollView content fills the screen on tall devices (justifyContent
  // centers vertically) but grows naturally on small ones so everything
  // remains reachable via swipe instead of getting clipped.
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  header: { alignItems: 'center', paddingTop: 8, marginBottom: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 16 },
  sallyText: { fontSize: 28, fontFamily: 'Inter-Black', color: '#fff' },
  appNameText: { fontSize: 28, fontFamily: 'Inter-Black' },
  subtitle: { fontSize: 15, color: '#C4B5FD', marginTop: 8, textAlign: 'center', paddingHorizontal: 24 },

  // No more flex:1 — let the cards size naturally so the ScrollView's
  // contentContainer governs vertical centering (tall device) vs scroll
  // (short device).
  cardsContainer: { gap: 14 },
  cardOuter: { borderRadius: 22, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 16 },
  cardGradient: { padding: 1.5, borderRadius: 22 },
  cardInner: { backgroundColor: 'rgba(15,11,40,0.94)', borderRadius: 21, padding: 22 },

  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { color: '#000', fontSize: 11, fontFamily: 'Inter-Black', letterSpacing: 1.2 },
  recommendedBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(252,211,77,0.5)' },
  recommendedText: { color: '#FCD34D', fontSize: 10, fontFamily: 'Inter-Bold', letterSpacing: 1.2 },

  cardTitle: { fontSize: 22, color: '#fff', fontFamily: 'Inter-Black', marginBottom: 8 },
  cardDesc: { fontSize: 14, color: '#CBD5E1', lineHeight: 20, marginBottom: 14 },

  featuresList: { gap: 8 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkDot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(167,139,250,0.18)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.5)' },
  checkText: { color: '#A78BFA', fontSize: 11, fontWeight: '900' },
  featureText: { color: '#E9D5FF', fontSize: 13, flex: 1 },

  footnote: { color: '#6B7280', fontSize: 12, textAlign: 'center', paddingVertical: 18 },
});

/* === End of auth/mode-select.tsx — Solitaire — SallyCards === */
