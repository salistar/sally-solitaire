/**
 * @file useRaceReport.ts
 * @description Helper hook that any engine screen can call to push its current
 * state to the race API. When `useRace()` returns null (solo mode), the hook
 * becomes a no-op; when in race mode, it auto-reports each time the inputs
 * change (debounced inside RaceProvider).
 *
 * Engine screens call this once with their per-render score / moves / won:
 *   useRaceReport({ score: state.score, moves: state.moveCount, finished: state.won });
 */
import { useEffect, useRef } from 'react';
import { useRace } from './RaceContext';

export function useRaceReport({
  score,
  moves,
  finished,
  getActions,
}: {
  score: number;
  moves: number;
  finished: boolean;
  /**
   * Optional snapshot getter for the per-player action log. When provided,
   * each progress report ships the full cumulative actions[] so the server
   * can (a) replay-validate the reported score (anti-cheat) and (b) persist
   * the log for the replay viewer (`/race-replay/:code`).
   *
   * Called lazily *inside* the throttled effect — not at every render — so
   * passing an unstable function is fine as long as it returns the same
   * shape. Engine screens typically pass `replayRec.getActions` /
   * `undoCtl.getActions` which are useCallback-stable.
   */
  getActions?: () => any[];
}) {
  const race = useRace();
  const lastSig = useRef<string>('');
  useEffect(() => {
    if (!race) return;
    const sig = `${score}|${moves}|${finished ? 1 : 0}`;
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    const actions = getActions ? getActions() : undefined;
    race.reportProgress({ score, moves, finished, ...(actions ? { actions } : {}) });
  }, [race, score, moves, finished, getActions]);
}
