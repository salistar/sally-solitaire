/**
 * @file useSaveSoloOnWin.ts
 * @description Hook qui sauvegarde le score d'une partie solo sur le backend
 * dès que le joueur GAGNE. Utilisé par les 7 écrans génériques (Generic*
 * Screen) pour assurer l'enregistrement dans le leaderboard.
 *
 * Les 9 écrans moteur legacy (Klondike/Spider/.../Accordion) appellent
 * déjà `saveGameResult()` (helper local dans solo.tsx) sur la rising-edge
 * `state.won`. Ce hook étend le même comportement aux 7 moteurs génériques
 * qui n'étaient PAS dans cette chaîne — sans lui, gagner sur Bastion,
 * Calculation, Pyramide, etc. n'apparaissait pas dans le classement.
 *
 * Comportement :
 *   - Mesure la durée localement via Date.now() au mount
 *   - Sur la rising-edge `won` (false → true), appelle api.saveSoloGame
 *   - Skip silencieux si l'utilisateur est en mode local (api.getMe() null)
 *   - One-shot via ref — ne re-déclenche pas même si le composant re-render
 */
import { useEffect, useRef } from 'react';
import * as api from '../../shared/api';

interface Args {
  variantKey: string;
  won: boolean;
  score: number;
  moves: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  hintsUsed?: number;
}

export function useSaveSoloOnWin({
  variantKey,
  won,
  score,
  moves,
  difficulty,
  hintsUsed,
}: Args): void {
  const startedAtRef = useRef<number>(Date.now());
  const firedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!won) {
      // Reset le latch quand on relance une nouvelle partie (won: true → false)
      firedRef.current = false;
      return;
    }
    if (firedRef.current) return;
    firedRef.current = true;

    const durationMs = Date.now() - startedAtRef.current;
    (async () => {
      // Skip en mode local — getMe() retourne null sans session backend,
      // donc fetchWithToken(/games/save) échouera proprement de toute façon,
      // mais on évite ce round-trip inutile en court-circuitant.
      const me = await api.getMe().catch(() => null);
      if (!me?.id) return;

      const result = await api.saveSoloGame({
        gameType: 'solitaire',
        variant: variantKey,
        score,
        moves,
        durationMs,
        won: true,
        difficulty,
        hintsUsed,
      });
      // eslint-disable-next-line no-console
      console.log(
        `🏆 [SaveSoloOnWin] ${variantKey} → score=${score} moves=${moves} ` +
        `duration=${Math.round(durationMs / 1000)}s persisted=${result.persisted} via=${result.via}`,
      );
    })();
  }, [won, variantKey, score, moves, difficulty, hintsUsed]);
}

/* === End of useSaveSoloOnWin.ts — Solitaire — SallyCards === */
