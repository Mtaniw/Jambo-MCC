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
 * Returns today's date in yyyy-MM-dd format for internal logic/keys
 */
export function getTanzaniaTodayStr(): string {
  return format(getTanzaniaDate(), 'yyyy-MM-dd');
}

/**
 * Gets the start of the current month in yyyy-MM-dd for internal logic
 */
export function getTanzaniaMonthStartStr(): string {
  const d = getTanzaniaDate();
  return format(new Date(d.getFullYear(), d.getMonth(), 1), 'yyyy-MM-dd');
}

/**
 * System inception date: March this year (not 2024, because that's when the system was developed).
 * Returns 'YYYY-03-01'.
 */
export function getSystemStartDate(): string {
  const year = getTanzaniaDate().getFullYear();
  return `${year}-03-01`;
}

/**
 * System inception month: March this year.
 * Returns 'YYYY-03'.
 */
export function getSystemStartMonth(): string {
  const year = getTanzaniaDate().getFullYear();
  return `${year}-03`;
}

/**
 * System inception date as Date object
 */
export function getSystemStartDateObj(): Date {
  const year = getTanzaniaDate().getFullYear();
  return new Date(year, 2, 1, 0, 0, 0);
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
    let d: Date;
    
    if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      d = parseTanzaniaDate(date);
    } else {
      d = new Date(date);
    }
    
    if (isNaN(d.getTime())) return fallback;
    return format(d, formatStr);
  } catch (e) {
    return fallback;
  }
}
