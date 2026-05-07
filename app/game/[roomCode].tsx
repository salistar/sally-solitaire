/**
 * @file game/[roomCode].tsx — Solitaire Klondike (deck français 52 cartes)
 *
 * Utilise:
 *  - solitaireFrEngine.ts (52 cartes, vraies règles Klondike)
 *  - FrenchCard.tsx (rendu PNG ♠♥♦♣ téléchargés depuis deckofcardsapi.com)
 *  - Le moteur espagnol solitaireEngine.ts est conservé mais non utilisé.
 */
import React, { useReducer, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import AppHeader from '../../src/components/AppHeader';
import FrenchCard from '../../src/components/FrenchCard';
import { useTheme } from '../../src/contexts/AppProviders';
import { logger } from '../../src/utils/logger';
import { APP_CONFIG } from '../../src/config/app.config';
import * as Engine from '../../src/game/solitaireFrEngine';

const log = logger.scoped('GameScreen');

export default function GameScreen() {
  const { roomCode } = useLocalSearchParams<{ roomCode: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { palette } = useTheme();

  const [state, dispatch] = useReducer(Engine.gameReducer, undefined, () => {
    const s = Engine.createInitialState();
    log.screen('createInitialState', {
      tableau: s.tableau.length,
      stock: s.stock.length,
      foundations: s.foundations.length,
    });
    return s;
  });

  // Opponent plateau — visible immédiatement, MAIS le bot ne joue pas tant
  // qu'un déclencheur n'a pas eu lieu :
  //   - soit le user clique "Activer le bot"
  //   - soit un vrai 2ᵉ joueur rejoint (TODO via socket event)
  // Tant que `botActive=false`, le plateau adversaire reste figé sur le
  // deal initial (cartes face cachée + premières face visibles).
  const [oppState, oppDispatch] = useReducer(Engine.gameReducer, undefined, () => Engine.createInitialState());
  const [botActive, setBotActive] = useState(false);

  const [showQuit, setShowQuit] = useState(false);
  const [showWin, setShowWin] = useState(false);

  // Bot loop: only runs when explicitly activated.
  useEffect(() => {
    if (!botActive) return;
    if (oppState.phase === 'won') return;
    const id = setInterval(() => {
      const next = Engine.findHint(oppState);
      if (next) oppDispatch(next);
      else if (oppState.stock.length > 0 || oppState.waste.length > 0) {
        oppDispatch({ type: 'DRAW_FROM_STOCK' });
      }
    }, 2200);
    return () => clearInterval(id);
  }, [botActive, oppState]);

  // Mount log — proves the screen reached this point
  useEffect(() => {
    log.screen('GameScreen mounted', { roomCode, tableauCols: state.tableau.length, stockSize: state.stock.length });
  }, []);

  const won = state.phase === 'won';

  useEffect(() => {
    if (won) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setShowWin(true);
    }
  }, [won]);

  const drawStock = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    dispatch({ type: 'DRAW_FROM_STOCK' });
  }, []);

  const tryMoveCard = useCallback((cardId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    dispatch({
      type: 'MOVE_TO_FOUNDATION',
      from: { type: 'tableau', index: 0 },
      cardId,
    });
  }, []);

  const autoComplete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    dispatch({ type: 'AUTO_COMPLETE' });
  }, []);

  const reset = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    dispatch({ type: 'RESET' });
    setShowWin(false);
  }, []);

  const stock = state.stock;
  const waste = state.waste;
  const foundations = state.foundations;
  const tableau = state.tableau;
  const cardsInFoundations = foundations.reduce((a, f) => a + f.cards.length, 0);

  const styles = createStyles(palette);

  return (
    <View style={styles.root}>
      <LinearGradient colors={palette.bgGradient} style={StyleSheet.absoluteFill} />
      <AppHeader
        title={APP_CONFIG.name}
        subtitle="Klondike — 52 cartes"
        showBack
        rightSlot={
          <TouchableOpacity onPress={() => setShowQuit(true)} style={{ padding: 6 }}>
            <Ionicons name="close" size={22} color={palette.text} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.body}>
        {/* DEBUG marker — confirms the new screen renders */}
        <View style={{ backgroundColor: APP_CONFIG.primary, padding: 12, borderRadius: 12, marginBottom: 12 }}>
          <Text style={{ color: '#fff', fontFamily: 'Inter-Black', fontSize: 16, textAlign: 'center' }}>
            🎴 KLONDIKE 52 cartes
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, textAlign: 'center', marginTop: 2 }}>
            Stock: {state.stock.length} · Tableau: {state.tableau.length} cols · Foundation: {state.foundations.length}
          </Text>
        </View>

        {/* Header banner */}
        <View
          style={[styles.banner, { borderColor: palette.border, backgroundColor: APP_CONFIG.secondary }]}
        >
          <View style={styles.bannerStat}>
            <Text style={[styles.bannerLabel, { color: '#fff' }]}>MOUVEMENTS</Text>
            <Text style={[styles.bannerValue, { color: '#fff' }]}>{state.moves}</Text>
          </View>
          <View style={styles.bannerStat}>
            <Text style={[styles.bannerLabel, { color: '#fff' }]}>SCORE</Text>
            <Text style={[styles.bannerValue, { color: APP_CONFIG.primary }]}>{state.score}</Text>
          </View>
          <View style={styles.bannerStat}>
            <Text style={[styles.bannerLabel, { color: '#fff' }]}>RESTANT</Text>
            <Text style={[styles.bannerValue, { color: '#fff' }]}>{52 - cardsInFoundations}</Text>
          </View>
        </View>

        {/* ── ADVERSAIRE — plateau complet en haut, non interactif ──
            Le bot ne démarre QUE si l'utilisateur clique "Activer le bot"
            (ou plus tard quand un vrai 2ᵉ joueur rejoint via socket). */}
        <View style={styles.oppBoard}>
          <View style={styles.oppHeader}>
            <Ionicons name={botActive ? 'hardware-chip' : 'hourglass-outline'} size={16} color="#EF4444" />
            <Text style={styles.oppTitle}>
              {botActive ? 'ADVERSAIRE (Bot joue)' : 'ADVERSAIRE (en attente)'}
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.oppSub}>
              {oppState.moves} coups · {oppState.foundations.reduce((a, f) => a + f.cards.length, 0)}/52
            </Text>
          </View>
          <View style={styles.oppTopRow}>
            <View style={styles.oppSlot}>
              {oppState.stock.length > 0 ? (
                <FrenchCard code="BACK" width={36} height={52} />
              ) : (
                <View style={styles.oppEmpty} />
              )}
              <Text style={styles.oppLbl}>{oppState.stock.length}</Text>
            </View>
            <View style={styles.oppSlot}>
              {oppState.waste.length > 0 ? (
                <FrenchCard code={Engine.imageCode(oppState.waste[oppState.waste.length - 1])} width={36} height={52} />
              ) : (
                <View style={styles.oppEmpty} />
              )}
              <Text style={styles.oppLbl}>W</Text>
            </View>
            <View style={{ flex: 1 }} />
            {oppState.foundations.map((f, i) => (
              <View key={i} style={styles.oppSlot}>
                {f.cards.length > 0 ? (
                  <FrenchCard code={Engine.imageCode(f.cards[f.cards.length - 1])} width={36} height={52} />
                ) : (
                  <View style={styles.oppEmpty}>
                    <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>{Engine.SUIT_GLYPH[Engine.SUITS[i]]}</Text>
                  </View>
                )}
                <Text style={styles.oppLbl}>{f.cards.length}</Text>
              </View>
            ))}
          </View>
          <View style={styles.oppTableauRow}>
            {oppState.tableau.map((col, ci) => (
              <View key={ci} style={styles.oppCol}>
                {col.cards.length === 0 ? (
                  <View style={styles.oppEmpty} />
                ) : (
                  col.cards.map((card, idx) => (
                    <View key={card.id} style={{ marginTop: idx === 0 ? 0 : -42 }}>
                      <FrenchCard code={card.faceUp ? Engine.imageCode(card) : 'BACK'} width={36} height={52} />
                    </View>
                  ))
                )}
              </View>
            ))}
          </View>

          {/* Overlay tant que le bot n'est pas activé */}
          {!botActive && (
            <View style={styles.oppWaitOverlay}>
              <Ionicons name="hourglass-outline" size={32} color="#fff" />
              <Text style={styles.oppWaitText}>
                {t('multiplayer.waitingForOpponent', { defaultValue: 'En attente d\'un 2ᵉ joueur…' })}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  log.screen('bot activated by user');
                  setBotActive(true);
                }}
                activeOpacity={0.85}
                style={styles.activateBotBtn}
              >
                <LinearGradient
                  colors={['#0EA5E9', '#3B82F6']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.activateBotBtnGrad}
                >
                  <Ionicons name="hardware-chip" size={18} color="#fff" />
                  <Text style={styles.activateBotBtnText}>
                    {t('multiplayer.activateBot', { defaultValue: 'Activer le Bot' })}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Séparateur visuel entre les 2 plateaux */}
        <View style={styles.boardsDivider}>
          <View style={[styles.dividerLine, { backgroundColor: palette.border }]} />
          <View style={styles.dividerBadge}>
            <Ionicons name="person" size={14} color="#fff" />
            <Text style={styles.dividerText}>TOI (joue ci-dessous)</Text>
          </View>
          <View style={[styles.dividerLine, { backgroundColor: palette.border }]} />
        </View>

        {/* Top row: stock + waste + 4 foundations */}
        <View style={styles.topRow}>
          {/* Stock */}
          <Pressable onPress={drawStock} style={styles.slot}>
            {stock.length > 0 ? (
              <View style={styles.stockStack}>
                <FrenchCard code="BACK" width={50} height={70} />
                <View style={styles.stockBadge}>
                  <Text style={styles.stockBadgeText}>{stock.length}</Text>
                </View>
              </View>
            ) : waste.length > 0 ? (
              <View style={[styles.emptyBox, { borderColor: APP_CONFIG.primary }]}>
                <Ionicons name="refresh" size={24} color={APP_CONFIG.primary} />
              </View>
            ) : (
              <View style={[styles.emptyBox, { borderColor: palette.border }]}>
                <Text style={{ color: palette.textSecondary, fontSize: 9 }}>VIDE</Text>
              </View>
            )}
          </Pressable>

          {/* Waste */}
          <Pressable
            onPress={() => waste.length > 0 && tryMoveCard(waste[waste.length - 1].id)}
            style={styles.slot}
          >
            {waste.length > 0 ? (
              <FrenchCard code={Engine.imageCode(waste[waste.length - 1])} width={50} height={70} />
            ) : (
              <View style={[styles.emptyBox, { borderColor: palette.border }]}>
                <Text style={{ color: palette.textSecondary, fontSize: 9 }}>WASTE</Text>
              </View>
            )}
          </Pressable>

          <View style={{ width: 8 }} />

          {/* Foundations */}
          {foundations.map((f, i) => {
            const top = f.cards[f.cards.length - 1];
            return (
              <View key={i} style={styles.slot}>
                {top ? (
                  <FrenchCard code={Engine.imageCode(top)} width={50} height={70} />
                ) : (
                  <View style={[styles.emptyBox, { borderColor: palette.border }]}>
                    <Text style={[styles.foundationGlyph, { color: palette.textSecondary }]}>
                      {Engine.SUIT_GLYPH[Engine.SUITS[i]]}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Tableau */}
        <Text style={[styles.sectionTitle, { color: palette.text }]}>Tableau</Text>
        <View style={styles.tableauRow}>
          {tableau.map((col, colIdx) => (
            <View key={colIdx} style={styles.tableauCol}>
              <Text style={[styles.colLabel, { color: palette.textSecondary }]}>
                {colIdx + 1}
              </Text>
              {col.cards.length === 0 ? (
                <View style={[styles.emptyBox, styles.colEmpty, { borderColor: palette.border }]}>
                  <Ionicons name="add" size={14} color={palette.textSecondary} />
                </View>
              ) : (
                col.cards.map((card, cardIdx) => (
                  <Pressable
                    key={card.id}
                    onPress={() => {
                      if (!card.faceUp) return;
                      if (cardIdx === col.cards.length - 1) {
                        tryMoveCard(card.id);
                      }
                    }}
                    style={[styles.tableauCardWrap, { marginTop: cardIdx === 0 ? 0 : -45 }]}
                  >
                    {card.faceUp ? (
                      <FrenchCard code={Engine.imageCode(card)} width={42} height={62} />
                    ) : (
                      <FrenchCard code="BACK" width={42} height={62} />
                    )}
                  </Pressable>
                ))
              )}
            </View>
          ))}
        </View>

        {/* Action buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity onPress={autoComplete} style={[styles.actionBtn, { backgroundColor: '#10B981' }]}>
            <Ionicons name="flash" size={18} color="#fff" />
            <Text style={styles.actionText}>Auto</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={reset} style={[styles.actionBtn, { backgroundColor: APP_CONFIG.primary }]}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.actionText}>Nouvelle partie</Text>
          </TouchableOpacity>
        </View>

        {/* Help */}
        <View style={[styles.helpBox, { borderColor: palette.border }]}>
          <Ionicons name="information-circle-outline" size={14} color={palette.textSecondary} />
          <Text style={[styles.helpText, { color: palette.textSecondary }]}>
            Tap sur une carte face visible pour la jouer (foundation prioritaire).
            Tap sur le stock pour piocher. Construisez les fondations As → Roi par couleur.
          </Text>
        </View>
      </ScrollView>

      {/* Win modal */}
      <Modal visible={showWin} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <LinearGradient
            colors={['#0A0A1A', APP_CONFIG.secondary]}
            style={[styles.modalCard, { borderColor: APP_CONFIG.primary }]}
          >
            <Text style={styles.modalEmoji}>🏆</Text>
            <Text style={styles.modalTitle}>Klondike résolu !</Text>
            <Text style={styles.modalSub}>{state.moves} mouvements · {state.score} pts</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 18 }}>
              <TouchableOpacity onPress={reset} style={[styles.modalBtn, { backgroundColor: APP_CONFIG.primary }]}>
                <Text style={styles.modalBtnText}>🔄 Rejouer</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowWin(false); router.back(); }} style={[styles.modalBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                <Text style={styles.modalBtnText}>Quitter</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </Modal>

      {/* Quit modal */}
      <Modal visible={showQuit} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={styles.modalTitle}>Quitter ?</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 18 }}>
              <TouchableOpacity onPress={() => setShowQuit(false)} style={[styles.modalBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                <Text style={styles.modalBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowQuit(false); router.back(); }} style={[styles.modalBtn, { backgroundColor: '#EF4444' }]}>
                <Text style={styles.modalBtnText}>Quitter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(palette: any) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: palette.bg },
    body: { padding: 12, paddingBottom: 40 },
    banner: {
      flexDirection: 'row', justifyContent: 'space-around',
      borderRadius: 14, padding: 12, borderWidth: 1, marginBottom: 12,
    },
    bannerStat: { alignItems: 'center', flex: 1 },
    bannerLabel: { fontSize: 9, fontFamily: 'Inter-Bold', letterSpacing: 1 },
    bannerValue: { fontSize: 20, fontFamily: 'Inter-Black', marginTop: 4 },

    topRow: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingVertical: 10, marginBottom: 8,
    },
    slot: { width: 50, height: 70 },
    stockStack: { width: 50, height: 70, position: 'relative' },
    stockBadge: {
      position: 'absolute', bottom: -4, right: -4,
      backgroundColor: APP_CONFIG.primary, borderRadius: 999,
      paddingHorizontal: 6, paddingVertical: 1, minWidth: 18,
      alignItems: 'center',
    },
    stockBadgeText: { color: '#fff', fontSize: 10, fontFamily: 'Inter-Black' },
    emptyBox: {
      width: 50, height: 70, borderRadius: 8, borderWidth: 2, borderStyle: 'dashed',
      alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)',
    },
    foundationGlyph: { fontSize: 28 },

    sectionTitle: { fontSize: 13, fontFamily: 'Inter-Bold', marginBottom: 8, marginTop: 4 },

    tableauRow: { flexDirection: 'row', gap: 4, alignItems: 'flex-start', minHeight: 320 },
    tableauCol: { flex: 1, alignItems: 'center' },
    colLabel: { fontSize: 9, fontFamily: 'Inter-Bold', letterSpacing: 1, marginBottom: 4, opacity: 0.5 },
    tableauCardWrap: { zIndex: 1 },
    colEmpty: { width: 42, height: 62 },

    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 16, justifyContent: 'center' },
    actionBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12,
    },
    actionText: { color: '#fff', fontSize: 13, fontFamily: 'Inter-Bold' },

    helpBox: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 8,
      padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 16,
      backgroundColor: 'rgba(255,255,255,0.03)',
    },
    helpText: { flex: 1, fontSize: 11, fontFamily: 'Inter-Regular', lineHeight: 16 },

    modalBackdrop: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
      alignItems: 'center', justifyContent: 'center',
    },
    modalCard: {
      padding: 28, borderRadius: 20, alignItems: 'center', borderWidth: 2,
      minWidth: 280,
    },
    modalEmoji: { fontSize: 56, marginBottom: 8 },
    modalTitle: { color: '#fff', fontSize: 22, fontFamily: 'Inter-Black' },
    modalSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Inter-SemiBold', marginTop: 6 },
    modalBtn: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
    modalBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Bold' },

    // ── Opponent (Bot) plateau — visible en haut, mid-scale ──
    oppBoard: {
      borderRadius: 14,
      padding: 10,
      marginBottom: 8,
      backgroundColor: 'rgba(239,68,68,0.10)',
      borderWidth: 2,
      borderColor: 'rgba(239,68,68,0.45)',
    },
    oppHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    oppTitle: {
      color: '#fff',
      fontSize: 13,
      fontFamily: 'Inter-Black',
      letterSpacing: 1,
    },
    oppSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontFamily: 'Inter-Bold' },
    oppTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 4,
      marginBottom: 6,
    },
    oppSlot: { alignItems: 'center', gap: 2 },
    oppEmpty: {
      width: 36,
      height: 52,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.3)',
      borderStyle: 'dashed',
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    oppLbl: {
      color: 'rgba(255,255,255,0.75)',
      fontSize: 9,
      fontFamily: 'Inter-Bold',
    },
    oppTableauRow: {
      flexDirection: 'row',
      gap: 4,
      alignItems: 'flex-start',
      minHeight: 200,
    },
    oppCol: {
      flex: 1,
      alignItems: 'center',
    },

    // Overlay "En attente" + bouton "Activer le bot"
    oppWaitOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.65)',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      borderRadius: 14,
    },
    oppWaitText: {
      color: '#fff',
      fontSize: 13,
      fontFamily: 'Inter-Bold',
      textAlign: 'center',
      paddingHorizontal: 20,
    },
    activateBotBtn: {
      borderRadius: 14,
      overflow: 'hidden',
      marginTop: 6,
    },
    activateBotBtnGrad: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    activateBotBtnText: {
      color: '#fff',
      fontSize: 14,
      fontFamily: 'Inter-Black',
      letterSpacing: 0.5,
    },

    // ── Divider entre plateau adversaire et plateau utilisateur ──
    boardsDivider: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginVertical: 12,
    },
    dividerLine: { flex: 1, height: 1 },
    dividerBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: APP_CONFIG.primary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
    },
    dividerText: {
      color: '#fff',
      fontSize: 11,
      fontFamily: 'Inter-Black',
      letterSpacing: 1,
    },
  });
}
