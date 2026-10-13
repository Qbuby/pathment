'use strict';

/**
 * Recurrence is where to-do apps go wrong, so the date maths is tested on its
 * own, with no database in the way.
 *
 * The two failures that matter: producing an occurrence for the day you just
 * finished (which turns one tick into an endless chain), and quietly moving a
 * monthly item to the wrong day because the next month is shorter.
 */

const { normalizeRepeat, nextOccurrence, describeRepeat } = require('../../src/utils/repeatRule');

// 2026-10-13 is a Tuesday. Every expectation below is anchored to that.
const TUE = '2026-10-13';

describe('reading a repeat rule', () => {
  it('treats "never" and nothing at all as not repeating', () => {
    expect(normalizeRepeat(null)).toBeNull();
    expect(normalizeRepeat({ freq: 'never' })).toBeNull();
  });

  it('refuses a frequency it cannot honour', () => {
    expect(() => normalizeRepeat({ freq: 'hourly' })).toThrow(/daily, weekly or monthly/i);
  });

  it('defaults the interval and keeps weekdays sorted and unique', () => {
    expect(normalizeRepeat({ freq: 'weekly', days: [3, 1, 3] }))
      .toEqual({ freq: 'weekly', interval: 1, days: [1, 3] });
  });

  it('drops weekday numbers that are not weekdays', () => {
    expect(normalizeRepeat({ freq: 'weekly', days: [1, 9, -2] }))
      .toEqual({ freq: 'weekly', interval: 1, days: [1] });
  });

  it('caps a runaway interval rather than storing it', () => {
    expect(normalizeRepeat({ freq: 'daily', interval: 9999 }).interval).toBe(52);
  });
});

describe('finding the next occurrence', () => {
  /**
   * The one that turns a tick into a loop. "Every day" completed on Tuesday
   * must land on Wednesday, never again on Tuesday.
   */
  it('never lands on the day just finished', () => {
    expect(nextOccurrence({ freq: 'daily', interval: 1 }, TUE)).toBe('2026-10-14');
    expect(nextOccurrence({ freq: 'weekly', interval: 1, days: [2] }, TUE)).toBe('2026-10-20');
  });

  it('counts a daily interval in whole days', () => {
    expect(nextOccurrence({ freq: 'daily', interval: 3 }, TUE)).toBe('2026-10-16');
  });

  it('walks to the next chosen weekday within the same week', () => {
    // Tue → next chosen day is Thursday.
    expect(nextOccurrence({ freq: 'weekly', interval: 1, days: [1, 4] }, TUE)).toBe('2026-10-15');
  });

  it('crosses into the next week when the chosen day has passed', () => {
    // Monday already gone this week, so the following Monday.
    expect(nextOccurrence({ freq: 'weekly', interval: 1, days: [1] }, TUE)).toBe('2026-10-19');
  });

  it('charges the extra weeks only when the week actually wraps', () => {
    // Every 2 weeks on Monday, from a Tuesday: skip a whole fortnight.
    expect(nextOccurrence({ freq: 'weekly', interval: 2, days: [1] }, TUE)).toBe('2026-10-26');
    // ...but Thursday is still this week, so the interval has not been crossed.
    expect(nextOccurrence({ freq: 'weekly', interval: 2, days: [4] }, TUE)).toBe('2026-10-15');
  });

  it('keeps every weekday moving one day at a time', () => {
    const weekdays = { freq: 'weekly', interval: 1, days: [1, 2, 3, 4, 5] };
    expect(nextOccurrence(weekdays, '2026-10-15')).toBe('2026-10-16'); // Thu → Fri
    expect(nextOccurrence(weekdays, '2026-10-16')).toBe('2026-10-19'); // Fri → Mon
  });

  /** 31 Jan + 1 month is not 3 March. */
  it('pins a monthly repeat to the last day when the next month is shorter', () => {
    expect(nextOccurrence({ freq: 'monthly', interval: 1 }, '2026-01-31')).toBe('2026-02-28');
    expect(nextOccurrence({ freq: 'monthly', interval: 1 }, '2026-03-31')).toBe('2026-04-30');
  });

  it('keeps the day of the month when it exists', () => {
    expect(nextOccurrence({ freq: 'monthly', interval: 1 }, '2026-10-13')).toBe('2026-11-13');
  });

  it('stops the series once it is past its end date', () => {
    const rule = { freq: 'daily', interval: 1, until: '2026-10-14' };
    expect(nextOccurrence(rule, '2026-10-13')).toBe('2026-10-14');
    expect(nextOccurrence(rule, '2026-10-14')).toBeNull();
  });

  it('says nothing comes next when there is no rule', () => {
    expect(nextOccurrence(null, TUE)).toBeNull();
  });
});

describe('describing a repeat', () => {
  it('names the everyday cases the way a person would', () => {
    expect(describeRepeat({ freq: 'daily', interval: 1 })).toBe('Every day');
    expect(describeRepeat({ freq: 'weekly', interval: 1, days: [1, 2, 3, 4, 5] })).toBe('Every weekday');
    expect(describeRepeat({ freq: 'weekly', interval: 1, days: [1, 4] })).toBe('Every Mon, Thu');
    expect(describeRepeat({ freq: 'monthly', interval: 1 })).toBe('Every month');
    expect(describeRepeat({ freq: 'daily', interval: 2 })).toBe('Every 2 days');
    expect(describeRepeat(null)).toBeNull();
  });
});
