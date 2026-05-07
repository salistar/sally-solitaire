/**
 * @file game/variants.tsx — Sélecteur de variantes Solitaire.
 * Liste toutes les variantes du catalog avec leur difficulté, % de victoire, durée.
 * Tap sur une variante → écran "rules" qui détaille les règles, puis le bouton "Jouer"
 * lance la partie via /game/solo?variant=<key>.
 */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import { useTheme } from '../../src/contexts/AppProviders';
import { APP_CONFIG } from '../../src/config/app.config';
import { VARIANTS, type Variant } from '../../src/game/variants';

/** Pull localized name + shortDesc for a variant key (falls back to embedded FR). */
function useVariantLabels() {
  const { t } = useTranslation();
  return (v: Variant) => ({
    name: t(`variant.${v.key}.name`, { defaultValue: v.name }),
    shortDesc: t(`variant.${v.key}.shortDesc`, { defaultValue: v.shortDesc }),
  });
}

const Stars = ({ count }: { count: number }) => (
  <Text style={{ fontSize: 12, color: '#F59E0B', letterSpacing: 1 }}>
    {'⭐'.repeat(count) + '☆'.repeat(5 - count)}
  </Text>
);

export default function VariantsScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const { t } = useTranslation();
  const labels = useVariantLabels();

  const goToRules = (key: string) => {
    router.push(`/game/rules?variant=${key}`);
  };

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <LinearGradient colors={palette.bgGradient as any} style={StyleSheet.absoluteFill} />
      <AppHeader
        title={t('variants.title') || 'Choix du Solitaire'}
        subtitle={t('variants.subtitle', { count: VARIANTS.length }) || `${VARIANTS.length} variantes — toutes jouables`}
        showBack
      />

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.intro, { color: palette.textSecondary }]}>
          {t('variants.intro')}
        </Text>

        {VARIANTS.map((v: Variant) => {
          const lbl = labels(v);
          return (
            <TouchableOpacity
              key={v.key}
              onPress={() => goToRules(v.key)}
              style={[styles.card, { borderColor: palette.border, opacity: v.available ? 1 : 0.55 }]}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={v.available
                  ? [APP_CONFIG.primary + '22', palette.card]
                  : ['rgba(255,255,255,0.04)', palette.card]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.cardInner}
              >
                <View style={styles.cardLeft}>
                  <Text style={styles.cardEmoji}>{v.emoji}</Text>
                </View>

                <View style={styles.cardMid}>
                  <View style={styles.cardTitleRow}>
                    <Text style={[styles.cardTitle, { color: palette.text }]}>{lbl.name}</Text>
                    {!v.available && (
                      <View style={styles.soonBadge}>
                        <Text style={styles.soonText}>{t('variants.soonBadge')}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.cardDesc, { color: palette.textSecondary }]} numberOfLines={2}>
                    {lbl.shortDesc}
                  </Text>
                  <View style={styles.cardMeta}>
                    <Stars count={v.difficulty} />
                    <Text style={[styles.metaItem, { color: palette.textSecondary }]}>
                      🏆 {v.winRate}
                    </Text>
                    <Text style={[styles.metaItem, { color: palette.textSecondary }]}>
                      ⏱ {v.duration}
                    </Text>
                    <Text style={[styles.metaItem, { color: palette.textSecondary }]}>
                      🎴 {v.cards}
                    </Text>
                  </View>
                </View>

                <Ionicons name="chevron-forward" size={22} color={palette.textSecondary} />
              </LinearGradient>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 14, paddingBottom: 40 },
  intro: { fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 20, marginBottom: 14 },
  card: { borderRadius: 14, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  cardInner: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  cardLeft: { width: 40, alignItems: 'center' },
  cardEmoji: { fontSize: 30 },
  cardMid: { flex: 1, gap: 4 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontFamily: 'Inter-Black', letterSpacing: 0.5, flexShrink: 1 },
  soonBadge: { backgroundColor: '#F59E0B', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  soonText: { color: '#fff', fontSize: 9, fontFamily: 'Inter-Black', letterSpacing: 1 },
  cardDesc: { fontSize: 12, fontFamily: 'Inter-Regular', lineHeight: 16 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, alignItems: 'center' },
  metaItem: { fontSize: 11, fontFamily: 'Inter-SemiBold' },
});
