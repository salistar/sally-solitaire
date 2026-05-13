/**
 * @file useGenericActionLog.ts
 * @description Engine-agnostic action logger for the 7 generic screens. Mirrors
 * the Klondike-screen `useActionLog` (in solo.tsx) so every variant emits the
 * same two-line "🎯 Coup #N + 📋 État" trace whenever `moves` increments.
 *
 * The legacy `useActionLog` in solo.tsx hard-codes the Klondike state shape
 * (`state.tableau[i].cards`, `state.foundations[i].cards`, …). Generic engines
 * use a different shape (`state.tableau: Card[][]`, `state.foundations: Card[][]`,
 * etc.), so this version takes a `dump` callback the caller supplies for its
 * own engine. The hook itself only owns the "did moves go up since last
 * render?" detection — the dump strategy is per-engine.
 *
 *   useGenericActionLog({
 *     variantKey: variant.key,
 *     moves: state.moveCount,
 *     score: scoreFromState(state),
 *     extra: `fondations=${total}/${needed}`,
 *     dump: () => dumpGenericTableau(state),
 *   });
 *
 * Output (matches Klondike's format):
 *
 *   🎯 [double_solitaire] Coup #1 — score=0 | fondations=0/104
 *   📋 [double_solitaire] État après coup:
 *     C1: ♦K
 *     C2: [♠J] ♥10
 *     …
 *     Found: · · · · · · · ·
 *     Stock: 76 cartes
 */
import { useEffect, useRef } from 'react';

export interface ActionLogArgs {
  variantKey: string;
  /** Engine's monotonically-increasing move counter. */
  moves: number;
  /** Headline number for the "score=" field. */
  score: number;
  /** Optional extra metric appended after `score=N` ("| fondations=12/52"). */
  extra?: string;
  /** Lazy dump callback. Called each time `moves` increments. */
  dump?: () => string;
}

export function useGenericActionLog({ variantKey, moves, score, extra, dump }: ActionLogArgs): void {
  const prevMovesRef = useRef(0);
  useEffect(() => {
    if (moves > prevMovesRef.current) {
      const delta = moves - prevMovesRef.current;
      const tag = delta === 1 ? `Coup #${moves}` : `+${delta} coups → #${moves}`;
      // eslint-disable-next-line no-console
      console.log(`🎯 [${variantKey}] ${tag} — score=${score}${extra ? ` | ${extra}` : ''}`);
      if (dump) {
        const body = dump();
        if (body) {
          // eslint-disable-next-line no-console
          console.log(`📋 [${variantKey}] État après coup:\n${body}`);
        }
      }
      prevMovesRef.current = moves;
    }
  }, [moves, score, extra, variantKey, dump]);
}

// ─── Helpers: card pretty-print used by per-engine dumpers ───────────────

/** "♠K" / "♥10" — matches the format used by Klondike's `fmtCard`. */
export function fmtCard(c: { suit: string; rank: number; faceUp?: boolean } | null | undefined): string {
  if (!c) return '·';
  const s = c.suit === 'S' ? '♠' : c.suit === 'H' ? '♥' : c.suit === 'D' ? '♦' : '♣';
  const r = c.rank === 1 ? 'A' : c.rank === 11 ? 'J' : c.rank === 12 ? 'Q' : c.rank === 13 ? 'K' : String(c.rank);
  const label = `${s}${r}`;
  // Face-down cards wrapped in brackets, matching Klondike's `[♠J]` style.
  return c.faceUp === false ? `[${label}]` : label;
}

/**
 * Dumper for GenericTableau-shaped state (Canfield, Castle, Fans, etc.).
 * Cards are `Card[][]` per pile, not `{ cards: Card[] }`.
 */
export function dumpGenericTableau(state: {
  tableau: Array<Array<any>>;
  foundations: Array<Array<any>>;
  freeCells?: Array<any | null>;
  reserves?: Array<Array<any>>;
  stock?: Array<any>;
  waste?: Array<any>;
}): string {
  const lines: string[] = [];
  state.tableau.forEach((col, i) => {
    const cards = col.map(fmtCard).join(' ');
    lines.push(`  C${i + 1}: ${cards || '(vide)'}`);
  });
  if (state.freeCells && state.freeCells.length) {
    lines.push(`  Free: ${state.freeCells.map(fmtCard).join(' ')}`);
  }
  if (state.reserves && state.reserves.length) {
    state.reserves.forEach((p, i) => {
      const top = p[p.length - 1];
      lines.push(`  R${i + 1}: ${fmtCard(top)} (${p.length})`);
    });
  }
  lines.push(`  Found: ${state.foundations.map((f) => fmtCard(f[f.length - 1])).join(' ')}`);
  if (state.stock) lines.push(`  Stock: ${state.stock.length} cartes`);
  if (state.waste && state.waste.length) {
    lines.push(`  Waste: ${fmtCard(state.waste[state.waste.length - 1])} (${state.waste.length})`);
  }
  return lines.join('\n');
}

