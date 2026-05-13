/**
 * Tests pour daily-reminder (in-app reminder Daily Challenge).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  shouldShowDailyReminder, markDailyReminderShown, resetDailyReminder,
  computeStreakState,
} from '../../src/game/daily-reminder';

describe('daily-reminder', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('ne notifie pas avant 8h du matin', async () => {
    // Simule heure 7h
    const realDate = global.Date;
    class MockDate7h extends realDate {
      constructor(...args: any[]) {
        if (args.length === 0) super(2026, 0, 1, 7, 30);
        else super(args[0] as any, args[1], args[2], args[3], args[4], args[5], args[6]);
      }
      static now() { return new realDate(2026, 0, 1, 7, 30).getTime(); }
    }
    (global as any).Date = MockDate7h;

    const r = await shouldShowDailyReminder();
    expect(r).toBe(false);

    (global as any).Date = realDate;
  });

  it('notifie après 8h si pas déjà fait aujourd\'hui', async () => {
    const realDate = global.Date;
    class MockDate10h extends realDate {
      constructor(...args: any[]) {
        if (args.length === 0) super(2026, 0, 1, 10, 0);
        else super(args[0] as any, args[1], args[2], args[3], args[4], args[5], args[6]);
      }
      static now() { return new realDate(2026, 0, 1, 10, 0).getTime(); }
    }
    (global as any).Date = MockDate10h;

    const r = await shouldShowDailyReminder();
    expect(r).toBe(true);

    (global as any).Date = realDate;
  });

  it('ne re-notifie pas après markShown', async () => {
    const realDate = global.Date;
    class MockDate10h extends realDate {
      constructor(...args: any[]) {
        if (args.length === 0) super(2026, 0, 1, 10, 0);
        else super(args[0] as any, args[1], args[2], args[3], args[4], args[5], args[6]);
      }
      static now() { return new realDate(2026, 0, 1, 10, 0).getTime(); }
    }
    (global as any).Date = MockDate10h;

    expect(await shouldShowDailyReminder()).toBe(true);
    await markDailyReminderShown();
    expect(await shouldShowDailyReminder()).toBe(false);

    (global as any).Date = realDate;
  });

  it('reset permet de re-notifier', async () => {
    const realDate = global.Date;
    class MockDate10h extends realDate {
      constructor(...args: any[]) {
        if (args.length === 0) super(2026, 0, 1, 10, 0);
        else super(args[0] as any, args[1], args[2], args[3], args[4], args[5], args[6]);
      }
      static now() { return new realDate(2026, 0, 1, 10, 0).getTime(); }
    }
    (global as any).Date = MockDate10h;

    await markDailyReminderShown();
    expect(await shouldShowDailyReminder()).toBe(false);
    await resetDailyReminder();
    expect(await shouldShowDailyReminder()).toBe(true);

    (global as any).Date = realDate;
  });
});

describe('computeStreakState', () => {
  it('returns "none" urgency when rewards is null', () => {
    const s = computeStreakState(null, new Date(Date.UTC(2026, 4, 12, 10, 0)));
    expect(s.streak).toBe(0);
    expect(s.streakAtRisk).toBe(false);
    expect(s.urgency).toBe('none');
  });

  it('returns "none" when the user has already played today (UTC)', () => {
    const s = computeStreakState(
      { dailyStreak: 5, lastDailyDate: '2026-05-12' },
      new Date(Date.UTC(2026, 4, 12, 10, 0)),
    );
    expect(s.streak).toBe(5);
    expect(s.playedTodayUtc).toBe(true);
    expect(s.streakAtRisk).toBe(false);
    expect(s.urgency).toBe('none');
  });

  it('returns "info" when streak alive, plenty of time left', () => {
    // 18h UTC → 6h until midnight → info zone (>= 6)
    const s = computeStreakState(
      { dailyStreak: 3, lastDailyDate: '2026-05-11' },
      new Date(Date.UTC(2026, 4, 12, 12, 0)), // 12h UTC → 12h left
    );
    expect(s.streakAtRisk).toBe(true);
    expect(s.urgency).toBe('info');
  });

  it('returns "warning" when < 6h left', () => {
    const s = computeStreakState(
      { dailyStreak: 7, lastDailyDate: '2026-05-11' },
      new Date(Date.UTC(2026, 4, 12, 21, 0)), // 21h UTC → 3h left
    );
    expect(s.streakAtRisk).toBe(true);
    expect(s.urgency).toBe('warning');
  });

  it('returns "urgent" when < 2h left', () => {
    const s = computeStreakState(
      { dailyStreak: 10, lastDailyDate: '2026-05-11' },
      new Date(Date.UTC(2026, 4, 12, 23, 30)), // 23h30 UTC → 30min left
    );
    expect(s.streakAtRisk).toBe(true);
    expect(s.urgency).toBe('urgent');
    expect(s.hoursUntilMidnightUtc).toBeLessThan(2);
  });

  it('zero streak → never at risk regardless of clock', () => {
    const s = computeStreakState(
      { dailyStreak: 0, lastDailyDate: '' },
      new Date(Date.UTC(2026, 4, 12, 23, 50)),
    );
    expect(s.streak).toBe(0);
    expect(s.streakAtRisk).toBe(false);
    expect(s.urgency).toBe('none');
  });
});
