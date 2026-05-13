/**
 * @file HintFlashBanner.tsx
 * @description Top-of-screen banner that appears for ~2.5 s whenever the
 * player taps 💡 in one of the 7 generic engine screens. Gives unambiguous
 * feedback that the press was registered — even on screens where the
 * underlying "highlight a card" hint logic can't find a valid move.
 *
 * Usage from a screen wrapper:
 *
 *   const [tick, setTick] = useState(0);
 *   ...
 *   <HintFlashBanner
 *     tick={tick}
 *     message={`💡 Indice — coup à essayer`}
 *     hintsLeft={hints.remaining}
 *   />
 *
 * The component watches `tick` and, on each increment, fades a banner in,
 * holds for 2 s, then fades out. Pointer-events are disabled so it never
 * blocks gameplay underneath.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

interface Props {
  /** Bump this counter from the parent to trigger a new flash. */
  tick: number;
  /** Message shown in the banner. */
  message: string;
  /** Optional `remaining` display: shown as "(N restant)" suffix. */
  hintsLeft?: number | string;
}

export default function HintFlashBanner({ tick, message, hintsLeft }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const lastTick = useRef(0);

  useEffect(() => {
    if (tick === 0 || tick === lastTick.current) return;
    lastTick.current = tick;
    // eslint-disable-next-line no-console
    console.log(`[HintFlashBanner] flash tick=${tick} message="${message}"`);
    opacity.setValue(0);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(1900),
      Animated.timing(opacity, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]).start();
  }, [tick, message, opacity]);

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { opacity }]}>
      <View style={styles.pill}>
        <Text style={styles.text}>{message}</Text>
        {hintsLeft != null && (
          <Text style={styles.sub}>
            {' '}· {hintsLeft === Infinity || hintsLeft === '∞' ? '∞' : `${hintsLeft} restant${typeof hintsLeft === 'number' && hintsLeft > 1 ? 's' : ''}`}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 64,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(34,211,238,0.95)',
    borderWidth: 2,
    borderColor: '#0E7490',
    shadowColor: '#22D3EE',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  text: { color: '#042F2E', fontSize: 14, fontFamily: 'Inter-Black' },
  sub: { color: '#042F2E', fontSize: 12, fontFamily: 'Inter-Bold' },
});

/* === End of HintFlashBanner.tsx — Solitaire — SallyCards === */
