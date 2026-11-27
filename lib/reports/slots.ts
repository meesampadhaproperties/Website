/**
 * Scheduled report slots and their windows. Pure: safe on client and server. All times are India time (IST).
 *
 * Six fixed slots a day. Each report covers the time since the PREVIOUS slot:
 *   6 AM  → yesterday 9 PM – today 6 AM      9 AM → 6 AM – 9 AM      12 PM → 9 AM – 12 PM
 *   3 PM  → 12 PM – 3 PM                     6 PM → 3 PM – 6 PM      9 PM  → 6 PM – 9 PM
 * Windows never overlap and never leave a gap, whichever slots a person has picked.
 */

export const REPORT_SLOTS = ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00'] as const
export type ReportSlot = (typeof REPORT_SLOTS)[number]
export const DEFAULT_REPORT_TIMES: string[] = ['09:00', '18:00']

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

/** Current IST "HH:00" slot and its date, for an optional override hour. */
export function currentIstSlot(now = new Date()): { date: string; slot: string } {
  const ist = new Date(now.getTime() + IST_OFFSET_MS)
  return { date: ist.toISOString().slice(0, 10), slot: `${String(ist.getUTCHours()).padStart(2, '0')}:00` }
}

/** UTC instant for an IST date + "HH:MM". */
export function istToUtc(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00+05:30`)
}

const addDays = (date: string, days: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10)

/** The window a slot reports on: from the previous slot (yesterday's last slot for the first one) to this slot. */
export function windowForSlot(date: string, slot: string): { start: Date; end: Date } {
  const i = (REPORT_SLOTS as readonly string[]).indexOf(slot)
  const end = istToUtc(date, slot)
  const start = i > 0 ? istToUtc(date, REPORT_SLOTS[i - 1]) : istToUtc(addDays(date, -1), REPORT_SLOTS[REPORT_SLOTS.length - 1])
  return { start, end }
}

/**
 * Turns whatever is stored into valid slots. Older saves used "6", "9", "12" (or "9:00"), so those are understood too.
 * Anything that is not one of the six slots is dropped. Result is sorted and has no duplicates.
 */
export function normalizeReportTimes(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out = new Set<string>()
  for (const raw of input) {
    const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*$/.exec(String(raw ?? ''))
    if (!m || (m[2] !== undefined && m[2] !== '00')) continue
    const slot = `${m[1].padStart(2, '0')}:00`
    if ((REPORT_SLOTS as readonly string[]).includes(slot)) out.add(slot)
  }
  return [...out].sort()
}

/** "06:00" → "6 AM", "21:00" → "9 PM". */
export function slotLabel(slot: string): string {
  const h = parseInt(slot, 10)
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`
}

/** Adds or removes a slot. Removing a slot also removes its master-report tick. */
export function toggleSlot(times: string[], slot: string): string[] {
  const set = new Set(normalizeReportTimes(times))
  if (set.has(slot)) set.delete(slot); else set.add(slot)
  return [...set].sort()
}

/** The master report can only ride on a slot the person actually receives. */
export function masterTimesFor(times: unknown, master: unknown): string[] {
  const own = new Set(normalizeReportTimes(times))
  return normalizeReportTimes(master).filter((s) => own.has(s))
}
