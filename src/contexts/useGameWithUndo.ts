/**
 * @file useGameWithUndo.ts
 * @description Drop-in replacement for `useReducer` that adds an undo stack.
 * The engine reducer itself is NOT modified — we wrap it so the state shape
 * stays identical to what each screen already consumes.
 *
 * Usage:
 *   const [state, dispatch, undoCtl] = useGameWithUndo(
 *     engineReducer,
 *     undefined,
 *     () => createInitialState(seed),
 *   );
 *   ...
 *   <Button label={`↶ ${undoCtl.canUndo ? 'Undo' : 'Undo (vide)'}`}
 *           onPress={undoCtl.undo}
 *           disabled={!undoCtl.canUndo} />
 *
 * History is capped at HISTORY_CAP entries (50) to bound memory; older
 * snapshots are dropped FIFO. No-op dispatches (state === prev) don't
 * pollute the history.
 */
import { useReducer, useCallback, useMemo, useRef } from 'react';

const HISTORY_CAP = 50;

type WrappedState<S> = { current: S; history: S[] };
type WrappedAction<A> = A | { type: '__UNDO__' } | { type: '__RESET_HISTORY__' };

function makeWrappedReducer<S, A>(reducer: (s: S, a: A) => S) {
  return function wrapped(ws: WrappedState<S>, action: WrappedAction<A>): WrappedState<S> {
    const t = (action as any)?.type;
    if (t === '__UNDO__') {
      if (ws.history.length === 0) return ws;
      const prev = ws.history[ws.history.length - 1];
      return { current: prev, history: ws.history.slice(0, -1) };
    }
    if (t === '__RESET_HISTORY__') {
      return { current: ws.current, history: [] };
    }
    const nextCurrent = reducer(ws.current, action as A);
    if (nextCurrent === ws.current) return ws; // no-op: don't pollute history
    const newHistory = ws.history.concat([ws.current]);
    if (newHistory.length > HISTORY_CAP) newHistory.shift();
    return { current: nextCurrent, history: newHistory };
  };
}

export interface UndoController {
  canUndo: boolean;
  undo: () => void;
  /** History depth available for undo. */
  depth: number;
  /** Reset the history without touching state (e.g. when starting a new game). */
  resetHistory: () => void;
  /**
   * Snapshot of every action dispatched since mount, minus those undone. Used
   * by the race replay infrastructure to ship the action log alongside score
   * reports — the server then replays the actions through the engine reducer
   * to (a) validate the reported score (anti-cheat) and (b) persist them for
   * the replay viewer. Returns a fresh array each call.
   */
  getActions: () => any[];
}

export function useGameWithUndo<S, A>(
  reducer: (s: S, a: A) => S,
  initialArg: undefined,
  lazyInit: () => S,
): [S, (action: A) => void, UndoController] {
  const wrappedReducer = useMemo(() => makeWrappedReducer(reducer), [reducer]);
  const [wrapped, wrappedDispatch] = useReducer(wrappedReducer, undefined, () => ({
    current: lazyInit(),
    history: [] as S[],
  }));

  // Action log mirrored alongside state.history. Push on dispatch, pop on undo
  // so a `getActions()` snapshot replayed from initialState always reproduces
  // the *current* state. The wrapped reducer rejects no-op dispatches (state
  // === prev), so the count of pushed actions can briefly drift one above
  // history.length — that's harmless since replays treat no-ops as identity.
  const actionsRef = useRef<A[]>([]);

  const dispatch = useCallback((action: A) => {
    actionsRef.current.push(action);
    wrappedDispatch(action as WrappedAction<A>);
  }, []);

  const undo = useCallback(() => {
    if (actionsRef.current.length > 0) actionsRef.current.pop();
    wrappedDispatch({ type: '__UNDO__' } as WrappedAction<A>);
  }, []);

  const resetHistory = useCallback(() => {
    // Keep the action log: replaying from initialState still reproduces the
    // current state. Only `wrapped.history` (state snapshots) is cleared.
    wrappedDispatch({ type: '__RESET_HISTORY__' } as WrappedAction<A>);
  }, []);

  const getActions = useCallback((): any[] => {
    return [...actionsRef.current];
  }, []);

  const undoCtl: UndoController = {
    canUndo: wrapped.history.length > 0,
    undo,
    depth: wrapped.history.length,
    resetHistory,
    getActions,
  };

  return [wrapped.current, dispatch, undoCtl];
}
