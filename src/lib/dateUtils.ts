import { format } from 'date-fns';

/**
 * Gets the current date/time in Tanzania (East Africa Time, UTC+3)
 */
export function getTanzaniaDate(): Date {
  // Tanzania is UTC+3
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * 3));
}

/**
 * Formats a date to yyyy-MM-dd in Tanzania time
 */
export function getTanzaniaTodayStr(): string {
  return format(getTanzaniaDate(), 'yyyy-MM-dd');
}

/**
 * Gets the start of the current month in yyyy-MM-dd in Tanzania time
 */
export function getTanzaniaMonthStartStr(): string {
  const d = getTanzaniaDate();
  return format(new Date(d.getFullYear(), d.getMonth(), 1), 'yyyy-MM-dd');
}

/**
 * Converts a yyyy-MM-dd string to a Date object at start of day in Tanzania time
 */
export function parseTanzaniaDate(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  const [year, month, day] = dateStr.split('-').map(Number);
  // Create date in UTC first to avoid local timezone shifts
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

/**
 * Safely formats a date string or object. Returns fallback if invalid.
 */
export function safeFormat(date: any, formatStr: string = 'dd/MM/yyyy', fallback: string = 'N/A'): string {
  try {
    if (!date) return fallback;
    const d = new Date(date);
    if (isNaN(d.getTime())) return fallback;
    return format(d, formatStr);
  } catch (e) {
    return fallback;
  }
}
