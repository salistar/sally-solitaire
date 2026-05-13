/**
 * @file useRaceSocket.ts
 * @description Mobile-side hook that opens a Socket.IO connection to the
 * race namespace `/solitaire-race` and bridges its events to React state.
 *
 * - Connects on mount with code + userId
 * - Listens to `race:progress`, `race:peer-joined`, `race:peer-left`, `race:finished`
 * - Exposes an `emitProgress(payload)` function for the engine screen to call
 *   on every state change (RaceProvider already throttles upstream REST calls;
 *   this one is fire-and-forget over the socket).
 * - Auto-disconnects + emits `race:leave` on unmount
 *
 * Falls back gracefully to no-op if the socket can't connect (the REST polling
 * in the race screen keeps the UI alive).
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../../shared/api';

export interface SocketProgress {
  userId: string;
  score: number;
  moves: number;
  finished: boolean;
}

export interface RaceSocketCallbacks {
  /** Emitted when a peer reports updated progress. */
  onPeerProgress?: (p: SocketProgress) => void;
  /** Emitted when a peer (re-)joins the race. */
  onPeerJoined?: (p: { userId: string; displayName: string }) => void;
  /** Emitted when a peer disconnects or leaves. */
  onPeerLeft?: (p: { userId: string }) => void;
  /** Emitted when ANY peer (including self) declares finished. */
  onFinished?: (p: { winnerUserId: string }) => void;
}

export interface UseRaceSocketArgs {
  code: string;
  userId: string;
  displayName?: string;
  callbacks: RaceSocketCallbacks;
}

export interface UseRaceSocketReturn {
  /** Emit a progress event over the socket. Fire-and-forget; no return value. */
  emitProgress: (payload: { score: number; moves: number; finished: boolean }) => void;
  /** True when the socket is connected. UI can show a "live" indicator. */
  connected: boolean;
}

export function useRaceSocket({ code, userId, displayName, callbacks }: UseRaceSocketArgs): UseRaceSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!code || !userId) return;

    const socket = io(`${SOCKET_URL}/solitaire-race`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('race:join', { code, userId, displayName: displayName ?? '' });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('race:peer-joined', (payload: { userId: string; displayName: string }) => {
      callbacksRef.current.onPeerJoined?.(payload);
    });

    socket.on('race:progress', (payload: SocketProgress) => {
      callbacksRef.current.onPeerProgress?.(payload);
    });

    socket.on('race:peer-left', (payload: { userId: string }) => {
      callbacksRef.current.onPeerLeft?.(payload);
    });

    socket.on('race:finished', (payload: { winnerUserId: string }) => {
      callbacksRef.current.onFinished?.(payload);
    });

    return () => {
      try {
        socket.emit('race:leave', { code, userId });
      } catch {/* socket already closed */}
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [code, userId, displayName]);

  const emitProgress = useCallback((payload: { score: number; moves: number; finished: boolean }) => {
    const sock = socketRef.current;
    if (!sock || !sock.connected) return;
    sock.emit('race:progress', {
      code,
      userId,
      score: payload.score,
      moves: payload.moves,
      finished: payload.finished,
    });
  }, [code, userId]);

  return {
    emitProgress,
    connected,
  };
}
