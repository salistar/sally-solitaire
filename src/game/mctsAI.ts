// بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
// SallyCards Solitaire — Monte Carlo Tree Search (MCTS) AI
//
// Implémentation générique du MCTS pour Solitaire. Spec section 4 du PDF.
//
// POURQUOI MCTS plutôt que Minimax ?
//   - Solitaire = jeu à information IMPARFAITE (cartes face-down inconnues du joueur).
//   - Espace d'états ≈ 10^40, Minimax+α/β impraticable.
//   - MCTS guidé par UCB1 + rollouts random est l'algo de référence (Bjarnason 2007).
//
// ARCHITECTURE :
//   - Generic over any engine that exposes (state, action, reducer, isTerminal, score).
//   - 4 phases UCB1 : Selection → Expansion → Simulation → Backpropagation.
//   - Heuristique de rollout pondérée (pas pur random) pour Solitaire (spec section 4.3).
//
// USAGE :
//   const ai = new MctsAI({
//     getLegalMoves, applyMove, isTerminal, evaluateTerminal, hashState
//   });
//   const move = ai.search(currentState, { iterations: 2000, timeoutMs: 500 });

/**
 * Niveaux de difficulté MCTS (spec section 4.4) :
 *   - Facile     : 200 itérations,    < 100ms,  10% coups random pour humaniser
 *   - Moyen      : 2 000 itérations,  < 500ms,  MCTS pur
 *   - Difficile  : 20 000 itérations, < 3s,     MCTS profond + opening book
 */
export type MctsDifficulty = 'easy' | 'medium' | 'hard';

export const MCTS_DIFFICULTY_PRESETS: Record<MctsDifficulty, MctsConfig> = {
  easy: { iterations: 200, timeoutMs: 100, randomChance: 0.10, c: Math.SQRT2 },
  medium: { iterations: 2000, timeoutMs: 500, randomChance: 0, c: Math.SQRT2 },
  hard: { iterations: 20000, timeoutMs: 3000, randomChance: 0, c: Math.SQRT2 },
};

export interface MctsConfig {
  /** Nombre maximum d'itérations (selection→expansion→sim→backprop). */
  iterations: number;
  /** Timeout dur en millisecondes (l'algo s'arrête même si itérations restantes). */
  timeoutMs: number;
  /** Probabilité de jouer un coup random au lieu du meilleur (humanise l'IA Facile). */
  randomChance: number;
  /** Constante d'exploration UCB1 (par défaut sqrt(2) — référence Kocsis-Szepesvari). */
  c: number;
}

/**
 * Adapter générique : l'AI utilise ces 5 fonctions pour interroger le moteur.
 * Permet de brancher MCTS sur Klondike, Spider, FreeCell, etc. sans recoder.
 */
export interface MctsAdapter<S, A> {
  /** Liste des coups légaux dans un état donné. */
  getLegalMoves(state: S): A[];
  /** Applique un coup et retourne le nouvel état (idéalement immutable). */
  applyMove(state: S, action: A): S;
  /** L'état est-il terminal (gagné, perdu, bloqué) ? */
  isTerminal(state: S): boolean;
  /** Récompense d'un état terminal, normalisée dans [0..1] (1 = victoire). */
  evaluateTerminal(state: S): number;
  /** Hash unique de l'état pour transposition table (optionnel mais accélère). */
  hashState(state: S): string;
  /**
   * Heuristique de simulation (spec section 4.3) : pondère les coups pendant le rollout.
   * Retourne une valeur "désirabilité" ; plus c'est haut, plus le coup sera tiré.
   *   - +100 : carte vers fondation
   *   - +50  : retournement face-down
   *   - +30  : défausse → tableau
   *   - +20  : séquence vers col vide (Roi)
   *   - +10  : draw stock
   *   - +1   : autres mouvements latéraux
   */
  heuristic(state: S, action: A): number;
}

interface MctsNode<S, A> {
  state: S;
  parent: MctsNode<S, A> | null;
  /** Le coup qui a mené à cet état depuis le parent. */
  incomingMove: A | null;
  children: MctsNode<S, A>[];
  /** Coups non encore explorés depuis cet état. */
  untriedMoves: A[];
  /** Nombre de visites (N dans la formule UCB1). */
  visits: number;
  /** Somme des récompenses (W dans la formule UCB1). */
  totalValue: number;
}

/**
 * Roulette pondérée : tire un index avec probabilité proportionnelle aux poids.
 * Plus efficace qu'un sort + filter pour les rollouts qui se font des milliers de fois.
 */
