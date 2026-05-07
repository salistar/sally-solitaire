/**
 * Tests pour daily-reminder (in-app reminder Daily Challenge).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { shouldShowDailyReminder, markDailyReminderShown, resetDailyReminder } from '../../src/game/daily-reminder';

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
