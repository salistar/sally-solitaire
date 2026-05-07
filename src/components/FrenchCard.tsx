/**
 * @file FrenchCard.tsx
 * @description Renders one French (52-card) playing card from the local
 * `assets/cards-fr/` PNGs. Used by the Solitaire game screen.
 *
 * Defensive: if a require() fails or the code is unknown, renders a visible
 * text fallback (e.g. "10♥") instead of nothing — so missing-asset bugs are
 * obvious instead of silent.
 */
import React from 'react';
import { Image, View, Text, ImageStyle, ViewStyle } from 'react-native';

// Pre-bundle the 52 PNGs + back. Static `require()` calls so Metro can
// resolve them at build time.
export const FRENCH_CARD_IMAGES: Record<string, any> = {
  // Spades
  'AS': require('../../assets/cards-fr/AS.png'),
  '2S': require('../../assets/cards-fr/2S.png'),
  '3S': require('../../assets/cards-fr/3S.png'),
  '4S': require('../../assets/cards-fr/4S.png'),
  '5S': require('../../assets/cards-fr/5S.png'),
  '6S': require('../../assets/cards-fr/6S.png'),
  '7S': require('../../assets/cards-fr/7S.png'),
  '8S': require('../../assets/cards-fr/8S.png'),
  '9S': require('../../assets/cards-fr/9S.png'),
  '0S': require('../../assets/cards-fr/0S.png'),
  'JS': require('../../assets/cards-fr/JS.png'),
  'QS': require('../../assets/cards-fr/QS.png'),
  'KS': require('../../assets/cards-fr/KS.png'),
  // Hearts
  'AH': require('../../assets/cards-fr/AH.png'),
  '2H': require('../../assets/cards-fr/2H.png'),
  '3H': require('../../assets/cards-fr/3H.png'),
  '4H': require('../../assets/cards-fr/4H.png'),
  '5H': require('../../assets/cards-fr/5H.png'),
  '6H': require('../../assets/cards-fr/6H.png'),
  '7H': require('../../assets/cards-fr/7H.png'),
  '8H': require('../../assets/cards-fr/8H.png'),
  '9H': require('../../assets/cards-fr/9H.png'),
  '0H': require('../../assets/cards-fr/0H.png'),
  'JH': require('../../assets/cards-fr/JH.png'),
  'QH': require('../../assets/cards-fr/QH.png'),
  'KH': require('../../assets/cards-fr/KH.png'),
  // Diamonds
  'AD': require('../../assets/cards-fr/AD.png'),
  '2D': require('../../assets/cards-fr/2D.png'),
  '3D': require('../../assets/cards-fr/3D.png'),
  '4D': require('../../assets/cards-fr/4D.png'),
  '5D': require('../../assets/cards-fr/5D.png'),
  '6D': require('../../assets/cards-fr/6D.png'),
  '7D': require('../../assets/cards-fr/7D.png'),
  '8D': require('../../assets/cards-fr/8D.png'),
  '9D': require('../../assets/cards-fr/9D.png'),
  '0D': require('../../assets/cards-fr/0D.png'),
  'JD': require('../../assets/cards-fr/JD.png'),
  'QD': require('../../assets/cards-fr/QD.png'),
  'KD': require('../../assets/cards-fr/KD.png'),
  // Clubs
  'AC': require('../../assets/cards-fr/AC.png'),
  '2C': require('../../assets/cards-fr/2C.png'),
  '3C': require('../../assets/cards-fr/3C.png'),
  '4C': require('../../assets/cards-fr/4C.png'),
  '5C': require('../../assets/cards-fr/5C.png'),
  '6C': require('../../assets/cards-fr/6C.png'),
  '7C': require('../../assets/cards-fr/7C.png'),
  '8C': require('../../assets/cards-fr/8C.png'),
  '9C': require('../../assets/cards-fr/9C.png'),
  '0C': require('../../assets/cards-fr/0C.png'),
  'JC': require('../../assets/cards-fr/JC.png'),
  'QC': require('../../assets/cards-fr/QC.png'),
  'KC': require('../../assets/cards-fr/KC.png'),
  // Back
  'BACK': require('../../assets/cards-fr/back.png'),
};

interface FrenchCardProps {
  /**
   * Image code following deckofcardsapi convention:
   *  - value: A, 2-9, 0 (=10), J, Q, K
   *  - suit:  S, H, D, C
   *  - 'BACK' for the face-down back.
   * Examples: "AS" (As pique), "0H" (10 cœur), "KD" (Roi carreau).
   */
  code: string;
  width?: number;
  height?: number;
  style?: ViewStyle;
  imageStyle?: ImageStyle;
}

/** Suit glyph + color for the text fallback. */
const SUIT_GLYPH: Record<string, { glyph: string; color: string }> = {
  S: { glyph: '♠', color: '#000' },
  C: { glyph: '♣', color: '#000' },
  H: { glyph: '♥', color: '#DC2626' },
  D: { glyph: '♦', color: '#DC2626' },
};

/** Convert API code (0=10) to display label. */
function labelOf(code: string): { value: string; suit: string; color: string } {
  if (code === 'BACK') return { value: '🂠', suit: '', color: '#000' };
  const v = code[0];
  const s = code[1] ?? 'S';
  const meta = SUIT_GLYPH[s] ?? SUIT_GLYPH.S;
  const value = v === '0' ? '10' : v === 'A' ? 'A' : v === 'J' ? 'V' : v === 'Q' ? 'D' : v === 'K' ? 'R' : v;
  return { value, suit: meta.glyph, color: meta.color };
}

export default function FrenchCard({ code, width = 60, height = 84, style, imageStyle }: FrenchCardProps) {
  const src = FRENCH_CARD_IMAGES[code];
  const meta = labelOf(code);

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: 8,
          overflow: 'hidden',
          backgroundColor: code === 'BACK' ? '#1E1B3A' : '#fff',
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
          elevation: 3,
          borderWidth: 1,
          borderColor: 'rgba(0,0,0,0.15)',
        },
        style,
      ]}
    >
      {/* Always render the text fallback FIRST (visible if image fails). */}
      {code !== 'BACK' && (
        <View style={{ position: 'absolute', top: 4, left: 6, zIndex: 0 }}>
          <Text style={{ color: meta.color, fontSize: Math.max(10, width / 5), fontFamily: 'Inter-Black', lineHeight: Math.max(12, width / 5) }}>
            {meta.value}
          </Text>
          <Text style={{ color: meta.color, fontSize: Math.max(10, width / 5) }}>
            {meta.suit}
          </Text>
        </View>
      )}
      {/* Center suit (for back: white pattern; for front: large glyph fallback). */}
      {code === 'BACK' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#C084FC', fontSize: Math.max(20, width / 2.5), fontFamily: 'Inter-Black' }}>♠♥♦♣</Text>
        </View>
      )}
      {/* Image overlay — covers the fallback when it loads successfully. */}
      {src && (
        <Image
          source={src}
          style={[{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }, imageStyle]}
          resizeMode="contain"
          onError={(e) => {
            // eslint-disable-next-line no-console
            console.warn('[FrenchCard] image load failed for', code, e?.nativeEvent);
          }}
        />
      )}
    </View>
  );
}
