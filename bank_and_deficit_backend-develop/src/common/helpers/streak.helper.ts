const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Normalize to local midnight for day-diff comparisons. */
export function startOfLocalDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

/**
 * Whole calendar days between two dates (a - b), after normalizing to local midnight.
 * Matches the day-diff used by post streak updates.
 */
export function calendarDayDiff(a: Date, b: Date): number {
  return Math.floor(
    (startOfLocalDay(a).getTime() - startOfLocalDay(b).getTime()) / MS_PER_DAY,
  );
}

/**
 * A streak stays alive if the last activity was today or yesterday.
 * Missing two or more calendar days breaks it (display as 0 until a new post).
 */
export function isStreakBroken(
  lastStreakDate: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastStreakDate) {
    return true;
  }

  return calendarDayDiff(now, lastStreakDate) > 1;
}

export function resolveCurrentStreak(
  currentStreak: number,
  lastStreakDate: Date | null | undefined,
  now: Date = new Date(),
): number {
  if (isStreakBroken(lastStreakDate, now)) {
    return 0;
  }

  return currentStreak;
}

export type ComputedStreaks = {
  currentStreak: number;
  highestStreak: number;
  lastStreakDate: Date | null;
};

/**
 * Deduplicate activity timestamps into local calendar days, newest first.
 */
export function uniqueActivityDaysDesc(activityDates: Date[]): Date[] {
  const dayTimes = new Set<number>();

  for (const date of activityDates) {
    dayTimes.add(startOfLocalDay(date).getTime());
  }

  return [...dayTimes].sort((a, b) => b - a).map((time) => new Date(time));
}

/**
 * Compute current + highest consecutive-day streaks from activity days.
 * `activityDates` may include multiple posts on the same day.
 */
export function computeStreaksFromActivityDates(
  activityDates: Date[],
  now: Date = new Date(),
): ComputedStreaks {
  const days = uniqueActivityDaysDesc(activityDates);

  if (days.length === 0) {
    return {
      currentStreak: 0,
      highestStreak: 0,
      lastStreakDate: null,
    };
  }

  let highestStreak = 1;
  let run = 1;

  // days are newest → oldest; walk for max consecutive run
  for (let i = 1; i < days.length; i++) {
    const newer = days[i - 1];
    const older = days[i];
    const gap = calendarDayDiff(newer, older);

    if (gap === 1) {
      run++;
      highestStreak = Math.max(highestStreak, run);
    } else {
      run = 1;
    }
  }

  const today = startOfLocalDay(now);
  const mostRecent = days[0];
  const daysSinceMostRecent = calendarDayDiff(today, mostRecent);

  let currentStreak = 0;

  if (daysSinceMostRecent <= 1) {
    currentStreak = 1;

    for (let i = 1; i < days.length; i++) {
      const expectedPrev = calendarDayDiff(days[i - 1], days[i]);
      if (expectedPrev === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  return {
    currentStreak,
    highestStreak,
    lastStreakDate: mostRecent,
  };
}
