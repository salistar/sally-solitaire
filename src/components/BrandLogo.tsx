/**
 * @file BrandLogo.tsx
 * @description Professional Sally Solitaire logo — a stylized 3-card fan with
 * a centered Ace-of-Spades crest. Pure React Native primitives (no SVG / image
 * dependency so it renders identically on iOS, Android, and Web).
 *
 * Design v2:
 * - Side cards lean further (-26° / +26°) for a deeper fan
 * - Front card is a portrait Ace-of-Spades with a dual-gradient field (deep
 *   indigo → magenta) and a gold pip + corner indices
 * - Rounded inner border + soft drop shadow give the cards a printed feel
 * - Pure layout, no external assets — works in the language picker, splash,
 *   loading screen, etc.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  size?: number;
  /** Optional accent (defaults to gold). */
  accent?: string;
}

export function BrandLogo({ size = 110, accent = '#FCD34D' }: Props) {
  const cardW = size * 0.56;
  const cardH = size;
  const radius = size * 0.11;
  const innerMargin = Math.max(2, size * 0.03);

  return (
    <View
      style={[
        styles.wrap,
        { width: size * 1.78, height: size * 1.22 },
      ]}
      accessibilityRole="image"
      accessibilityLabel="Sally Solitaire logo"
    >
      {/* Back card — Diamond (right-leaning) */}
      <View
        style={[
          styles.card,
          {
            width: cardW,
            height: cardH,
            borderRadius: radius,
            transform: [{ rotate: '-26deg' }, { translateX: -cardW * 0.58 }, { translateY: cardH * 0.04 }],
            zIndex: 1,
          },
        ]}
      >
        <LinearGradient
          colors={['#0F172A', '#312E81']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius - innerMargin, margin: innerMargin }]}
        />
        <View style={[styles.innerBorder, { borderRadius: radius - innerMargin * 1.5, margin: innerMargin * 1.5, borderColor: 'rgba(255,213,128,0.35)' }]} />
        <Text style={[styles.suitTop, { color: accent }]}>♦</Text>
        <Text style={[styles.suitCenter, { color: accent, fontSize: size * 0.58 }]}>♦</Text>
        <Text style={[styles.suitBottom, { color: accent }]}>♦</Text>
      </View>

      {/* Back card — Club (left-leaning) */}
      <View
        style={[
          styles.card,
          {
            width: cardW,
            height: cardH,
            borderRadius: radius,
            transform: [{ rotate: '26deg' }, { translateX: cardW * 0.58 }, { translateY: cardH * 0.04 }],
            zIndex: 1,
          },
        ]}
      >
        <LinearGradient
          colors={['#0F172A', '#312E81']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius - innerMargin, margin: innerMargin }]}
        />
        <View style={[styles.innerBorder, { borderRadius: radius - innerMargin * 1.5, margin: innerMargin * 1.5, borderColor: 'rgba(255,213,128,0.35)' }]} />
        <Text style={[styles.suitTop, { color: accent }]}>♣</Text>
        <Text style={[styles.suitCenter, { color: accent, fontSize: size * 0.58 }]}>♣</Text>
        <Text style={[styles.suitBottom, { color: accent }]}>♣</Text>
      </View>

      {/* Front — Ace of Spades on signature gradient */}
      <View
        style={[
          styles.card,
          {
            width: cardW,
            height: cardH,
            borderRadius: radius,
            zIndex: 3,
          },
        ]}
      >
        <LinearGradient
          colors={['#7C3AED', '#A21CAF', '#DB2777']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius - innerMargin, margin: innerMargin }]}
        />
        <View style={[styles.innerBorder, { borderRadius: radius - innerMargin * 1.5, margin: innerMargin * 1.5, borderColor: 'rgba(255,255,255,0.32)' }]} />
        <View style={styles.cornerTL}>
          <Text style={[styles.indexLetter, { color: '#fff' }]}>A</Text>
          <Text style={[styles.indexSuit, { color: '#fff' }]}>♠</Text>
        </View>
        <View style={styles.cornerBR}>
          <Text style={[styles.indexLetter, { color: '#fff' }]}>A</Text>
          <Text style={[styles.indexSuit, { color: '#fff' }]}>♠</Text>
        </View>
        <Text style={[styles.suitCenter, { color: accent, fontSize: size * 0.62, top: -size * 0.04 }]}>♠</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 22,
    elevation: 14,
    overflow: 'hidden',
  },
  innerBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
  },
  suitTop: {
    position: 'absolute',
    top: 8,
    left: 8,
    fontSize: 14,
    fontWeight: '900',
  },
  suitCenter: {
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  suitBottom: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    fontSize: 14,
    fontWeight: '900',
    transform: [{ rotate: '180deg' }],
  },
  cornerTL: {
    position: 'absolute',
    top: 6,
    left: 6,
    alignItems: 'center',
  },
  cornerBR: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    alignItems: 'center',
    transform: [{ rotate: '180deg' }],
  },
  indexLetter: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
    lineHeight: 14,
  },
  indexSuit: {
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 12,
  },
});
