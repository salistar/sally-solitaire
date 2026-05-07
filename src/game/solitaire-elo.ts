/**
 * @file solitaire-elo.ts
 * @description Système ELO solitaire — basé sur les replays locaux + une
 * "difficulty rating" par variante (vs IA solveur greedy comme baseline).
 *
 * Formule simplifiée :
 *   - ELO de base : 1000
 *   - Chaque victoire en hard : +30
 *   - Chaque victoire en medium : +15
 *   - Chaque victoire en easy : +5
 *   - Speedrun (durée < record-30%) : +10 bonus
 *   - Low-moves (< 50% de la moyenne) : +10 bonus
 *
 * Pas un vrai ELO de matchmaking (pas de partie vs adversaire), c'est un
 * "skill rating" par variante.
 */

import { listAllReplays, Replay } from './replays';

const BASE_ELO = 1000;

const WIN_GAIN: Record<string, number> = {
  easy: 5,
  medium: 15,
  hard: 30,
};

const VARIANT_GROUPS = [
  { key: 'klondike', match: (v: string) => v.startsWith('klondike') },
  { key: 'spider', match: (v: string) => v.startsWith('spider') },
  { key: 'freecell', match: (v: string) => v === 'freecell' },
  { key: 'yukon', match: (v: string) => v === 'yukon' },
  { key: 'golf', match: (v: string) => v === 'golf' },
  { key: 'pyramid', match: (v: string) => v === 'pyramid' },
  { key: 'tripeaks', match: (v: string) => v === 'tripeaks' },
  { key: 'forty-thieves', match: (v: string) => v === 'forty-thieves' },
  { key: 'accordion', match: (v: string) => v === 'accordion' },
];

export interface VariantElo {
  variant: string;
  elo: number;
  wins: number;
  history: { date: number; elo: number; gain: number; reason: string }[];
}

/**
 * Calcule l'ELO actuel par variante depuis l'historique des replays.
 */
export async function computeEloByVariant(): Promise<Record<string, VariantElo>> {
  const replays = await listAllReplays();

  // Tri chronologique pour calculer l'évolution
  replays.sort((a, b) => a.wonAt - b.wonAt);

  const out: Record<string, VariantElo> = {};
  for (const g of VARIANT_GROUPS) {
    out[g.key] = { variant: g.key, elo: BASE_ELO, wins: 0, history: [] };
  }

  // Calcule moyennes par variante (pour bonus low-moves)
  const movesByVariant: Record<string, number[]> = {};
  for (const r of replays) {
    const g = VARIANT_GROUPS.find((x) => x.match(r.variantKey));
    if (!g) continue;
    if (!movesByVariant[g.key]) movesByVariant[g.key] = [];
    movesByVariant[g.key].push(r.moves);
  }
  const avgMoves: Record<string, number> = {};
  for (const k of Object.keys(movesByVariant)) {
    const arr = movesByVariant[k];
    avgMoves[k] = arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  // Calcule meilleur temps par variante (pour bonus speedrun)
  const bestDurByVariant: Record<string, number> = {};
  for (const r of replays) {
    const g = VARIANT_GROUPS.find((x) => x.match(r.variantKey));
    if (!g || r.durationMs <= 0) continue;
    if (!bestDurByVariant[g.key] || r.durationMs < bestDurByVariant[g.key]) {
      bestDurByVariant[g.key] = r.durationMs;
    }
  }

  // Applique les gains
  for (const r of replays) {
    const g = VARIANT_GROUPS.find((x) => x.match(r.variantKey));
    if (!g) continue;
    const v = out[g.key];
    let gain = WIN_GAIN[r.difficulty] ?? WIN_GAIN.medium;
    let reason = `Win ${r.difficulty}`;

    // Bonus low-moves
    if (avgMoves[g.key] && r.moves < avgMoves[g.key] * 0.5 && r.moves > 0) {
      gain += 10;
      reason += ' +economy';
    }

    // Bonus speedrun (< 70% du best, signe d'amélioration ou test rapide)
    if (bestDurByVariant[g.key] && r.durationMs > 0 && r.durationMs < bestDurByVariant[g.key] * 1.3) {
      gain += 5;
      reason += ' +speed';
    }

    v.elo += gain;
    v.wins++;
    v.history.push({ date: r.wonAt, elo: v.elo, gain, reason });
  }

  return out;
}

/** ELO global pondéré (somme des ELO par variante / nb variantes jouées). */
export async function computeGlobalElo(): Promise<number> {
  const eloMap = await computeEloByVariant();
  const played = Object.values(eloMap).filter((v) => v.wins > 0);
  if (played.length === 0) return BASE_ELO;
  const sum = played.reduce((a, b) => a + b.elo, 0);
  return Math.round(sum / played.length);
}

/** Rang Bronze/Silver/Gold/Platinum/Diamond selon ELO. */
export function rankFromElo(elo: number): { tier: string; color: string; emoji: string } {
  if (elo >= 2500) return { tier: 'Diamond', color: '#06B6D4', emoji: '💎' };
  if (elo >= 2000) return { tier: 'Platinum', color: '#A855F7', emoji: '🏆' };
  if (elo >= 1500) return { tier: 'Gold', color: '#F59E0B', emoji: '🥇' };
  if (elo >= 1200) return { tier: 'Silver', color: '#94A3B8', emoji: '🥈' };
  return { tier: 'Bronze', color: '#92400E', emoji: '🥉' };
}
