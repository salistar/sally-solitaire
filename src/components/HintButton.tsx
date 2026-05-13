/**
 * @file HintButton.tsx
 * @description Difficulty-aware hint pill rendered in the header rightSlot
 * of each generic engine screen. Mirrors the Klondike "💡 3" badge visual:
 *
 *   - Easy   → "💡 ∞" (always tappable, no decrement)
 *   - Medium → "💡 N" (decrement on press)
 *   - Hard   → component returns null (no button)
 *
 * The actual hint logic (what gets highlighted, which move is suggested) is
 * up to the calling screen — pass an `onHint` callback that consumes the
 * pool AND flashes the next legal move. This component handles the visual
 * state, the badge label, and the disabled style only.
 */
import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import type { HintsHook } from '../game/hintsHook';

interface Props {
  hints: HintsHook;
  /** Called on tap when `canUseHint` is true. Should call `hints.consume()`. */
  onPress: () => void;
}

export default function HintButton({ hints, onPress }: Props) {
  // Hard mode: nothing rendered. This matches Klondike's behavior where the
  // 💡 button just doesn't appear when hintsAllowed === 0.
  if (hints.remaining === 0 && !hints.canUseHint) {
    // eslint-disable-next-line no-console
    console.log('[HintButton] hidden — remaining=0 and canUseHint=false (hard mode?)');
    return null;
  }

  const label = hints.remaining === Infinity ? '∞' : String(hints.remaining);
  const dim = !hints.canUseHint;

  const handlePress = () => {
    // eslint-disable-next-line no-console
    console.log(`[HintButton] press — remaining=${label} canUseHint=${hints.canUseHint}`);
    onPress();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={dim}
      activeOpacity={0.75}
      accessibilityLabel={`Hint button (${label} remaining)`}
      hitSlop={8}
      style={[styles.btn, dim && styles.btnDim]}
    >
      <Text style={styles.icon}>💡</Text>
      <Text style={styles.qty}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(252,211,77,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(252,211,77,0.55)',
  },
  btnDim: { opacity: 0.4 },
  icon: { fontSize: 14 },
  qty: { color: '#FCD34D', fontSize: 12, fontFamily: 'Inter-Black' },
});

/* === End of HintButton.tsx — Solitaire — SallyCards === */
