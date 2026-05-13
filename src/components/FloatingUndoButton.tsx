/**
 * @file FloatingUndoButton.tsx
 * @description Top-right floating undo button. Rendered as an overlay so it
 * works inside any engine screen layout without manual integration. Reads
 * `useUndos` to know if the local history has snapshots AND the user owns
 * undo_pack units in inventory.
 *
 * Three states:
 *   - Hidden: no undos owned (the button doesn't pollute the layout)
 *   - Disabled (greyed): undos owned but nothing to revert (empty history)
 *   - Active: tap to consume 1 undo + restore previous state
 */
import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { useUndos } from '../contexts/useUndos';
import type { UndoController } from '../contexts/useGameWithUndo';

interface Props {
  undoCtl: UndoController;
  /** Optional override for top offset (default 8). */
  top?: number;
  /** Optional override for right offset (default 8). */
  right?: number;
}

export default function FloatingUndoButton({ undoCtl, top = 8, right = 8 }: Props) {
  const undos = useUndos(undoCtl);
  if (undos.remainingInventory <= 0) {
    // Hidden when user owns 0 undo_packs — keeps screen clean
    return null;
  }
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top, right }]}>
      <TouchableOpacity
        style={[styles.btn, !undos.canUndo && styles.btnDim]}
        onPress={undos.tryUndo}
        disabled={!undos.canUndo}
        activeOpacity={0.7}
      >
        <Text style={styles.icon}>↶</Text>
        <Text style={styles.qty}>{undos.remainingInventory}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', zIndex: 99 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: 'rgba(124,58,237,0.85)', borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(252,211,77,0.5)',
  },
  btnDim: { opacity: 0.4 },
  icon: { color: '#fff', fontSize: 16, fontWeight: '900' },
  qty: { color: '#FCD34D', fontSize: 12, fontFamily: 'Inter-Black' },
});
