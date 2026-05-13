/**
 * @file VsBotLayout.tsx
 * @description Layout dédié au mode `vs=bot` avec appel webrtc-p2p ou jitsi.
 *
 * Le layout précédent superposait la caméra (200×280) en bas-droite, ce qui
 * cachait une partie du plateau du bot. Cette version réorganise tout en
 * trois zones empilées verticalement, chacune clairement étiquetée :
 *
 *   ┌─────────────────────────────────────────┐
 *   │ STRIP CAMÉRAS — 2 tuiles côte à côte    │  ← hauteur fixe ~140 px
 *   │ [Moi (camera)]   [Adversaire (avatar)]  │     collapsable par bouton
 *   ├─────────────────────────────────────────┤
 *   │ ▶ PLATEAU 1 — TOI                       │  ← scrollable, hauteur libre
 *   │ ┌────────────────────────────────────┐  │
 *   │ │ <engineScreen> (Klondike, etc.)    │  │
 *   │ └────────────────────────────────────┘  │
 *   ├─────────────────────────────────────────┤
 *   │ ▶ PLATEAU 2 — ADVERSAIRE                │
 *   │ ┌────────────────────────────────────┐  │
 *   │ │ <VsBotOverlay>                     │  │
 *   │ └────────────────────────────────────┘  │
 *   └─────────────────────────────────────────┘
 *
 * Le composant accepte les enfants en props (`callPanel`, `userPlateau`,
 * `botPlateau`) plutôt que d'embarquer la logique webrtc/engine ici — ça
 * garde l'aiguillage et l'instanciation des engines dans solo.tsx.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  /** Plateau du joueur — typiquement le KlondikeScreen complet. */
  userPlateau: React.ReactNode;
  /** Plateau de l'adversaire — typiquement <VsBotOverlay />. */
  botPlateau: React.ReactNode;
  /** Composant d'appel (P2PCall ou ExternalJitsiCall) — affiché dans la strip. */
  callPanel?: React.ReactNode;
  /** Hauteur explicite pour le plateau joueur. Par défaut : assez grand pour
   *  contenir Klondike/Spider/FreeCell entiers (AppHeader + GameHeader +
   *  Stats + foundations + 7 colonnes de cartes + actions). */
  userPlateauHeight?: number;
  /** Hauteur explicite pour le plateau bot. Par défaut : ~55% de la viewport. */
  botPlateauHeight?: number;
}

const WINDOW_HEIGHT = Dimensions.get('window').height;
// Approximations de hauteur chrome :
//   - Caméra strip expanded ≈ 240px
//   - Section header ≈ 42px × 2 = 84px
//   - Marge basse de safe-area ≈ 24px
// On veut que Plateau 1 occupe ~95% de la viewport pour que toutes les
// variantes (Klondike, Spider, Yukon, Bastion…) tiennent en hauteur.
// Plateau 2 (mini-plateau du bot) prend moins — un grand affichage compact.
const DEFAULT_USER_HEIGHT = Math.max(720, Math.floor(WINDOW_HEIGHT * 0.95));
const DEFAULT_BOT_HEIGHT = Math.max(380, Math.floor(WINDOW_HEIGHT * 0.48));

export default function VsBotLayout({
  userPlateau,
  botPlateau,
  callPanel,
  userPlateauHeight = DEFAULT_USER_HEIGHT,
  botPlateauHeight = DEFAULT_BOT_HEIGHT,
}: Props) {
  const [camCollapsed, setCamCollapsed] = useState(false);

  return (
    <View style={s.root}>
      {/* ─── STRIP CAMÉRAS ────────────────────────────────────────── */}
      {callPanel && (
        <View style={[s.cameraStrip, camCollapsed && s.cameraStripCollapsed]}>
          <LinearGradient
            colors={['rgba(124,58,237,0.25)', 'rgba(15,11,40,0.55)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={s.cameraStripHeader}>
            <Ionicons name="videocam" size={14} color="#A78BFA" />
            <Text style={s.cameraStripTitle}>Appel vidéo</Text>
            <TouchableOpacity
              onPress={() => setCamCollapsed((c) => !c)}
              hitSlop={8}
              style={s.collapseBtn}
            >
              <Ionicons
                name={camCollapsed ? 'chevron-down' : 'chevron-up'}
                size={16}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
          {!camCollapsed && (
            <View style={s.cameraStripBody}>
              {callPanel}
            </View>
          )}
        </View>
      )}

      {/* ─── PLATEAUX SCROLLABLES ─────────────────────────────────── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled
      >
        <SectionHeader index={1} label="TOI" accent="#10B981" />
        <View style={[s.plateauWrap, { height: userPlateauHeight }]}>
          {userPlateau}
        </View>

        <SectionHeader index={2} label="ADVERSAIRE" accent="#EF4444" />
        <View style={[s.plateauWrap, { height: botPlateauHeight }]}>
          {botPlateau}
        </View>
      </ScrollView>
    </View>
  );
}

function SectionHeader({ index, label, accent }: { index: number; label: string; accent: string }) {
  return (
    <View style={s.sectionHeader}>
      <View style={[s.sectionBadge, { backgroundColor: accent }]}>
        <Text style={s.sectionBadgeText}>PLATEAU {index}</Text>
      </View>
      <Text style={[s.sectionLabel, { color: accent }]}>{label}</Text>
      <View style={[s.sectionLine, { backgroundColor: accent + '66' }]} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  // Camera strip — top of screen, contains the full P2PCall component
  // (status bar + my camera tile + peer grid + controls). Fixed height so
  // the plateaux below have predictable space; collapsable to give the
  // game more room when the player needs to focus.
  cameraStrip: {
    height: 240,
    borderBottomWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
    overflow: 'hidden',
  },
  cameraStripCollapsed: { height: 36 },
  cameraStripHeader: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cameraStripTitle: {
    color: '#A78BFA',
    fontSize: 11,
    fontFamily: 'Inter-Black',
    letterSpacing: 1,
    flex: 1,
  },
  collapseBtn: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
    padding: 4,
  },
  cameraStripBody: { flex: 1 },

  // Scroll area below — plateaux stacked vertically, each labeled.
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sectionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  sectionBadgeText: {
    color: '#0F172A',
    fontSize: 10,
    fontFamily: 'Inter-Black',
    letterSpacing: 1,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Black',
    letterSpacing: 1.5,
  },
  sectionLine: { flex: 1, height: 1, marginLeft: 4 },

  // Each plateau gets a fixed height so nested ScrollViews inside
  // (KlondikeScreen has its own ScrollView) can render correctly.
  plateauWrap: { width: '100%' },
});

/* === End of VsBotLayout.tsx — Solitaire — SallyCards === */
