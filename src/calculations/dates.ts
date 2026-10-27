/** Calendar-date helpers. Dates are plain {year, month, day} values; no time zones involved. */

export interface CalendarDate {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Parses a strict YYYY-MM-DD string. Returns null for anything that is not a real calendar date. */
export function parseIsoDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function compareDates(a: CalendarDate, b: CalendarDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** Age attained on the birthday that falls in the given calendar year. */
export function ageAttainedInYear(birth: CalendarDate, year: number): number {
  return year - birth.year;
}

/**
 * Date the person reaches age 70½: the date six calendar months after the
 * 70th birthday (IRS Pub. 590-B). If that month has no matching day, the last
 * day of that month is used.
 */
export function dateAttaining70AndAHalf(birth: CalendarDate): CalendarDate {
  const monthIndex = birth.month - 1 + 6;
  const year = birth.year + 70 + Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  const day = Math.min(birth.day, daysInMonth(year, month));
  return { year, month, day };
}

export function formatCalendarDate(d: CalendarDate): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[d.month - 1]} ${d.day}, ${d.year}`;
}
