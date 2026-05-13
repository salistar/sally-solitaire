/**
 * @file GenericGameHeader.tsx
 * @description Reusable Klondike-style game header bar for the 7 generic
 * engine screens. Mirrors the in-screen `GameHeader` defined locally in
 * solo.tsx (used by Klondike/Spider/FreeCell/etc.) so every variant — legacy
 * or generic — shares the same chrome:
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │ [MOYEN]   ⏱ 0:03   [💡 3]   [↻]                       │
 *   └──────────────────────────────────────────────────────┘
 *
 * Difficulty badge color: easy=green / medium=orange / hard=red.
 * Chrono is a self-contained 1Hz ticking timer that resets when the screen
 * remounts (key={runId} on the screen wrapper).
 *
 * The hint button is hidden in hard mode (no hints allowed), greys out
 * once the pool is empty, and shows ∞ in easy mode.
 *
 * The restart pill (↻) calls `onReset`. The caller is expected to bump its
 * `runId` so React remounts the game body with a fresh deal.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { APP_CONFIG } from '../config/app.config';
import type { Difficulty, HintsHook } from '../game/hintsHook';

interface Props {
  difficulty: Difficulty;
  hints: HintsHook;
  onHint: () => void;
  onReset: () => void;
  /** Optional sub-label shown after the chrono — e.g. variant rule snippet. */
  subLabel?: string;
}

const DIFF_COLOR: Record<Difficulty, string> = {
  easy: '#10B981',
  medium: '#F59E0B',
  hard: '#EF4444',
};

const DIFF_LABEL: Record<Difficulty, string> = {
  easy: 'FACILE',
  medium: 'MOYEN',
  hard: 'DIFFICILE',
};

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Internal hook — independent chrono so the header is self-sufficient. */
function useChrono() {
  const [seconds, setSeconds] = useState(0);
  const startedAtRef = useRef(Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return seconds;
}

export default function GenericGameHeader({ difficulty, hints, onHint, onReset, subLabel }: Props) {
  const seconds = useChrono();
  const canUseHint = hints.canUseHint;
  const hintLabel = hints.remaining === Infinity ? '∞' : String(hints.remaining);

  return (
    <View style={styles.bar}>
      <View style={[styles.diffBadge, { backgroundColor: DIFF_COLOR[difficulty] }]}>
        <Text style={styles.diffBadgeText}>{DIFF_LABEL[difficulty]}</Text>
      </View>

      <View style={styles.chrono}>
        <Ionicons name="time" size={14} color="#fff" />
        <Text style={styles.chronoText}>{fmtTime(seconds)}</Text>
      </View>

      {difficulty !== 'hard' ? (
        <TouchableOpacity
          onPress={onHint}
          disabled={!canUseHint}
          activeOpacity={0.75}
          style={[styles.actionBtn, { backgroundColor: canUseHint ? APP_CONFIG.primary : 'rgba(255,255,255,0.1)' }]}
        >
          <Ionicons name="bulb" size={14} color="#fff" />
          <Text style={styles.actionBtnText}>{hintLabel}</Text>
        </TouchableOpacity>
      ) : (
        <View style={[styles.actionBtn, { backgroundColor: 'rgba(239,68,68,0.2)', borderColor: '#EF4444', borderWidth: 1 }]}>
          <Ionicons name="lock-closed" size={12} color="#EF4444" />
          <Text style={[styles.actionBtnText, { color: '#EF4444', fontSize: 10 }]}>0 IND.</Text>
        </View>
      )}

      <TouchableOpacity
        onPress={onReset}
        activeOpacity={0.75}
        style={[styles.actionBtn, { backgroundColor: 'rgba(16,185,129,0.35)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.6)' }]}
      >
        <Ionicons name="refresh" size={14} color="#fff" />
      </TouchableOpacity>

      {subLabel ? (
        <Text style={styles.subLabel} numberOfLines={1}>{subLabel}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  diffBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  diffBadgeText: { color: '#fff', fontSize: 10, fontFamily: 'Inter-Black', letterSpacing: 1 },
  chrono: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chronoText: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Black' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 40,
    justifyContent: 'center',
  },
  actionBtnText: { color: '#fff', fontSize: 12, fontFamily: 'Inter-Black' },
  subLabel: {
    flex: 1,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    textAlign: 'right',
  },
});

/* === End of GenericGameHeader.tsx — Solitaire — SallyCards === */
