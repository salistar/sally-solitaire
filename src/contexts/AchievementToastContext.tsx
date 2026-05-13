/**
 * @file AchievementToastContext.tsx
 * @description Global queue of achievement-unlock toasts. Anywhere in the
 * app, call `useAchievementToast().showAchievements(defs)` after an API
 * call returns `unlockedAchievements`. Toasts play one after the other
 * (FIFO) so the user can read each one without overlap.
 *
 * Provider mounts a single toast slot at the top of the screen tree.
 * Wrap the app root in <AchievementToastProvider>.
 */
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import AchievementToast from '../components/AchievementToast';
import type { AchievementDef } from '../../shared/api';

interface ToastContextValue {
  /** Queue one achievement for display. */
  showAchievement: (def: AchievementDef) => void;
  /** Queue many — useful when an API returns a list of newly unlocked. */
  showAchievements: (defs: AchievementDef[]) => void;
}

const Ctx = createContext<ToastContextValue | null>(null);

export function useAchievementToast(): ToastContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Graceful fallback if provider missing — log + no-op so the app
    // doesn't crash when called from a screen outside the provider tree.
    if (__DEV__) console.warn('useAchievementToast called outside AchievementToastProvider');
    return { showAchievement: () => {}, showAchievements: () => {} };
  }
  return ctx;
}

export function AchievementToastProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<AchievementDef[]>([]);
  const [current, setCurrent] = useState<AchievementDef | null>(null);
  const processingRef = useRef(false);

  const advance = useCallback(() => {
    setCurrent(null);
    processingRef.current = false;
    // Drain on next tick to give RN time to remount
    setTimeout(() => {
      setQueue((q) => {
        if (q.length === 0) return q;
        const [next, ...rest] = q;
        setCurrent(next);
        processingRef.current = true;
        return rest;
      });
    }, 80);
  }, []);

  const showAchievement = useCallback((def: AchievementDef) => {
    setQueue((q) => {
      const newQ = [...q, def];
      // If nothing is showing, start now
      if (!processingRef.current && current == null) {
        setTimeout(() => {
          setQueue((q2) => {
            if (q2.length === 0) return q2;
            const [next, ...rest] = q2;
            setCurrent(next);
            processingRef.current = true;
            return rest;
          });
        }, 0);
      }
      return newQ;
    });
  }, [current]);

  const showAchievements = useCallback((defs: AchievementDef[]) => {
    if (!defs || defs.length === 0) return;
    for (const def of defs) showAchievement(def);
  }, [showAchievement]);

  return (
    <Ctx.Provider value={{ showAchievement, showAchievements }}>
      {children}
      {current && (
        <AchievementToast
          key={current.id + '-' + Date.now()}
          def={current}
          onDone={advance}
        />
      )}
    </Ctx.Provider>
  );
}
