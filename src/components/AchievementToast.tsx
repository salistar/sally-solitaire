/**
 * @file AchievementToast.tsx
 * @description One-shot animated banner for an achievement unlock. Slides
 * down from the top, holds for ~3.5s, then slides back up. Renders the
 * badge icon, name, description, and coin reward. Tapping it dismisses
 * immediately.
 *
 * Used by AchievementToastContext to render queued unlocks one after the
 * other (no overlap — each toast waits for the previous one to finish).
 */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { AchievementDef } from '../../shared/api';

const HOLD_MS = 3500;
const SLIDE_MS = 350;

interface Props {
  def: AchievementDef;
  onDone: () => void;
}

export default function AchievementToast({ def, onDone }: Props) {
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Slide down + fade in
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: SLIDE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: SLIDE_MS,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Hold then slide back up + fade out
      const holdTimer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -120,
            duration: SLIDE_MS,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: SLIDE_MS,
            useNativeDriver: true,
          }),
        ]).start(() => onDone());
      }, HOLD_MS);
      return () => clearTimeout(holdTimer);
    });
  }, [translateY, opacity, onDone]);

  const dismissNow = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => onDone());
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { transform: [{ translateY }], opacity }]}
    >
      <TouchableOpacity activeOpacity={0.9} onPress={dismissNow}>
        <LinearGradient
          colors={['#7C3AED', '#A21CAF', '#DB2777']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.banner}
        >
          <View style={styles.iconCircle}>
            <Text style={styles.icon}>{def.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTag}>🏆 Achievement débloqué !</Text>
            <Text style={styles.name} numberOfLines={1}>{def.name}</Text>
            <Text style={styles.desc} numberOfLines={2}>{def.description}</Text>
          </View>
          <View style={styles.coinBadge}>
            <Text style={styles.coinText}>+{def.coinsReward}</Text>
            <Text style={styles.coinLabel}>🪙</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 50,
    left: 12,
    right: 12,
    zIndex: 9999,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    shadowColor: '#7C3AED',
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
    borderWidth: 1,
    borderColor: 'rgba(252,211,77,0.4)',
  },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(252,211,77,0.25)',
    borderWidth: 2, borderColor: '#FCD34D',
  },
  icon: { fontSize: 24 },
  headerTag: { color: '#FCD34D', fontSize: 9, fontFamily: 'Inter-Black', letterSpacing: 1.2 },
  name: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Black', marginTop: 1 },
  desc: { color: '#E9D5FF', fontSize: 11, marginTop: 2 },
  coinBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(15,11,40,0.7)',
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1, borderColor: '#FCD34D',
  },
  coinText: { color: '#FCD34D', fontSize: 14, fontFamily: 'Inter-Black' },
  coinLabel: { fontSize: 10, marginTop: -2 },
});
