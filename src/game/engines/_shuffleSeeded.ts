/**
 * @file _shuffleSeeded.ts
 * @description Deterministic seedable RNG + Fisher–Yates shuffle. Used by the
 * generic engines so two players in a 1v1 race can play the SAME shuffled deck.
 *
 * When no seed is provided, falls back to Math.random (non-deterministic, used
 * by Solo mode). When a seed is provided (race mode), the same seed always
 * produces the same shuffle order — guaranteeing both players get identical
 * initial states.
 *
 * Algorithm: Mulberry32 (small, fast, good distribution for ≤2^32 outputs).
 * Public domain; same generator used by _genericTableau.ts internally.
 */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFromSeed(seed?: number | string | null): Rng {
  if (seed == null) return Math.random;
  if (typeof seed === 'string') {
    // Hash a string seed to a number (FNV-1a 32-bit)
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return mulberry32(h >>> 0);
  }
  return mulberry32(seed >>> 0);
}

/** Fisher–Yates shuffle using the provided RNG (or Math.random by default). */
export function shuffleSeeded<T>(arr: T[], rng: Rng = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
