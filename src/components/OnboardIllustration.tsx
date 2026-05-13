/**
 * @file OnboardIllustration.tsx
 * @description Premium onboarding illustrations (no emojis). Three variants:
 * "multiplayer" — overlapping player avatars connected by a line
 * "intelligence" — stacked card with elegant ribbon
 * "trophy" — laurel + chalice in metallic gradient
 *
 * All drawn with React Native primitives (no SVG dependency).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type Variant = 'multiplayer' | 'intelligence' | 'trophy';

interface Props {
  variant: Variant;
  size?: number;
}

export function OnboardIllustration({ variant, size = 140 }: Props) {
  if (variant === 'multiplayer') return <Multiplayer size={size} />;
  if (variant === 'intelligence') return <Intelligence size={size} />;
  return <Trophy size={size} />;
}

function Multiplayer({ size }: { size: number }) {
  const dot = size * 0.34;
  return (
    <View style={[base.wrap, { width: size * 1.4, height: size }]}>
      <View
        style={{
          position: 'absolute',
          left: size * 0.15,
          width: size,
          height: 3,
          backgroundColor: 'rgba(192,132,252,0.45)',
          borderRadius: 2,
        }}
      />
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: i * (size * 0.43) + size * 0.05,
            top: size * 0.5 - dot / 2,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            overflow: 'hidden',
            shadowColor: '#7C3AED',
            shadowOpacity: 0.6,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
            elevation: 10,
            borderWidth: 3,
            borderColor: i === 1 ? '#FFD580' : '#fff',
          }}
        >
          <LinearGradient
            colors={i === 1 ? ['#7C3AED', '#C026D3'] : ['#1E1B4B', '#312E81']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <View style={[base.center, StyleSheet.absoluteFill]}>
            <Text style={{ color: '#fff', fontSize: dot * 0.38, fontWeight: '900' }}>
              {['P1', 'P2', 'P3'][i]}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function Intelligence({ size }: { size: number }) {
  return (
    <View style={[base.wrap, { width: size, height: size }]}>
      <View
        style={{
          position: 'absolute',
          width: size * 0.55,
          height: size * 0.78,
          borderRadius: size * 0.07,
          overflow: 'hidden',
          shadowColor: '#7C3AED',
          shadowOpacity: 0.5,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 12,
          transform: [{ rotate: '-8deg' }],
        }}
      >
        <LinearGradient
          colors={['#0F172A', '#1E1B4B']}
          style={StyleSheet.absoluteFill}
        />
        {Array.from({ length: 4 }).map((_, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: size * 0.06,
              top: size * 0.18 + i * size * 0.12,
              width: size * 0.43,
              height: 2,
              backgroundColor: 'rgba(192,132,252,0.5)',
              borderRadius: 1,
            }}
          />
        ))}
        <View
          style={{
            position: 'absolute',
            top: size * 0.55,
            left: size * 0.15,
            width: size * 0.26,
            height: size * 0.18,
            borderRadius: 4,
            backgroundColor: '#FFD580',
          }}
        />
      </View>

      <View
        style={{
          position: 'absolute',
          right: size * 0.04,
          top: size * 0.08,
          width: size * 0.36,
          height: size * 0.16,
          borderRadius: 4,
          overflow: 'hidden',
          transform: [{ rotate: '14deg' }],
        }}
      >
        <LinearGradient colors={['#FFD580', '#F59E0B']} style={StyleSheet.absoluteFill} />
        <View style={[base.center, StyleSheet.absoluteFill]}>
          <Text style={{ color: '#0F172A', fontSize: size * 0.06, fontWeight: '900', letterSpacing: 1 }}>
            STRATEGY
          </Text>
        </View>
      </View>
    </View>
  );
}

function Trophy({ size }: { size: number }) {
  return (
    <View style={[base.wrap, { width: size, height: size }]}>
      <View
        style={{
          position: 'absolute',
          top: size * 0.42,
          width: size * 0.4,
          height: size * 0.42,
          borderTopLeftRadius: size * 0.2,
          borderTopRightRadius: size * 0.2,
          borderBottomLeftRadius: size * 0.04,
          borderBottomRightRadius: size * 0.04,
          overflow: 'hidden',
          shadowColor: '#F5B13A',
          shadowOpacity: 0.7,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 12,
        }}
      >
        <LinearGradient colors={['#FCD34D', '#F59E0B', '#92400E']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      </View>
      <View
        style={{
          position: 'absolute',
          top: size * 0.18,
          width: size * 0.58,
          height: size * 0.42,
          borderTopLeftRadius: size * 0.29,
          borderTopRightRadius: size * 0.29,
          borderBottomLeftRadius: size * 0.1,
          borderBottomRightRadius: size * 0.1,
          overflow: 'hidden',
        }}
      >
        <LinearGradient colors={['#FCD34D', '#F59E0B']} style={StyleSheet.absoluteFill} />
        <View style={[base.center, StyleSheet.absoluteFill]}>
          <Text style={{ color: '#7C2D12', fontSize: size * 0.18, fontWeight: '900' }}>★</Text>
        </View>
      </View>
      {[-1, 1].map((side) => (
        <View
          key={side}
          style={{
            position: 'absolute',
            top: size * 0.24,
            left: side === -1 ? size * 0.04 : undefined,
            right: side === 1 ? size * 0.04 : undefined,
            width: size * 0.18,
            height: size * 0.26,
            borderWidth: size * 0.04,
            borderColor: '#F59E0B',
            borderRadius: size * 0.09,
            borderRightWidth: side === -1 ? 0 : size * 0.04,
            borderLeftWidth: side === 1 ? 0 : size * 0.04,
          }}
        />
      ))}
    </View>
  );
}

const base = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
