import { phoneMatchKey } from './lead-phone'

/**
 * WhatsApp's free "customer service window": for 24 hours after a customer last messaged the business number,
 * the business can send them ordinary (non-template) messages at no extra cost. Outside it, only paid templates work.
 * Pure: safe on client and server.
 */

export const WINDOW_HOURS = 24

/** The oldest customer message that still keeps the window open right now. */
export const windowStart = (now: Date = new Date()): Date => new Date(now.getTime() - WINDOW_HOURS * 60 * 60 * 1000)

/**
 * Which leads can be messaged for free. The window belongs to the PHONE NUMBER, not the lead: if a person
 * has two lead records, a message on either one opens the window for both.
 * `activeKeys` = phone keys (see phoneMatchKey) of people who messaged inside the window.
 */
export function splitByWindow<T extends { phone?: string | null }>(leads: T[], activeKeys: Set<string>): { inWindow: T[]; outside: T[]; noPhone: T[] } {
  const inWindow: T[] = [], outside: T[] = [], noPhone: T[] = []
  for (const l of leads) {
    const key = phoneMatchKey(l.phone)
    if (!key) noPhone.push(l)
    else if (activeKeys.has(key)) inWindow.push(l)
    else outside.push(l)
  }
  return { inWindow, outside, noPhone }
}
