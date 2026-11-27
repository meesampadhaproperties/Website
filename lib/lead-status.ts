import { getIstCurrentDateString } from './timezone'

/**
 * Follow ups are NOT a lead status (REQ-93).
 * A lead keeps its pipeline status (New, Contacted, ...) and can have ONE pending follow up,
 * stored on the lead (follow_up_at + follow_up_note). Every change is logged in
 * lead_activities so the Follow up → History tab can show it. Shared by client and server.
 */

/** The old "Follow Up" status key. Reserved so nobody re-creates it as a status. */
export const RESERVED_STATUS_KEYS: readonly string[] = ['follow_up']

export const isReservedStatusKey = (key?: string | null) =>
  !!key && RESERVED_STATUS_KEYS.includes(key.toLowerCase().trim())

export interface FollowUpInput {
  date: string // YYYY-MM-DD (IST)
  time: string // HH:MM 24h (IST)
  note: string
}

export const FOLLOW_UP_NOTE_MAX = 1000

/** Slack for clock differences, so a time picked for "right now" isn't rejected. */
const PAST_GRACE_MS = 60_000

/** Converts an IST date + time to a UTC ISO string, or null if invalid. */
export function followUpToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) return null
  const d = new Date(`${date}T${time}:00+05:30`)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/** Splits a UTC timestamp into the IST date + time the form inputs use. */
export function isoToFollowUpParts(iso?: string | null): { date: string; time: string } | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return { date: getIstCurrentDateString(d), time: time.startsWith('24') ? `00${time.slice(2)}` : time }
}

/** Server + client validation: a real date/time, not in the past, with a note. */
export function validateFollowUp(
  input: Partial<FollowUpInput> | null | undefined,
  now: number = Date.now()
): { ok: true; iso: string; note: string } | { ok: false; error: string } {
  const iso = followUpToIso(String(input?.date || ''), String(input?.time || ''))
  if (!iso) return { ok: false, error: 'Please choose a valid follow-up date and time.' }
  if (new Date(iso).getTime() < now - PAST_GRACE_MS) {
    return { ok: false, error: 'That time has already passed. Please pick a future date and time.' }
  }
  const note = String(input?.note || '').trim().slice(0, FOLLOW_UP_NOTE_MAX)
  if (!note) return { ok: false, error: 'Please add a follow-up note.' }
  return { ok: true, iso, note }
}

/** Default slot for a new follow up: the next full hour in IST. */
export function defaultFollowUpSlot(now: Date = new Date()): { date: string; time: string } {
  const parts = isoToFollowUpParts(new Date(now.getTime() + 60 * 60 * 1000).toISOString())!
  return { date: parts.date, time: `${parts.time.slice(0, 2)}:00` }
}

export type FollowUpDueState = 'overdue' | 'today' | 'upcoming'

/** Overdue (time passed), today (later today, IST) or upcoming. */
export function followUpDueState(iso?: string | null, now: Date = new Date()): FollowUpDueState | null {
  if (!iso) return null
  const t = new Date(iso)
  if (isNaN(t.getTime())) return null
  if (t.getTime() < now.getTime()) return 'overdue'
  return getIstCurrentDateString(t) === getIstCurrentDateString(now) ? 'today' : 'upcoming'
}

/** Short IST label for chips and history, e.g. "24 Nov, 10:00 am". */
export function formatFollowUpShort(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
}

/** Activity types written to lead_activities for follow ups. */
export const FOLLOW_UP_ACTIVITY = {
  scheduled: 'follow_up_scheduled',
  changed: 'follow_up_changed',
  done: 'follow_up_done',
  removed: 'follow_up_removed',
} as const

/** CRM-internal follow-up entries (not customer activity). */
export const isFollowUpActivity = (type?: string | null) =>
  !!type && type.toLowerCase().startsWith('follow_up_')

const ACTIVITY_LABELS: Record<string, string> = {
  whatsapp_in: 'WhatsApp from customer',
  whatsapp_out: 'WhatsApp bot reply',
  whatsapp_message: 'WhatsApp bot',
  meta_form_submission: 'Form submitted',
  manual_enquiry: 'Enquiry added',
  sms_sent: 'SMS sent',
  sms_failed: 'SMS not sent',
  sms_opened: 'SMS opened on phone',
  email_sent: 'Email sent',
  email_failed: 'Email not sent',
  whatsapp_opened: 'WhatsApp opened',
  follow_up_scheduled: 'Follow up scheduled',
  follow_up_changed: 'Follow up changed',
  follow_up_done: 'Follow up done',
  follow_up_removed: 'Follow up removed',
}

/** Plain-language label for a lead activity type, e.g. follow_up_done → "Follow up done". */
export function activityLabel(type?: string | null): string {
  const t = String(type || '').trim()
  if (!t) return 'Activity'
  const known = ACTIVITY_LABELS[t.toLowerCase()]
  if (known) return known
  const words = t.replace(/_/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
