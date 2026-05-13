/**
 * @file GenericStatsBanner.tsx
 * @description Klondike-style 3-stat banner sitting under the GameHeader.
 * Reproduces the `BannerStats` widget defined locally in solo.tsx
 * (MOUVEMENTS / SCORE / RESTANT) but with arbitrary `stats` so each engine
 * can label its own three-cell grid. Examples:
 *
 *   GenericTableau → MOUVEMENTS / FONDATIONS / STOCK
 *   Pairs          → MOUVEMENTS / RETIRÉES / RESTE
 *   Golf           → MOUVEMENTS / SCORE / RESTE
 *   Maze           → MOUVEMENTS / FILLED / RESTE
 *   SpiderV2       → MOUVEMENTS / SUITES / STOCK
 *   Math           → MOUVEMENTS / FONDATIONS / STOCK
 *   Distribution   → MOUVEMENTS / RÉVÉLÉES / RESTE
 *
 * The middle cell uses the app primary color (yellow accent), the outer two
 * stay on the palette text color — same as Klondike.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { APP_CONFIG } from '../config/app.config';

export interface StatCell {
  label: string;
  value: string | number;
  /** Override the text color (default uses palette/text color). */
  color?: string;
}

interface Props {
  stats: [StatCell, StatCell, StatCell];
}

export default function GenericStatsBanner({ stats }: Props) {
  return (
    <LinearGradient
      colors={[APP_CONFIG.primary + '33', 'rgba(255,255,255,0.03)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.banner}
    >
      {stats.map((s, i) => (
        <View key={i} style={styles.cell}>
          <Text style={styles.label}>{s.label}</Text>
          <Text style={[styles.value, { color: s.color ?? (i === 1 ? APP_CONFIG.primary : '#fff') }]}>
            {s.value}
          </Text>
        </View>
      ))}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: 12,
    marginBottom: 8,
  },
  cell: { alignItems: 'center', flex: 1 },
  label: { color: 'rgba(255,255,255,0.55)', fontSize: 10, letterSpacing: 1.2, fontFamily: 'Inter-Bold' },
  value: { fontSize: 18, fontFamily: 'Inter-Black', marginTop: 2 },
});

/* === End of GenericStatsBanner.tsx — Solitaire — SallyCards === */
