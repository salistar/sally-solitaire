/**
 * @file StockPile.tsx
 * @description Composant partagé pour afficher la pioche (stock) sous forme
 * de DOS de carte française au lieu d'un bouton texte. Utilisé par les 7
 * écrans génériques + intégrable n'importe où.
 *
 * Trois états :
 *   1. `count > 0` : dos de carte (assets/cards-fr/back.png) avec badge
 *      compteur jaune en bas à droite indiquant le nombre de cartes restantes.
 *   2. `count === 0 && canRecycle` : emplacement vide avec icône ⟳ — tap
 *      pour recycler la défausse vers le stock.
 *   3. `count === 0 && !canRecycle` : emplacement vide grisé, non tappable.
 *
 * Garde la même empreinte 46×64 que les CardSlot existants pour aligner
 * proprement dans une rangée avec waste + fondations.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import FrenchCard from './FrenchCard';

interface Props {
  count: number;
  canRecycle?: boolean;
  /** Tap handler — déclenche DRAW_STOCK ou RECYCLE_WASTE selon l'état. */
  onPress: () => void;
  width?: number;
  height?: number;
}

export default function StockPile({
  count,
  canRecycle = true,
  onPress,
  width = 46,
  height = 64,
}: Props) {
  const empty = count === 0;
  if (empty && !canRecycle) {
    return (
      <View style={[styles.emptyExhausted, { width, height }]}>
        <Text style={styles.emptyExhaustedText}>✕</Text>
      </View>
    );
  }
  if (empty) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[styles.emptyRecyclable, { width, height }]}>
        <Text style={styles.recycleIcon}>⟳</Text>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{ width, height }}>
      <FrenchCard code="BACK" width={width} height={height} />
      <View style={styles.badge} pointerEvents="none">
        <Text style={styles.badgeText}>{count}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: '#FCD34D',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 22,
    alignItems: 'center',
  },
  badgeText: {
    color: '#0F172A',
    fontSize: 10,
    fontFamily: 'Inter-Black',
  },
  emptyRecyclable: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(252,211,77,0.7)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(252,211,77,0.08)',
  },
  recycleIcon: { color: '#FCD34D', fontSize: 22, fontWeight: '900' },
  emptyExhausted: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255,255,255,0.03)',
    opacity: 0.6,
  },
  emptyExhaustedText: { color: 'rgba(255,255,255,0.4)', fontSize: 18 },
});

/* === End of StockPile.tsx — Solitaire — SallyCards === */
