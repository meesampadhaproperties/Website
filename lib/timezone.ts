/**
 * Timezone Normalization Utilities for Universal CRM
 * Default Canonical Timezone: Indian Standard Time (Asia/Kolkata +05:30)
 * 
 * Prevents UTC day-shift leaks on cloud/serverless runtimes (e.g. Vercel UTC containers)
 * where selecting a calendar date pulled early morning or late night leads from adjacent days.
 */

export const CRM_TIMEZONE = 'Asia/Kolkata';

/**
 * Returns the exact YYYY-MM-DD calendar date string in Asia/Kolkata
 */
export function getIstCurrentDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CRM_TIMEZONE }).format(date);
}

/**
 * Returns yesterday's YYYY-MM-DD calendar date string in Asia/Kolkata
 */
export function getIstYesterdayDateString(): string {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return getIstCurrentDateString(yesterday);
}

/**
 * Returns the YYYY-MM-DD date string for N days ago in Asia/Kolkata
 */
export function getIstDaysAgoDateString(daysAgo: number): string {
  const now = new Date();
  const past = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return getIstCurrentDateString(past);
}

/**
 * Returns UTC ISO timestamps bounding 00:00:00.000 to 23:59:59.999 in Asia/Kolkata
 * for the given YYYY-MM-DD date string.
 */
export function getDayBoundsIst(dateStr: string): { startUtc: string; endUtc: string; dateStr: string } {
  if (!dateStr || typeof dateStr !== 'string') {
    return getTodayBoundsIst();
  }

  const cleanDate = dateStr.split('T')[0].trim();
  // Anchor to +05:30 IST
  const start = new Date(`${cleanDate}T00:00:00.000+05:30`);
  const end = new Date(`${cleanDate}T23:59:59.999+05:30`);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return getTodayBoundsIst();
  }

  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
    dateStr: cleanDate
  };
}

/**
 * Returns UTC ISO timestamps bounding today (00:00:00 to 23:59:59.999) in Asia/Kolkata
 */
export function getTodayBoundsIst(): { startUtc: string; endUtc: string; dateStr: string } {
  const todayStr = getIstCurrentDateString();
  return getDayBoundsIst(todayStr);
}

/**
 * Formats any UTC or ISO timestamp deterministically into IST for display
 */
export function formatIstDateTime(isoDateString?: string | null): { date: string; time: string; full: string } {
  if (!isoDateString) {
    return { date: '—', time: '—', full: '—' };
  }

  const d = new Date(isoDateString);
  if (isNaN(d.getTime())) {
    return { date: '—', time: '—', full: '—' };
  }

  const date = d.toLocaleDateString('en-IN', {
    timeZone: CRM_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const time = d.toLocaleTimeString('en-IN', {
    timeZone: CRM_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  return { date, time, full: `${date} at ${time}` };
}
