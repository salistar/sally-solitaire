/**
 * @file RaceContext.tsx
 * @description Context that an embedded game screen can read to detect "we're
 * in a 1v1 race" and emit per-move progress to the server. When the screen
 * runs in solo, the context returns `null` and game screens behave normally.
 *
 * Engine screens call `useRace().reportProgress({ score, moves, finished })`
 * whenever they want to push their state. The race wrapper screen polls the
 * match every 1s to display the opponent's progress.
 *
 * Generic across all 177 variants: each engine reports its own notion of
 * "score" + "moves" + "finished" — the server doesn't care about the engine
 * specifics, it just relays who finished first.
 */
import React, { createContext, useContext, useCallback, useRef } from 'react';
import * as api from '../../shared/api';
import { useRaceSocket } from './useRaceSocket';

export interface RaceProgressPayload {
  score: number;
  moves: number;
  finished: boolean;
  /** Optional list of engine actions (anti-cheat input). Pass [] if not tracking. */
  actions?: any[];
}

export interface RaceContextValue {
  /** Match code currently being raced. */
  code: string;
  /** Current user's userId (for the API payload). */
  userId: string;
  /** Push the current engine state to the server. Throttled internally. */
  reportProgress: (payload: RaceProgressPayload) => void;
  /**
   * Deterministic seed shared between both players. Engines that accept a
   * `seed` parameter use this to build the identical initial state on both
   * clients. Falls back to the match code (always identical for both peers)
   * when the backend doesn't provide an explicit seed.
   */
  seed: string;
  /** True when the Socket.IO connection to /solitaire-race is live. */
  socketConnected: boolean;
}

const RaceContextInternal = createContext<RaceContextValue | null>(null);

/** Hook for engine screens. Returns null when not in race mode. */
export function useRace(): RaceContextValue | null {
  return useContext(RaceContextInternal);
}

/**
 * Provider used by the race wrapper screen. It does TWO things on each
 * progress update:
 *   - Throttled REST POST to /solitaire-matches/:code/progress (authoritative,
 *     anti-cheat lives here).
 *   - Fire-and-forget Socket.IO emit on `/solitaire-race` namespace for
 *     instant peer notification. If the socket isn't connected, the polling
 *     fallback in the race screen keeps the UI alive.
 *
 * `onPeerProgress` is the callback the race wrapper uses to receive the
 * OPPONENT's live updates and update its local match state without waiting
 * for the next poll.
 */
export function RaceProvider({
  code,
  userId,
  displayName,
  seed,
  children,
  onProgressSent,
  onPeerProgress,
  onPeerJoined,
  onPeerLeft,
  onFinished,
}: {
  code: string;
  userId: string;
  displayName?: string;
  seed?: string;
  children: React.ReactNode;
  onProgressSent?: (match: api.SolitaireMatch | null) => void;
  onPeerProgress?: (p: { userId: string; score: number; moves: number; finished: boolean }) => void;
  onPeerJoined?: (p: { userId: string; displayName: string }) => void;
  onPeerLeft?: (p: { userId: string }) => void;
  onFinished?: (p: { winnerUserId: string }) => void;
}) {
  const lastSentRef = useRef(0);
  const pendingRef = useRef<RaceProgressPayload | null>(null);
  const inFlightRef = useRef(false);

  // Socket.IO connection for real-time peer events.
  const { emitProgress, connected: socketConnected } = useRaceSocket({
    code,
    userId,
    displayName,
    callbacks: { onPeerProgress, onPeerJoined, onPeerLeft, onFinished },
  });

  const flush = useCallback(async () => {
    if (inFlightRef.current) return;
    const payload = pendingRef.current;
    if (!payload) return;
    pendingRef.current = null;
    inFlightRef.current = true;
    try {
      const res = await api.reportMatchProgress(code, {
        userId,
        score: payload.score,
        moves: payload.moves,
        finished: payload.finished,
        actions: payload.actions ?? [],
      });
      onProgressSent?.(res);
    } finally {
      inFlightRef.current = false;
      lastSentRef.current = Date.now();
      // If new pending arrived during flight, drain it
      if (pendingRef.current) {
        setTimeout(flush, 50);
      }
    }
  }, [code, userId, onProgressSent]);

  const reportProgress = useCallback((payload: RaceProgressPayload) => {
    // Always fire-and-forget over the socket for instant peer notification.
    emitProgress({ score: payload.score, moves: payload.moves, finished: payload.finished });

    // Throttled authoritative REST update.
    pendingRef.current = payload;
    const since = Date.now() - lastSentRef.current;
    if (payload.finished || since >= 800) {
      flush();
    }
  }, [flush, emitProgress]);

  const value: RaceContextValue = {
    code,
    userId,
    reportProgress,
    // Fall back to code if no explicit seed: same string for both peers.
    seed: seed ?? code,
    socketConnected,
  };
  return <RaceContextInternal.Provider value={value}>{children}</RaceContextInternal.Provider>;
}
