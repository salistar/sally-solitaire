/**
 * @file game/rules.tsx — Affiche les règles détaillées d'une variante.
 * Bouton "Jouer" → /game/solo?variant=<key>.
 */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import { useTheme } from '../../src/contexts/AppProviders';
import { useIsLocal } from '../../src/contexts/useAppMode';
import { APP_CONFIG } from '../../src/config/app.config';
import { findVariant } from '../../src/game/variants';
import { fetchRandomSpiderV2Deal } from '../../shared/api';

export default function RulesScreen() {
  const { variant } = useLocalSearchParams<{ variant: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const { t } = useTranslation();
  const v = findVariant(variant ?? 'klondike-1');
  const [pickedDifficulty, setPickedDifficulty] = React.useState<'easy' | 'medium' | 'hard'>('medium');
  const [loadingBD, setLoadingBD] = React.useState(false);
  const isSpiderVariant = v?.key?.startsWith('spider-') ?? false;
  const isLocal = useIsLocal();

  if (!v) {
    return (
      <View style={[styles.root, { backgroundColor: palette.bg }]}>
        <AppHeader title={t('rules.notFoundTitle')} showBack />
        <Text style={{ color: palette.text, padding: 20 }}>{t('rules.notFoundBody')}</Text>
      </View>
    );
  }

  const localizedName = t(`variant.${v.key}.name`, { defaultValue: v.name });
  const localizedShort = t(`variant.${v.key}.shortDesc`, { defaultValue: v.shortDesc });

  /**
   * Bouton "Jouer" :
   *   - Pour SPIDER : on utilise systématiquement les deals BD (vrai mélange
   *     random + solvable garanti). Si la BD est inaccessible, on tombe sur la
   *     génération locale.
   *   - Pour les autres variantes : génération locale comme avant.
   */
  /** Map clé app (spider-1) → variant en BD ('1-suit'). */
  const spiderKeyToBdVariant = (key: string): string | undefined => {
    if (key === 'spider-1') return '1-suit';
    if (key === 'spider-2') return '2-suit';
    if (key === 'spider-4') return '4-suit';
    return undefined;
  };

  const play = async () => {
    if (!v) return;
    // Local mode = pas de backend. Skip fetchRandomSpiderV2Deal + drop
    // `fromBD=true` pour que useBDFirstLoad ne tente jamais de hit l'API.
    // Le générateur TS local fait le boulot intégralement.
    if (isLocal) {
      router.push(`/game/solo?variant=${v.key}&difficulty=${pickedDifficulty}`);
      return;
    }
    // STRATÉGIE BD-FIRST (cloud uniquement) : toutes les variantes utilisent
    // les deals validés de la BD (deal_seeds pour la plupart, spider_deals_v2
    // pour spider-1) car les générateurs locaux peuvent produire des solutions
    // tronquées → bouton "indice" tombe à court de coups → blocage faux-positif.
    //
    //   - spider-1 : fetch direct spider_deals_v2 (qualité Python, +turns[])
    //   - autres variantes : fromBD=true → useBDFirstLoad fetch random
    //     deal_seeds, recharge initialState ET solution stockée. Le hint
    //     suit alors la solution BD jusqu'à la victoire.
    if (v.key === 'spider-1') {
      setLoadingBD(true);
      try {
        const deal = await fetchRandomSpiderV2Deal(pickedDifficulty, '1-suit');
        if (deal) {
          router.push(
            `/game/solo?variant=${v.key}&difficulty=${pickedDifficulty}&fromBD=true&dealId=${encodeURIComponent(deal._id)}`,
          );
          return;
        }
        console.warn(`[Rules] Aucun deal BD spider-1/${pickedDifficulty}, fallback deal_seeds`);
      } catch (err: any) {
        console.warn('[Rules] spider_deals_v2 inaccessible, fallback deal_seeds :', err?.message ?? err);
      } finally {
        setLoadingBD(false);
      }
    }
    // Toutes les autres variantes (et fallback spider-1) : fromBD=true
    // → useBDFirstLoad charge un deal validé depuis deal_seeds.
    router.push(`/game/solo?variant=${v.key}&difficulty=${pickedDifficulty}&fromBD=true`);
  };

  /**
   * Start "depuis BD" :
   *   - Spider : fetch depuis spider_deals_v2 (Python, vrais mélanges)
   *   - Autres variantes : fetch depuis deal_seeds (TS auto-généré, 100/variante)
   *
   * Si aucun deal BD dispo → Alert et fallback local.
   */
  const playFromBD = async () => {
    if (!v) return;
    setLoadingBD(true);
    try {
      // Pour spider-1 UNIQUEMENT : utilise spider_deals_v2 (deals Python avec
      // turns[] pré-calculés, vrais mélanges aléatoires authentiques).
      if (v.key === 'spider-1') {
        const deal = await fetchRandomSpiderV2Deal(pickedDifficulty, '1-suit');
        if (deal) {
          router.push(
            `/game/solo?variant=${v.key}&difficulty=${pickedDifficulty}&fromBD=true&dealId=${encodeURIComponent(deal._id)}`,
          );
          return;
        }
        // Fallback sur deal_seeds si spider_deals_v2 vide pour cette difficulté
        console.warn(`[Rules] spider_deals_v2 vide pour spider-1/${pickedDifficulty}, fallback deal_seeds`);
      }
      // Pour TOUTES les autres variantes (spider-2, spider-4, klondike, etc.) :
      // utilise le mécanisme deal_seeds via useBDFirstLoad. Pas de dealId =
      // sélection random côté client par useBDFirstLoad au montage.
      router.push(
        `/game/solo?variant=${v.key}&difficulty=${pickedDifficulty}&fromBD=true`,
      );
    } catch (err: any) {
      Alert.alert('Erreur', `Impossible de charger un deal BD : ${err?.message ?? err}`);
    } finally {
      setLoadingBD(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <LinearGradient colors={palette.bgGradient as any} style={StyleSheet.absoluteFill} />
      <AppHeader title={localizedName} subtitle={localizedShort} showBack />

      <ScrollView contentContainerStyle={styles.body}>
        {/* Hero */}
        <LinearGradient
          colors={[APP_CONFIG.primary + '33', palette.card]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { borderColor: palette.border }]}
        >
          <Text style={styles.heroEmoji}>{v.emoji}</Text>
          <Text style={[styles.heroName, { color: palette.text }]}>{localizedName}</Text>
          <View style={styles.heroMetaRow}>
            <View style={styles.metaItem}>
              <Text style={[styles.metaLabel, { color: palette.textSecondary }]}>{t('rules.metaDifficulty')}</Text>
              <Text style={[styles.metaValue, { color: '#F59E0B' }]}>
                {'⭐'.repeat(v.difficulty)}{'☆'.repeat(5 - v.difficulty)}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={[styles.metaLabel, { color: palette.textSecondary }]}>{t('rules.metaWin')}</Text>
              <Text style={[styles.metaValue, { color: '#10B981' }]}>{v.winRate}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={[styles.metaLabel, { color: palette.textSecondary }]}>{t('rules.metaDuration')}</Text>
              <Text style={[styles.metaValue, { color: palette.text }]}>{v.duration}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={[styles.metaLabel, { color: palette.textSecondary }]}>{t('rules.metaCards')}</Text>
              <Text style={[styles.metaValue, { color: palette.text }]}>{v.cards}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Règles section */}
        <Text style={[styles.sectionTitle, { color: palette.text }]}>{t('rules.sectionTitle')}</Text>
        {v.rules.map((rule, i) => {
          const ruleTitle = t(`variant.${v.key}.rules.${i}.title`, { defaultValue: rule.title });
          const ruleBody = t(`variant.${v.key}.rules.${i}.body`, { defaultValue: rule.body });
          return (
            <LinearGradient
              key={i}
              colors={[palette.card, 'rgba(0,0,0,0.0)']}
              style={[styles.ruleCard, { borderColor: palette.border }]}
            >
              <View style={styles.ruleHeader}>
                <View style={[styles.ruleNumber, { backgroundColor: APP_CONFIG.primary }]}>
                  <Text style={styles.ruleNumberText}>{i + 1}</Text>
                </View>
                <Text style={[styles.ruleTitle, { color: palette.text }]}>{ruleTitle}</Text>
              </View>
              <Text style={[styles.ruleBody, { color: palette.textSecondary }]}>
                {ruleBody}
              </Text>
            </LinearGradient>
          );
        })}

        {/* Difficulty picker */}
        {v.available && (
          <View style={styles.diffSection}>
            <Text style={[styles.diffSectionTitle, { color: palette.text }]}>{t('rules.pickDifficulty')}</Text>
            <View style={styles.diffRow}>
              {(['easy', 'medium', 'hard'] as const).map((d) => {
                const colors: Record<string, string> = { easy: '#10B981', medium: '#F59E0B', hard: '#EF4444' };
                const selected = pickedDifficulty === d;
                return (
                  <TouchableOpacity key={d} onPress={() => setPickedDifficulty(d)}
                    style={[styles.diffBtn, { borderColor: colors[d], backgroundColor: selected ? colors[d] : 'transparent' }]}>
                    <Text style={[styles.diffBtnLabel, { color: selected ? '#fff' : colors[d] }]}>
                      {t(`rules.diff.${d}`)}
                    </Text>
                    <Text style={[styles.diffBtnHint, { color: selected ? 'rgba(255,255,255,0.85)' : palette.textSecondary }]}>
                      {d === 'easy' ? '∞ ' + t('rules.diff.hints') : d === 'medium' ? '3 ' + t('rules.diff.hints') : t('rules.diff.noHints')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* CTA — en mode cloud 2 boutons (Local OU BD), en mode local
            UN SEUL bouton "Jouer maintenant" (le backend n'est pas accessible). */}
        {v.available ? (
          <>
            {/* Bouton 1 : Génération LOCALE (TS engine). En mode local on
                drop le suffixe "(Local)" — c'est le seul mode de jeu, pas
                besoin de désambiguïser. En mode cloud, l'utilisateur a
                aussi le choix "(BD)" donc on garde l'étiquette claire. */}
            <TouchableOpacity
              onPress={play}
              disabled={loadingBD}
              style={[styles.playBtn, { backgroundColor: APP_CONFIG.primary, opacity: loadingBD ? 0.55 : 1 }]}
              activeOpacity={0.85}
            >
              <Ionicons name={loadingBD ? 'cloud-download-outline' : 'play'} size={22} color="#fff" />
              <Text style={styles.playText}>
                {loadingBD
                  ? 'Chargement…'
                  : isLocal
                    ? t('rules.playNow')
                    : isSpiderVariant
                      ? `${t('rules.playNow')} (BD)`
                      : `${t('rules.playNow')} (Local)`}
              </Text>
            </TouchableOpacity>

            {/* Bouton 2 : DONNE BD — caché en mode local (le backend
                MongoDB n'est pas accessible). */}
            {!isLocal && (
              <TouchableOpacity
                onPress={playFromBD}
                disabled={loadingBD}
                style={[styles.playBtn, { backgroundColor: '#0EA5E9', marginTop: 10, opacity: loadingBD ? 0.55 : 1 }]}
                activeOpacity={0.85}
              >
                <Ionicons name="server-outline" size={20} color="#fff" />
                <Text style={styles.playText}>
                  {isSpiderVariant ? 'Donne BD (forcer)' : 'Donne BD (depuis MongoDB)'}
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <View style={[styles.unavailable, { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: '#F59E0B' }]}>
            <Ionicons name="time-outline" size={20} color="#F59E0B" />
            <Text style={[styles.unavailableText, { color: '#F59E0B' }]}>
              {t('rules.comingSoon')}
            </Text>
          </View>
        )}

        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { borderColor: palette.border }]}>
          <Ionicons name="arrow-back" size={16} color={palette.text} />
          <Text style={[styles.backText, { color: palette.text }]}>{t('rules.chooseAnother')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 14, paddingBottom: 40 },
  hero: { padding: 18, borderRadius: 16, borderWidth: 1, alignItems: 'center', marginBottom: 18 },
  heroEmoji: { fontSize: 56, marginBottom: 8 },
  heroName: { fontSize: 22, fontFamily: 'Inter-Black', letterSpacing: 0.5, marginBottom: 12 },
  heroMetaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', width: '100%', gap: 10 },
  metaItem: { alignItems: 'center', flex: 1, minWidth: 70 },
  metaLabel: { fontSize: 9, fontFamily: 'Inter-Bold', letterSpacing: 1 },
  metaValue: { fontSize: 14, fontFamily: 'Inter-Black', marginTop: 4 },

  sectionTitle: { fontSize: 16, fontFamily: 'Inter-Black', marginBottom: 10 },
  ruleCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  ruleHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  ruleNumber: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  ruleNumberText: { color: '#fff', fontSize: 11, fontFamily: 'Inter-Black' },
  ruleTitle: { fontSize: 14, fontFamily: 'Inter-Bold', flex: 1 },
  ruleBody: { fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 19, marginLeft: 34 },

  playBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    padding: 16, borderRadius: 14, marginTop: 18,
  },
  playText: { color: '#fff', fontSize: 16, fontFamily: 'Inter-Black', letterSpacing: 0.5 },

  unavailable: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 18,
  },
  unavailableText: { fontSize: 12, fontFamily: 'Inter-SemiBold', flex: 1 },

  backBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: 12, borderRadius: 12, borderWidth: 1, marginTop: 12,
  },
  backText: { fontSize: 13, fontFamily: 'Inter-SemiBold' },

  diffSection: { marginTop: 18, padding: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)' },
  diffSectionTitle: { fontSize: 14, fontFamily: 'Inter-Bold', marginBottom: 10 },
  diffRow: { flexDirection: 'row', gap: 8 },
  diffBtn: { flex: 1, borderWidth: 2, borderRadius: 10, padding: 10, alignItems: 'center' },
  diffBtnLabel: { fontSize: 14, fontFamily: 'Inter-Black', letterSpacing: 0.5 },
  diffBtnHint: { fontSize: 10, fontFamily: 'Inter-SemiBold', marginTop: 4 },
});