export function dumpGenericDistribution(state: {
  piles: Array<Array<any>>;
  currentCard?: any | null;
  exposedCount?: number;
}): string {
  const lines: string[] = [];
  state.piles.forEach((p, i) => {
    const facedown = p.filter((c) => c.faceUp === false).length;
    lines.push(`  P${i + 1}: ${facedown}/${p.length} cachées`);
  });
  if (state.currentCard) {
    lines.push(`  Carte courante: ${fmtCard(state.currentCard)}`);
  }
  if (state.exposedCount != null) {
    lines.push(`  Révélées: ${state.exposedCount}`);
  }
  return lines.join('\n');
}

export function dumpPairs(state: {
  layout: Array<Array<any | null>>;
  removed: Array<any>;
  stock?: Array<any>;
  waste?: Array<any>;
}): string {
  const lines: string[] = [];
  state.layout.forEach((row, r) => {
    const cells = row.map(fmtCard).join(' ');
    lines.push(`  R${r + 1}: ${cells}`);
  });
  lines.push(`  Retirées: ${state.removed.length}`);
  if (state.stock) lines.push(`  Stock: ${state.stock.length} cartes`);
  if (state.waste && state.waste.length) {
    lines.push(`  Défausse: ${fmtCard(state.waste[state.waste.length - 1])} (${state.waste.length})`);
  }
  return lines.join('\n');
}

export function dumpMath(state: {
  foundations: Array<Array<any>>;
  wastePiles: Array<Array<any>>;
  stock?: Array<any>;
  pendingStockCard?: any | null;
}): string {
  const lines: string[] = [];
  lines.push(`  Found: ${state.foundations.map((f) => `${fmtCard(f[f.length - 1])}(${f.length}/13)`).join(' ')}`);
  state.wastePiles.forEach((w, i) => {
    lines.push(`  W${i + 1}: ${fmtCard(w[w.length - 1])} (${w.length})`);
  });
  if (state.stock) lines.push(`  Stock: ${state.stock.length} cartes`);
  if (state.pendingStockCard) lines.push(`  En attente: ${fmtCard(state.pendingStockCard)}`);
  return lines.join('\n');
}

export function dumpGolf(state: {
  layout: Array<Array<any | null>>;
  topCard?: any | null;
  stock?: Array<any>;
  score?: number;
  combo?: number;
}): string {
  const lines: string[] = [];
  state.layout.forEach((row, r) => {
    const cells = row.map(fmtCard).join(' ');
    lines.push(`  R${r + 1}: ${cells}`);
  });
  if (state.topCard) lines.push(`  Défausse: ${fmtCard(state.topCard)}`);
  if (state.stock) lines.push(`  Stock: ${state.stock.length} cartes`);
  if (state.score != null) lines.push(`  Score: ${state.score}${state.combo ? ` (combo ×${Math.pow(2, state.combo)})` : ''}`);
  return lines.join('\n');
}

export function dumpMaze(state: { grid: Array<Array<any | null>>; moveCount: number }): string {
  const lines: string[] = [];
  state.grid.forEach((row, r) => {
    const cells = row.map(fmtCard).join(' ');
    lines.push(`  R${r + 1}: ${cells}`);
  });
  return lines.join('\n');
}

export function dumpSpiderV2(state: {
  tableau: Array<Array<any>>;
  stock?: Array<any>;
  completedRuns?: Array<any>;
}): string {
  const lines: string[] = [];
  state.tableau.forEach((col, i) => {
    const cards = col.map(fmtCard).join(' ');
    lines.push(`  C${i + 1}: ${cards || '(vide)'}`);
  });
  if (state.stock) lines.push(`  Stock: ${state.stock.length} cartes`);
  if (state.completedRuns) lines.push(`  Suites: ${state.completedRuns.length}`);
  return lines.join('\n');
}

/* === End of useGenericActionLog.ts — Solitaire — SallyCards === */