function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)];
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export class MctsAI<S, A> {
  constructor(private readonly adapter: MctsAdapter<S, A>) {}

  /**
   * Recherche le meilleur coup depuis l'état courant.
   * Retourne null si aucun coup légal ou si timeout sans aucune itération complète.
   */
  search(rootState: S, config: MctsConfig): A | null {
    const t0 = Date.now();
    const root = this.createNode(rootState, null, null);

    if (root.untriedMoves.length === 0 && root.children.length === 0) {
      // Aucun coup légal — état terminal ou bloqué.
      return null;
    }

    let iterCount = 0;
    for (let i = 0; i < config.iterations; i++) {
      // Coupure dure sur le timeout : on respecte la contrainte temps réel UI.
      if (Date.now() - t0 > config.timeoutMs) {
        if (process.env.NODE_ENV !== 'production') {
          // [DEV] Visibilité sur quand le timeout coupe l'exploration
          console.log(`[MCTS] timeout après ${iterCount}/${config.iterations} itérations`);
        }
        break;
      }

      // 1. SELECTION — descendre dans l'arbre via UCB1 jusqu'à un nœud non totalement exploré.
      let node = this.selection(root, config.c);

      // 2. EXPANSION — créer un nouvel enfant à partir d'un coup non essayé.
      if (node.untriedMoves.length > 0) {
        node = this.expansion(node);
      }

      // 3. SIMULATION — rollout heuristique jusqu'à terminal ou depth max.
      const reward = this.simulation(node.state);

      // 4. BACKPROPAGATION — remonter la récompense jusqu'à la racine.
      this.backpropagation(node, reward);

      iterCount++;
    }

    // Difficulté Facile : 10% de chance de jouer un coup random pour humaniser.
    if (config.randomChance > 0 && Math.random() < config.randomChance) {
      const moves = this.adapter.getLegalMoves(rootState);
      if (moves.length > 0) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[MCTS] coup RANDOM volontaire (mode Facile)');
        }
        return moves[Math.floor(Math.random() * moves.length)];
      }
    }

    // Stratégie "robuste" : retourner le coup avec le PLUS DE VISITES (pas le meilleur ratio).
    // Référence Bjarnason 2007 — moins de variance qu'argmax(W/N).
    if (root.children.length === 0) return null;
    let best = root.children[0];
    for (const c of root.children) {
      if (c.visits > best.visits) best = c;
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[MCTS] best move : visits=${best.visits} W/N=${(best.totalValue / Math.max(1, best.visits)).toFixed(3)} (${iterCount} iter total)`,
      );
    }
    return best.incomingMove;
  }

  /** Crée un nœud avec ses coups non encore explorés. */
  private createNode(
    state: S,
    parent: MctsNode<S, A> | null,
    incomingMove: A | null,
  ): MctsNode<S, A> {
    return {
      state,
      parent,
      incomingMove,
      children: [],
      untriedMoves: this.adapter.isTerminal(state) ? [] : this.adapter.getLegalMoves(state),
      visits: 0,
      totalValue: 0,
    };
  }

  /**
   * UCB1 : balance exploitation (W/N) et exploration (sqrt(ln(parentN)/N)).
   * Un nœud non visité a UCB infini → garanti d'être sélectionné en priorité.
   */
  private ucb1(node: MctsNode<S, A>, parentVisits: number, c: number): number {
    if (node.visits === 0) return Infinity;
    const exploitation = node.totalValue / node.visits;
    const exploration = c * Math.sqrt(Math.log(parentVisits) / node.visits);
    return exploitation + exploration;
  }

  /** Phase 1 : descente dans l'arbre via UCB1. */
  private selection(root: MctsNode<S, A>, c: number): MctsNode<S, A> {
    let node = root;
    while (node.untriedMoves.length === 0 && node.children.length > 0) {
      let bestChild = node.children[0];
      let bestUcb = -Infinity;
      for (const child of node.children) {
        const u = this.ucb1(child, node.visits, c);
        if (u > bestUcb) {
          bestUcb = u;
          bestChild = child;
        }
      }
      node = bestChild;
    }
    return node;
  }

  /** Phase 2 : crée un enfant pour un coup non encore essayé. */
  private expansion(node: MctsNode<S, A>): MctsNode<S, A> {
    // Pop = exploration FIFO ; on pourrait aussi shuffle pour plus de diversité.
    const move = node.untriedMoves.pop()!;
    const newState = this.adapter.applyMove(node.state, move);
    const child = this.createNode(newState, node, move);
    node.children.push(child);
    return child;
  }

  /**
   * Phase 3 : rollout heuristique. On joue jusqu'à 200 coups max ou terminal,
   * en utilisant l'heuristique de l'adapter pour pondérer les choix.
   */
  private simulation(startState: S): number {
    let s = startState;
    let depth = 0;
    const MAX_DEPTH = 200; // Solitaire normal se résout en <150 coups
    while (!this.adapter.isTerminal(s) && depth < MAX_DEPTH) {
      const moves = this.adapter.getLegalMoves(s);
      if (moves.length === 0) break;
      const weights = moves.map((m) => this.adapter.heuristic(s, m));
      const move = weightedPick(moves, weights);
      s = this.adapter.applyMove(s, move);
      depth++;
    }
    return this.adapter.evaluateTerminal(s);
  }

  /** Phase 4 : remonte la récompense jusqu'à la racine, incrémente visits/totalValue. */
  private backpropagation(node: MctsNode<S, A>, reward: number): void {
    let cur: MctsNode<S, A> | null = node;
    while (cur !== null) {
      cur.visits++;
      cur.totalValue += reward;
      cur = cur.parent;
    }
  }
}

/**
 * Helper de convenance : crée un MctsAI configuré pour une difficulté préset.
 *
 * Exemple :
 *   const ai = createMctsForDifficulty('medium', myAdapter);
 *   const move = ai.search(state, ai.config);
 */
export function createMctsForDifficulty<S, A>(
  difficulty: MctsDifficulty,
  adapter: MctsAdapter<S, A>,
): { ai: MctsAI<S, A>; config: MctsConfig } {
  return {
    ai: new MctsAI(adapter),
    config: MCTS_DIFFICULTY_PRESETS[difficulty],
  };
}
