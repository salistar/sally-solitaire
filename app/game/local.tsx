/**
 * @file game/local.tsx
 * @description Klondike Solitaire local game screen.
 * Classic layout with tableau columns, stock, waste, foundations.
 * Tap to select, tap destination to move.
 * Dark gradient bg with solitaire indigo (#4F46E5).
 */

import React, { useReducer, useCallback, useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import {
  GameState,
  GameAction,
  CardLocation,
  Card,
  gameReducer,
  createInitialState,
  canPlaceOnTableau,
  canPlaceOnFoundation,
  getMovableStack,
  getFoundationCount,
  TABLEAU_COLUMNS,
  FOUNDATION_PILES,
  SUIT_NAMES,
  Suit,
} from '../../src/game/solitaireEngine';
import { getCardImage, getCardBackImage } from '../../src/game/cardAssets';
import { useTranslation } from 'react-i18next';

/**
 * Bot now plays a REAL parallel Klondike with the same engine. Each tick
 * picks a greedy action and dispatches it. The plateau is rendered at
 * ~38% scale so the user can SEE the bot's cards moving in real time.
 */
type BotDifficulty = 'easy' | 'medium' | 'hard' | 'expert';
/** Milliseconds between two bot actions. Lower = faster bot. */
const BOT_TICK_MS: Record<BotDifficulty, number> = {
  easy: 3500,
  medium: 2200,
  hard: 1300,
  expert: 700,
};
const TOTAL_CARDS = 40;

/**
 * Greedy heuristic: foundation > tableau move that reveals a face-down
 * card > waste→tableau > stock draw. Returns null when no productive
 * action remains. Mirrors the engine's internal `pickGreedyAction`.
 */
function botPickAction(s: GameState): GameAction | null {
  // 1) Tableau top → foundation
  for (let col = 0; col < TABLEAU_COLUMNS; col++) {
    const c = s.tableau[col];
    if (!c.cards.length) continue;
    const top = c.cards[c.cards.length - 1];
    if (!top.faceUp) continue;
    for (let f = 0; f < FOUNDATION_PILES; f++) {
      if (canPlaceOnFoundation(top, s.foundations[f])) {
        return {
          type: 'MOVE_TO_FOUNDATION',
          from: { type: 'tableau', index: col, cardIndex: c.cards.length - 1 },
          cardId: top.id,
        };
      }
    }
  }
  // 2) Waste top → foundation
  if (s.waste.length) {
    const wt = s.waste[s.waste.length - 1];
    for (let f = 0; f < FOUNDATION_PILES; f++) {
      if (canPlaceOnFoundation(wt, s.foundations[f])) {
        return { type: 'MOVE_TO_FOUNDATION', from: { type: 'waste', index: 0 }, cardId: wt.id };
      }
    }
  }
  // 3) Tableau→tableau move that reveals a face-down card
  for (let from = 0; from < TABLEAU_COLUMNS; from++) {
    const fc = s.tableau[from];
    for (let ci = 0; ci < fc.cards.length; ci++) {
      if (!fc.cards[ci].faceUp) continue;
      const stack = getMovableStack(fc, ci);
      if (!stack) continue;
      const reveals = ci > 0 && !fc.cards[ci - 1].faceUp;
      if (!reveals) continue;
      for (let to = 0; to < TABLEAU_COLUMNS; to++) {
        if (to === from) continue;
        if (canPlaceOnTableau(stack[0], s.tableau[to])) {
          return {
            type: 'MOVE_CARD',
            from: { type: 'tableau', index: from, cardIndex: ci },
            to: { type: 'tableau', index: to },
          };
        }
      }
    }
  }
  // 4) Waste → tableau
  if (s.waste.length) {
    const wt = s.waste[s.waste.length - 1];
    for (let to = 0; to < TABLEAU_COLUMNS; to++) {
      if (canPlaceOnTableau(wt, s.tableau[to])) {
        return { type: 'MOVE_CARD', from: { type: 'waste', index: 0 }, to: { type: 'tableau', index: to } };
      }
    }
  }
  // 5) Draw from stock
  if (s.stock.length > 0 || s.waste.length > 0) {
    return { type: 'DRAW_FROM_STOCK' };
  }
  return null;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COL_GAP = 4;
const SIDE_PAD = 8;
const CARD_WIDTH = (SCREEN_WIDTH - SIDE_PAD * 2 - COL_GAP * 6) / 7;
const CARD_HEIGHT = CARD_WIDTH * 1.45;
const OVERLAP_FACE_DOWN = 10;
const OVERLAP_FACE_UP = 22;

// ── Bot plateau (mini scale, agrandi pour lire les vraies cartes) ──
const MINI_SCALE = 0.55;
const MINI_GAP = 2;
const MINI_CARD_WIDTH = CARD_WIDTH * MINI_SCALE;
const MINI_CARD_HEIGHT = MINI_CARD_WIDTH * 1.45;
const MINI_OVERLAP_DOWN = 6;
const MINI_OVERLAP_UP = 12;

const FOUNDATION_SUIT_ORDER: (Suit | null)[] = ['bastos', 'copas', 'espadas', 'oros'];

interface Selection {
  location: CardLocation;
  cards: Card[];
}

export default function SolitaireLocalGame() {
  const router = useRouter();
  const { t } = useTranslation('game');
  const params = useLocalSearchParams<{ mode?: string; difficulty?: string; botCount?: string }>();
  const isBotMode = params.mode === 'bot';
  const difficulty: BotDifficulty = useMemo(() => {
    const d = (params.difficulty || 'medium').toLowerCase();
    return (['easy', 'medium', 'hard', 'expert'] as const).includes(d as any)
      ? (d as BotDifficulty)
      : 'medium';
  }, [params.difficulty]);

  const [state, dispatch] = useReducer(gameReducer, createInitialState());
  const [selection, setSelection] = useState<Selection | null>(null);

  // ── Real bot game (parallel reducer with the same engine) ───────────────
  // The bot has its own complete Klondike state. A timer ticks at a rate
  // matching `difficulty` and dispatches one greedy action per tick.
  const [botState, botDispatch] = useReducer(gameReducer, undefined, () => createInitialState());
  const [raceWinner, setRaceWinner] = useState<'user' | 'bot' | null>(null);
  const botFoundationCount = getFoundationCount(botState);
  const startedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!isBotMode) return;
    if (raceWinner) return;
    if (botState.phase === 'won') return;
    const tickMs = BOT_TICK_MS[difficulty];
    const id = setInterval(() => {
      const action = botPickAction(botState);
      if (!action) return; // bot is stuck — no productive moves left
      botDispatch(action);
    }, tickMs);
    return () => clearInterval(id);
  }, [isBotMode, difficulty, raceWinner, botState]);

  // Race resolution — first to clear all 40 cards or win wins. Bot phase
  // 'won' OR user phase 'won' triggers the overlay exactly once.
  useEffect(() => {
    if (!isBotMode || raceWinner) return;
    if (state.phase === 'won') setRaceWinner('user');
    else if (botState.phase === 'won') setRaceWinner('bot');
  }, [isBotMode, state.phase, botState.phase, raceWinner]);

  // Draw from stock
  const handleStockTap = useCallback(() => {
    setSelection(null);
    dispatch({ type: 'DRAW_FROM_STOCK' });
  }, []);

  // Tap on waste top card
  const handleWasteTap = useCallback(() => {
    if (state.waste.length === 0) return;
    const card = state.waste[state.waste.length - 1];

    if (selection && selection.location.type === 'waste') {
      setSelection(null);
      return;
    }

    setSelection({
      location: { type: 'waste', index: 0 },
      cards: [card],
    });
  }, [state.waste, selection]);

  // Tap on foundation pile
  const handleFoundationTap = useCallback(
    (pileIndex: number) => {
      if (!selection) {
        // Pick up from foundation
        const fdn = state.foundations[pileIndex];
        if (fdn.cards.length === 0) return;
        const topCard = fdn.cards[fdn.cards.length - 1];
        setSelection({
          location: { type: 'foundation', index: pileIndex },
          cards: [topCard],
        });
        return;
      }

      // Try to place selection on foundation
      if (selection.cards.length === 1) {
        dispatch({
          type: 'MOVE_CARD',
          from: selection.location,
          to: { type: 'foundation', index: pileIndex },
        });
      }
      setSelection(null);
    },
    [selection, state.foundations]
  );

  // Tap on tableau card
  const handleTableauCardTap = useCallback(
    (colIndex: number, cardIndex: number) => {
      const column = state.tableau[colIndex];
      const card = column.cards[cardIndex];

      // If card is face down, ignore
      if (!card.faceUp) return;

      if (!selection) {
        // Select this card and stack below it
        const stack = getMovableStack(column, cardIndex);
        if (!stack) return;

        setSelection({
          location: { type: 'tableau', index: colIndex, cardIndex },
          cards: stack,
        });
        return;
      }

      // If tapping the same selection, try auto-move to foundation
      if (
        selection.location.type === 'tableau' &&
        selection.location.index === colIndex &&
        selection.location.cardIndex === cardIndex
      ) {
        // Double-tap: try foundation
        if (selection.cards.length === 1) {
          dispatch({
            type: 'MOVE_TO_FOUNDATION',
            from: selection.location,
            cardId: selection.cards[0].id,
          });
        }
        setSelection(null);
        return;
      }

      // Try to place selection on this column
      dispatch({
        type: 'MOVE_CARD',
        from: selection.location,
        to: { type: 'tableau', index: colIndex },
      });
      setSelection(null);
    },
    [selection, state.tableau]
  );

  // Tap on empty tableau column
  const handleEmptyColumnTap = useCallback(
    (colIndex: number) => {
      if (!selection) return;

      dispatch({
        type: 'MOVE_CARD',
        from: selection.location,
        to: { type: 'tableau', index: colIndex },
      });
      setSelection(null);
    },
    [selection]
  );

  // Auto-move waste to foundation (double tap)
  const handleWasteDoubleTap = useCallback(() => {
    if (state.waste.length === 0) return;
    const topCard = state.waste[state.waste.length - 1];
    dispatch({
      type: 'MOVE_TO_FOUNDATION',
      from: { type: 'waste', index: 0 },
      cardId: topCard.id,
    });
    setSelection(null);
  }, [state.waste]);

  // Auto complete
  const handleAutoComplete = useCallback(() => {
    dispatch({ type: 'AUTO_COMPLETE' });
    setSelection(null);
  }, []);

  // Restart
  const handleRestart = useCallback(() => {
    setSelection(null);
    dispatch({ type: 'RESET' });
    botDispatch({ type: 'RESET' });
    setRaceWinner(null);
    startedAtRef.current = Date.now();
  }, []);

  const isCardSelected = (loc: CardLocation, cardIdx?: number): boolean => {
    if (!selection) return false;
    if (selection.location.type !== loc.type) return false;
    if (selection.location.index !== loc.index) return false;
    if (loc.type === 'tableau' && cardIdx !== undefined) {
      return (selection.location.cardIndex ?? -1) <= cardIdx;
    }
    return true;
  };

  const foundationCount = getFoundationCount(state);

  return (
    <LinearGradient colors={['#0f0a2e', '#4F46E5', '#2d2478']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>
            {isBotMode ? t('solitaire.vsBot', { difficulty }) : t('solitaire.title')}
          </Text>
          <View style={styles.headerRight}>
            <Text style={styles.movesText}>{t('solitaire.moves', { count: state.moves })}</Text>
            <TouchableOpacity onPress={handleRestart} style={styles.restartButton}>
              <Ionicons name="refresh" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* USER PLATEAU EN PREMIER (en haut, plein écran) — interactif. */}
        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
          {/* Top row: Stock + Waste | Foundations */}
          <View style={styles.topRow}>
            {/* Stock */}
            <TouchableOpacity onPress={handleStockTap} style={styles.stockPile}>
              {state.stock.length > 0 ? (
                <Image
                  source={getCardBackImage()}
                  style={styles.topCardImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.emptyPile}>
                  <Ionicons name="refresh-circle-outline" size={28} color="rgba(255,255,255,0.4)" />
                </View>
              )}
              <Text style={styles.pileCount}>{state.stock.length}</Text>
            </TouchableOpacity>

            {/* Waste */}
            <TouchableOpacity
              onPress={handleWasteTap}
              onLongPress={handleWasteDoubleTap}
              style={styles.wastePile}
            >
              {state.waste.length > 0 ? (
                <View
                  style={[
                    styles.topCardContainer,
                    isCardSelected({ type: 'waste', index: 0 }) && styles.selectedCard,
                  ]}
                >
                  <Image
                    source={getCardImage(state.waste[state.waste.length - 1].id)}
                    style={styles.topCardImage}
                    resizeMode="contain"
                  />
                </View>
              ) : (
                <View style={styles.emptyPile} />
              )}
            </TouchableOpacity>

            <View style={styles.topSpacer} />

            {/* Foundations */}
            {state.foundations.map((fdn, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => handleFoundationTap(idx)}
                style={styles.foundationPile}
              >
                {fdn.cards.length > 0 ? (
                  <View
                    style={[
                      styles.topCardContainer,
                      isCardSelected({ type: 'foundation', index: idx }) && styles.selectedCard,
                    ]}
                  >
                    <Image
                      source={getCardImage(fdn.cards[fdn.cards.length - 1].id)}
                      style={styles.topCardImage}
                      resizeMode="contain"
                    />
                  </View>
                ) : (
                  <View style={styles.emptyPile}>
                    <Text style={styles.foundationLabel}>
                      {FOUNDATION_SUIT_ORDER[idx]
                        ? SUIT_NAMES[FOUNDATION_SUIT_ORDER[idx]!].charAt(0)
                        : 'A'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Auto-complete button */}
          {foundationCount >= 20 && state.phase === 'playing' && (
            <TouchableOpacity onPress={handleAutoComplete} style={styles.autoCompleteBtn}>
              <Text style={styles.autoCompleteText}>{t('solitaire.autoComplete')}</Text>
            </TouchableOpacity>
          )}

          {/* Tableau */}
          <View style={styles.tableauRow}>
            {state.tableau.map((column, colIdx) => (
              <View key={colIdx} style={styles.tableauColumn}>
                {column.cards.length === 0 ? (
                  <TouchableOpacity
                    onPress={() => handleEmptyColumnTap(colIdx)}
                    style={styles.emptyColumn}
                  >
                    <View style={styles.emptyPile} />
                  </TouchableOpacity>
                ) : (
                  column.cards.map((card, cardIdx) => {
                    const offset =
                      cardIdx === 0
                        ? 0
                        : card.faceUp
                          ? OVERLAP_FACE_UP
                          : OVERLAP_FACE_DOWN;
                    const isSelected = isCardSelected(
                      { type: 'tableau', index: colIdx },
                      cardIdx
                    );

                    return (
                      <TouchableOpacity
                        key={card.id}
                        onPress={() => handleTableauCardTap(colIdx, cardIdx)}
                        style={[
                          styles.tableauCard,
                          cardIdx > 0 && { marginTop: -CARD_HEIGHT + offset },
                          isSelected && styles.selectedCard,
                        ]}
                        activeOpacity={card.faceUp ? 0.7 : 1}
                        disabled={!card.faceUp && !selection}
                      >
                        <Image
                          source={
                            card.faceUp
                              ? getCardImage(card.id)
                              : getCardBackImage()
                          }
                          style={styles.tableauCardImage}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            ))}
          </View>
        </ScrollView>

        {/* PLATEAU DU BOT — APRÈS le ScrollView user. Race banner + plateau
            mini regroupés ici en bas. Read-only. */}
        {isBotMode && (
          <View style={styles.botBoard} pointerEvents="none">
            {/* Race banner intégré : progress du user + bot côte-à-côte */}
            <View style={styles.raceBanner}>
              <View style={styles.raceRow}>
                <View style={styles.raceLabelWrap}>
                  <Ionicons name="person" size={14} color="#fff" />
                  <Text style={styles.raceLabel}>{t('solitaire.you')}</Text>
                </View>
                <View style={styles.raceTrack}>
                  <View
                    style={[
                      styles.raceFillUser,
                      { width: `${Math.min(100, (foundationCount / TOTAL_CARDS) * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.raceCount}>{foundationCount}/{TOTAL_CARDS}</Text>
              </View>
              <View style={styles.raceRow}>
                <View style={styles.raceLabelWrap}>
                  <Ionicons name="hardware-chip" size={14} color="#fff" />
                  <Text style={styles.raceLabel}>{t('solitaire.bot')}</Text>
                </View>
                <View style={styles.raceTrack}>
                  <View
                    style={[
                      styles.raceFillBot,
                      { width: `${Math.min(100, (botFoundationCount / TOTAL_CARDS) * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.raceCount}>{botFoundationCount}/{TOTAL_CARDS}</Text>
              </View>
            </View>

            <View style={styles.botBoardHeader}>
              <Ionicons name="hardware-chip" size={12} color="#EF4444" />
              <Text style={styles.botBoardTitle}>{t('solitaire.botBoard')}</Text>
              <View style={styles.botBoardSpacer} />
              <Text style={styles.botBoardSub}>
                {t('solitaire.botBoardSub', { moves: botState.moves, difficulty })}
              </Text>
            </View>

            {/* Top row: stock + waste + foundations */}
            <View style={styles.miniTopRow}>
              <View style={styles.miniSlot}>
                {botState.stock.length > 0 ? (
                  <Image source={getCardBackImage()} style={styles.miniCardImg} resizeMode="contain" />
                ) : (
                  <View style={[styles.miniCardImg, styles.miniEmpty]} />
                )}
                <Text style={styles.miniLabel}>{botState.stock.length}</Text>
              </View>
              <View style={styles.miniSlot}>
                {botState.waste.length > 0 ? (
                  <Image
                    source={getCardImage(botState.waste[botState.waste.length - 1].id)}
                    style={styles.miniCardImg}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={[styles.miniCardImg, styles.miniEmpty]} />
                )}
                <Text style={styles.miniLabel}>W</Text>
              </View>
              <View style={styles.miniTopSpacer} />
              {botState.foundations.map((fdn, idx) => (
                <View key={idx} style={styles.miniSlot}>
                  {fdn.cards.length > 0 ? (
                    <Image
                      source={getCardImage(fdn.cards[fdn.cards.length - 1].id)}
                      style={styles.miniCardImg}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={[styles.miniCardImg, styles.miniEmpty]}>
                      <Text style={styles.miniFoundationLabel}>A</Text>
                    </View>
                  )}
                  <Text style={styles.miniLabel}>{fdn.cards.length}</Text>
                </View>
              ))}
            </View>

            {/* Tableau row: 7 columns at mini scale */}
            <View style={styles.miniTableauRow}>
              {botState.tableau.map((column, colIdx) => (
                <View key={colIdx} style={styles.miniColumn}>
                  {column.cards.length === 0 ? (
                    <View style={[styles.miniCardImg, styles.miniEmpty]} />
                  ) : (
                    column.cards.map((card, ci) => {
                      const offset = ci === 0 ? 0 : card.faceUp ? MINI_OVERLAP_UP : MINI_OVERLAP_DOWN;
                      return (
                        <Image
                          key={card.id}
                          source={card.faceUp ? getCardImage(card.id) : getCardBackImage()}
                          style={[
                            styles.miniCardImg,
                            ci > 0 && { marginTop: -MINI_CARD_HEIGHT + offset },
                          ]}
                          resizeMode="contain"
                        />
                      );
                    })
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Win overlay — solo OR race-vs-bot result */}
        {((!isBotMode && state.phase === 'won') || (isBotMode && raceWinner)) && (
          <View style={styles.winOverlay}>
            <View style={styles.winCard}>
              <Text style={[styles.winTitle, isBotMode && raceWinner === 'bot' && { color: '#EF4444' }]}>
                {isBotMode
                  ? raceWinner === 'user'
                    ? t('solitaire.victoryVsBot')
                    : t('solitaire.defeatVsBot')
                  : t('solitaire.victorySolo')}
              </Text>
              <Text style={styles.winSubtitle}>
                {isBotMode
                  ? t('solitaire.winSubBot', { u: foundationCount, b: botFoundationCount, tot: TOTAL_CARDS, m: state.moves })
                  : t('solitaire.winSubSolo', { m: state.moves })}
              </Text>
              <TouchableOpacity onPress={handleRestart} style={styles.playAgainButton}>
                <Text style={styles.playAgainText}>{t('solitaire.playAgain')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.back()} style={styles.quitButton}>
                <Text style={styles.quitText}>{t('solitaire.quit')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  movesText: {
    color: '#c7d2fe',
    fontSize: 14,
    fontWeight: '600',
  },
  restartButton: {
    padding: 6,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  topRow: {
    flexDirection: 'row',
    paddingHorizontal: SIDE_PAD,
    gap: COL_GAP,
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  stockPile: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    alignItems: 'center',
  },
  wastePile: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
  topSpacer: {
    flex: 1,
  },
  foundationPile: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
  topCardContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 6,
    overflow: 'hidden',
  },
  topCardImage: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 6,
  },
  emptyPile: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  foundationLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 16,
    fontWeight: '700',
  },
  pileCount: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    marginTop: 2,
  },
  autoCompleteBtn: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 8,
  },
  autoCompleteText: {
    color: '#c7d2fe',
    fontSize: 13,
    fontWeight: '600',
  },
  tableauRow: {
    flexDirection: 'row',
    paddingHorizontal: SIDE_PAD,
    gap: COL_GAP,
    alignItems: 'flex-start',
  },
  tableauColumn: {
    width: CARD_WIDTH,
    alignItems: 'center',
  },
  emptyColumn: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
  tableauCard: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tableauCardImage: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 6,
  },
  selectedCard: {
    borderWidth: 2,
    borderColor: '#fbbf24',
    borderRadius: 8,
    shadowColor: '#fbbf24',
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  winOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  winCard: {
    backgroundColor: '#1f1f2e',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    width: '80%',
  },
  winTitle: {
    color: '#4F46E5',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  winSubtitle: {
    color: '#c7d2fe',
    fontSize: 16,
    marginBottom: 20,
  },
  playAgainButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  playAgainText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  quitButton: {
    marginTop: 12,
    paddingVertical: 8,
  },
  quitText: {
    color: '#aaa',
    fontSize: 14,
  },
  raceBanner: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 6,
  },
  raceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  raceLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 52,
  },
  raceLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  raceTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  raceFillUser: {
    height: '100%',
    backgroundColor: '#22C55E',
  },
  raceFillBot: {
    height: '100%',
    backgroundColor: '#EF4444',
  },
  raceCount: {
    color: '#c7d2fe',
    fontSize: 11,
    fontWeight: '600',
    width: 44,
    textAlign: 'right',
  },
  botBoard: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
  },
  botBoardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  botBoardTitle: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  botBoardSpacer: { flex: 1 },
  botBoardSub: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '600' },
  miniTopRow: {
    flexDirection: 'row',
    gap: MINI_GAP,
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  miniTopSpacer: { flex: 1 },
  miniSlot: {
    alignItems: 'center',
    gap: 1,
  },
  miniCardImg: {
    width: MINI_CARD_WIDTH,
    height: MINI_CARD_HEIGHT,
    borderRadius: 2,
  },
  miniEmpty: {
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.25)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniFoundationLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 8,
    fontWeight: '700',
  },
  miniLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 7,
    fontWeight: '600',
  },
  miniTableauRow: {
    flexDirection: 'row',
    gap: MINI_GAP,
    alignItems: 'flex-start',
  },
  miniColumn: {
    width: MINI_CARD_WIDTH,
    alignItems: 'center',
  },
});
