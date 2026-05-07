/**
 * @file spiderBDAdapter.ts — Adapter pour les deals Spider v2 pré-générés.
 *
 * Convertit le format JSON (cartes "KS"/"ks", tableau/stock/foundations) du
 * service `spider_deals_v2` vers le format `GameState` de `spiderEngine.ts`,
 * et la séquence de moves vers la séquence d'`GameAction` du moteur.
 *
 * NB : on NE TOUCHE PAS au moteur lui-même. Cet adapter fait du mapping pur.
 */
import type {
  Card, Column, GameState, GameAction, Suit, CardValue, SuitMode,
} from './spiderEngine';

/** Format brut côté serveur (cf JSON pré-généré). */
export interface SpiderV2RawDeal {
  _id: string;
  variant: string;
  difficulty: string;
  solvable: boolean;
  total_turns: number;
  solution_length: number;
  turns: SpiderV2RawTurn[];
}

export interface SpiderV2RawTurn {
  turn: number;
  move: SpiderV2RawMove | null;
  description?: string;
  state: SpiderV2RawState;
}

export interface SpiderV2RawState {
  tableau: string[][];   // 10 colonnes ; chaque carte "KS"/"ks"
  stock: string[][];     // packets de 10 cartes ; chaque carte "KS"/"ks"
  foundations: any[];    // peu utilisé côté front (juste affichage du compteur)
}

export interface SpiderV2RawMove {
  type: 'MOVE' | 'FOUNDATION' | 'DEAL' | string;
  from?: number;
  to?: number;
  count?: number;
}

/** Tente de déduire le SuitMode à partir d'un nom de variante (1-suit/2-suit/4-suit). */
export function variantToSuitMode(variant: string | undefined): SuitMode {
  if (!variant) return 4;
  if (variant.includes('1')) return 1;
  if (variant.includes('2')) return 2;
  return 4;
}

/** Mapping suit lettre → string moteur. */
function suitFromLetter(letter: string): Suit | null {
  switch (letter.toUpperCase()) {
    case 'S': return 'spades';
    case 'H': return 'hearts';
    case 'D': return 'diamonds';
    case 'C': return 'clubs';
    default: return null;
  }
}

/** Parse un code carte type "KS" / "ks" / "10S" / "AS" → {suit,value,faceUp}. */
function parseCardCode(code: string): { suit: Suit; value: CardValue; faceUp: boolean } | null {
  if (!code) return null;
  // Le suit est la dernière lettre. Tout ce qui précède = rang.
  const suitLetter = code[code.length - 1];
  const rankPart = code.slice(0, -1);
  const suit = suitFromLetter(suitLetter);
  if (!suit) return null;
  // faceUp si suit en majuscule
  const faceUp = suitLetter === suitLetter.toUpperCase();
  let value: CardValue;
  switch (rankPart.toUpperCase()) {
    case 'A': value = 1; break;
    case 'J': value = 11; break;
    case 'Q': value = 12; break;
    case 'K': value = 13; break;
    case '10': value = 10; break;
    default: {
      const n = parseInt(rankPart, 10);
      if (!Number.isFinite(n) || n < 2 || n > 9) return null;
      value = n as CardValue;
    }
  }
  return { suit, value, faceUp };
}

/** Convertit un code carte + index unique → Card. */
function makeCard(code: string, idCounter: { n: number }): Card | null {
  const parsed = parseCardCode(code);
  if (!parsed) return null;
  const id = `bd-${parsed.value.toString().padStart(2, '0')}-${parsed.suit}-${idCounter.n++}`;
  return { suit: parsed.suit, value: parsed.value, id, faceUp: parsed.faceUp };
}

/**
 * Convertit l'état `state` (turn 0 typiquement) du JSON vers un GameState moteur.
 * Le stock est aplati (packets concaténés) pour que `DEAL_ROW` puisse piocher
 * les 10 cartes du dessus à chaque deal — c'est le contrat du moteur.
 */
export function convertRawStateToGameState(
  raw: SpiderV2RawState,
  suitMode: SuitMode,
): GameState {
  const idCounter = { n: 0 };

  const tableau: Column[] = (raw.tableau ?? []).map((col) => {
    const cards: Card[] = [];
    for (const code of col ?? []) {
      const card = makeCard(code, idCounter);
      if (card) cards.push(card);
    }
    // SANITIZE : Python génère parfois des états où une carte face-down
    // est entourée de cartes face-up (anomalie non réalisable en Spider
    // standard). On force l'invariant "face-down forment un préfixe en
    // bas, face-up forment un suffixe en haut". Concrètement : on scan
    // depuis le BAS, et dès qu'on voit une face-up, tout au-dessus doit
    // être face-up.
    let foundFaceUp = false;
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].faceUp) {
        foundFaceUp = true;
      } else if (foundFaceUp) {
        // Carte face-down trouvée APRÈS une face-up : flip-la face-up
        cards[i] = { ...cards[i], faceUp: true };
      }
    }
    return { cards };
  });
  // Compléter à 10 colonnes si jamais le JSON est tronqué
  while (tableau.length < 10) tableau.push({ cards: [] });

  // Stock : on aplatit les packets dans l'ordre. Chaque DEAL_ROW pioche les
  // 10 premières cartes via slice(0..10), donc l'ordre des packets est
  // significatif (packet[0] = premier deal).
  const stock: Card[] = [];
  for (const packet of raw.stock ?? []) {
    for (const code of packet ?? []) {
      const card = makeCard(code, idCounter);
      if (card) stock.push(card);
    }
  }

  return {
    tableau,
    stock,
    completed: [],
    moves: 0,
    score: 500, // score initial standard Spider (cohérent avec createInitialState)
    phase: 'playing',
    suitMode,
  };
}

/**
 * Convertit un move JSON (turn N) vers une GameAction du moteur.
 *
 * Le `from`, `to` du JSON sont 0-indexés (cf JSON example). Le `count` du
 * JSON = nombre de cartes déplacées ; on en déduit `fromCardIndex` à partir
 * de la taille COURANTE de la colonne source (à l'instant du coup).
 *
 * IMPORTANT : on a besoin de la longueur de la colonne source AVANT le coup.
 * C'est pourquoi on prend le state du turn précédent en argument (ou le state
 * actuel si on est en mode "play").
 *
 * Retourne null si la conversion est impossible (move inconnu).
 */
export function convertRawMoveToAction(
  move: SpiderV2RawMove | null,
  fromColLen: number,
): GameAction | null {
  if (!move) return null;
  switch (move.type) {
    case 'MOVE': {
      const from = typeof move.from === 'number' ? move.from : -1;
      const to = typeof move.to === 'number' ? move.to : -1;
      const count = Math.max(1, typeof move.count === 'number' ? move.count : 1);
      if (from < 0 || to < 0) return null;
      const fromCardIndex = Math.max(0, fromColLen - count);
      // CRUCIAL : skipAutoComplete=true ! Python a des moves FOUNDATION
      // EXPLICITES séparés. Si on laisse le moteur auto-compléter à chaque
      // MOVE_RUN, l'état diverge de Python (cartes retirées trop tôt) et
      // les moves suivants ne correspondent plus aux indices Python.
      return { type: 'MOVE_RUN', fromCol: from, fromCardIndex, toCol: to, skipAutoComplete: true };
    }
    case 'FOUNDATION':
      // Python marque explicitement quand une fondation se complète. On
      // appelle AUTO_COMPLETE qui détecte les K→A et les déplace.
      return { type: 'AUTO_COMPLETE' };
    case 'DEAL':
      return { type: 'DEAL_ROW' };
    default:
      return null;
  }
}
