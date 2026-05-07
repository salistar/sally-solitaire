/**
 * @file VsBotOverlay.tsx
 * @description Bandeau "vs Bot" + VRAI mini-plateau bot rendu au-dessus de
 * n'importe quel écran de Solitaire (Klondike / Spider / FreeCell / Yukon /
 * Golf / Pyramid / TriPeaks / Forty Thieves / Accordion).
 *
 * Approche
 * --------
 * Plutôt que dupliquer 9 fois la logique de chaque engine, on accepte un
 * MODULE engine en prop (qui exporte au minimum `gameReducer`,
 * `createInitialState`, `findHint`). On instancie un reducer parallèle
 * pour le bot, on tick sa heuristique, et on rend une vue générique du
 * tableau (toutes les variantes ont un `state.tableau`).
 *
 * Le bot ne démarre QUE quand l'utilisateur clique "Activer le Bot" pour
 * laisser le temps de comprendre la variante.
 */

import React, { useEffect, useReducer, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { FRENCH_CARD_IMAGES } from './FrenchCard';

export type BotDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

const BOT_TICK_MS: Record<BotDifficulty, number> = {
  easy: 4000,
  medium: 2500,
  hard: 1500,
  expert: 800,
};

/** Module engine attendu — toutes les variantes exposent ces 3 symboles. */
interface EngineModule {
  gameReducer: (state: any, action: any) => any;
  createInitialState: (...args: any[]) => any;
  findHint?: (state: any) => any | null;
}

interface Props {
  /** Module engine du même type que celui de l'utilisateur. */
  engine: EngineModule;
  difficulty?: BotDifficulty;
  variantName?: string;
  /** True quand le user gagne sa partie → déclenche overlay 🏆. */
  userWon?: boolean;
  onReplay?: () => void;
  onQuit?: () => void;
}

/** Convertit une Card du moteur en code carte française (deckofcardsapi).
 *  - Valeur : 1→A, 2-9→'2'..'9', 10→'0', 11→J, 12→Q, 13→K
 *  - Couleur : spades→S, hearts→H, diamonds→D, clubs→C
 *  - Tolère aussi les couleurs espagnoles (bastos→C, copas→H, espadas→S, oros→D)
 *  - Retourne null si la carte n'est pas reconnue. */
function cardCodeFor(c: any): string | null {
  if (!c) return null;
  const v = c.value;
  if (typeof v !== 'number') return null;
  const value = v === 1 ? 'A' : v === 10 ? '0' : v === 11 ? 'J' : v === 12 ? 'Q' : v === 13 ? 'K' : String(v);
  const suitMap: Record<string, string> = {
    spades: 'S', hearts: 'H', diamonds: 'D', clubs: 'C',
    espadas: 'S', copas: 'H', oros: 'D', bastos: 'C',
  };
  const suit = suitMap[c.suit];
  if (!suit) return null;
  return `${value}${suit}`;
}

/** Récupère le PNG d'une carte FR par son code (ex: 'AS', '0H'). */
function getFrenchCard(code: string | null): any {
  if (!code) return FRENCH_CARD_IMAGES['BACK'];
  return FRENCH_CARD_IMAGES[code] ?? FRENCH_CARD_IMAGES['BACK'];
}

export default function VsBotOverlay({
  engine,
  difficulty = 'medium',
  variantName,
  userWon,
  onReplay,
  onQuit,
}: Props) {
  const { t } = useTranslation('game');
  // Reducer parallèle pour le bot — utilise le MÊME engine que le user.
  const [botState, botDispatch] = useReducer(
    engine.gameReducer,
    undefined,
    () => engine.createInitialState(),
  );
  const [botActive, setBotActive] = useState(false);
  const [winner, setWinner] = useState<'user' | 'bot' | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Tick bot — appelle engine.findHint() ou pioche du stock par défaut.
  useEffect(() => {
    if (!botActive || winner) return;
    if (botState.phase === 'won') {
      setWinner('bot');
      return;
    }
    const id = setInterval(() => {
      let action: any = null;
      if (typeof engine.findHint === 'function') action = engine.findHint(botState);
      if (action) {
        botDispatch(action);
      } else if (botState.stock?.length > 0 || botState.waste?.length > 0) {
        botDispatch({ type: 'DRAW_FROM_STOCK' });
      }
      // si rien à jouer → bot bloqué, on laisse l'utilisateur finir
    }, BOT_TICK_MS[difficulty]);
    return () => clearInterval(id);
  }, [botActive, difficulty, winner, botState, engine]);

  useEffect(() => {
    if (userWon && !winner) setWinner('user');
  }, [userWon, winner]);

  // Compteur générique foundations (selon engine : `foundations[].cards`,
  // `completed[]`, ou via state.score si pas de foundation).
  const botFoundations =
    botState.foundations?.reduce((acc: number, f: any) => acc + (f.cards?.length || 0), 0) ??
    botState.completed?.length ??
    0;

  // Si user gagne avant le bot → modal victoire
  return (
    <>
      <LinearGradient
        colors={['#064E3B', '#065F46', '#047857']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.banner}
      >
        <View style={styles.bannerHeader}>
          <Ionicons
            name={botActive ? 'hardware-chip' : 'hourglass-outline'}
            size={14}
            color="#A7F3D0"
          />
          <Text style={styles.bannerTitle}>
            {botActive ? t('vsbot.botActive', { difficulty }) : t('vsbot.botWaiting')}
          </Text>
          <View style={{ flex: 1 }} />
          {variantName && <Text style={styles.bannerVariant}>{variantName}</Text>}
          <TouchableOpacity onPress={() => setCollapsed((c) => !c)} style={styles.collapseBtn}>
            <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={16} color="#fff" />
          </TouchableOpacity>
        </View>

        <Text style={styles.botStats}>
          {t('vsbot.statsLine', {
            foundations: botFoundations,
            moves: botState.moves ?? 0,
          })}
          {botState.stock?.length !== undefined ? ` · 🎴 ${botState.stock.length}` : ''}
        </Text>

        {/* Mini plateau du bot — VRAIES cartes françaises (assets/cards-fr/).
            Stock + waste + foundations en haut, tableau 7 colonnes en dessous. */}
        {!collapsed && (
          <View style={styles.miniBoard}>
            {/* Top row: stock / waste / foundations */}
            <View style={styles.miniTopRow}>
              <View style={[styles.miniCard, !botState.stock?.length && styles.miniCardEmpty]}>
                {botState.stock?.length > 0 && (
                  <Image source={FRENCH_CARD_IMAGES['BACK']} style={styles.miniCardImg} resizeMode="contain" />
                )}
              </View>
              <View style={[styles.miniCard, !botState.waste?.length && styles.miniCardEmpty]}>
                {botState.waste?.length > 0 && (() => {
                  const code = cardCodeFor(botState.waste[botState.waste.length - 1]);
                  return code ? (
                    <Image source={getFrenchCard(code)} style={styles.miniCardImg} resizeMode="contain" />
                  ) : null;
                })()}
              </View>
              <View style={{ flex: 1 }} />
              {Array.isArray(botState.foundations) && botState.foundations.map((f: any, i: number) => {
                const top = f.cards?.length ? f.cards[f.cards.length - 1] : null;
                const code = top ? cardCodeFor(top) : null;
                return (
                  <View key={i} style={[styles.miniCard, !code && styles.miniCardEmpty]}>
                    {code && <Image source={getFrenchCard(code)} style={styles.miniCardImg} resizeMode="contain" />}
                  </View>
                );
              })}
            </View>

            {/* Tableau columns */}
            {Array.isArray(botState.tableau) && (
              <View style={styles.miniTableauRow}>
                {botState.tableau.map((col: any, ci: number) => (
                  <View key={ci} style={styles.miniCol}>
                    {(col.cards ?? []).slice(-6).map((card: any, idx: number) => {
                      const code = card.faceUp ? cardCodeFor(card) : null;
                      const src = code ? getFrenchCard(code) : FRENCH_CARD_IMAGES['BACK'];
                      return (
                        <View
                          key={card.id || idx}
                          style={[
                            styles.miniCard,
                            { marginTop: idx === 0 ? 0 : -36 },
                          ]}
                        >
                          <Image source={src} style={styles.miniCardImg} resizeMode="contain" />
                        </View>
                      );
                    })}
                    {(!col.cards || col.cards.length === 0) && (
                      <View style={[styles.miniCard, styles.miniCardEmpty]} />
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {!botActive && (
          <TouchableOpacity
            onPress={() => setBotActive(true)}
            activeOpacity={0.85}
            style={styles.activateBtn}
          >
            <LinearGradient
              colors={['#0EA5E9', '#3B82F6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.activateBtnGrad}
            >
              <Ionicons name="play" size={14} color="#fff" />
              <Text style={styles.activateBtnText}>{t('vsbot.activate')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </LinearGradient>

      <Modal visible={!!winner} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>{winner === 'user' ? '🏆' : '🤖'}</Text>
            <Text style={styles.modalTitle}>
              {winner === 'user' ? t('vsbot.modalUserWon') : t('vsbot.modalBotWon')}
            </Text>
            <Text style={styles.modalSub}>
              {t('vsbot.modalBotStats', {
                foundations: botFoundations,
                moves: botState.moves ?? 0,
              })}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => {
                  setWinner(null);
                  setBotActive(false);
                  botDispatch({ type: 'RESET' });
                  onReplay?.();
                }}
                style={[styles.modalBtn, { backgroundColor: '#0EA5E9' }]}
              >
                <Text style={styles.modalBtnText}>{t('vsbot.replay')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onQuit?.()}
                style={[styles.modalBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}
              >
                <Text style={styles.modalBtnText}>{t('vsbot.quit')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flex: 1,
    margin: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.6)',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bannerTitle: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  bannerVariant: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 10,
    fontWeight: '700',
  },
  botStats: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  collapseBtn: {
    width: 24, height: 24,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
  },

  // ── Plateau bot — taille équivalente au plateau user (flex: 1) ──
  miniBoard: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    padding: 6,
    borderRadius: 8,
    gap: 6,
  },
  miniTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  miniTableauRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'flex-start',
  },
  miniCol: {
    flex: 1,
    alignItems: 'center',
  },
  miniCard: {
    width: 38,
    height: 54,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 1,
    overflow: 'hidden',
  },
  miniCardImg: {
    width: '100%',
    height: '100%',
  },
  miniCardUp: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
  },
  miniCardDown: {
    backgroundColor: '#1e3a8a',
    borderWidth: 1,
    borderColor: '#60a5fa',
  },
  miniCardEmpty: {
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.3)',
    borderStyle: 'dashed',
  },
  miniCardText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#000',
  },
  miniCardBack: {
    fontSize: 11,
    fontWeight: '900',
    color: '#fff',
  },

  activateBtn: {
    borderRadius: 10,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  activateBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  activateBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: '#1f1f2e',
    padding: 28,
    borderRadius: 20,
    alignItems: 'center',
    minWidth: 280,
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  modalEmoji: { fontSize: 56, marginBottom: 8 },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  modalSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  modalBtn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  modalBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
