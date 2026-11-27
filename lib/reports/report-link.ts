import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Signed download links for the scheduled lead reports (the "Download Excel" link in the WhatsApp message).
 * The link carries the report window and an expiry, signed with a server secret, so nobody can change the
 * dates or make up a link. Server only.
 */

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')
const MAX_WINDOW_MS = 32 * 24 * 60 * 60 * 1000
export const REPORT_LINK_DAYS = 7

function secret(): string {
  const s = process.env.REPORT_LINK_SECRET || process.env.CRON_SECRET
  if (!s) throw new Error('CRON_SECRET is not configured (it also signs report download links).')
  return s
}

const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest()

export function signReportToken(start: Date, end: Date, now = new Date()): string {
  const payload = b64(JSON.stringify({ s: start.getTime(), e: end.getTime(), x: now.getTime() + REPORT_LINK_DAYS * 24 * 60 * 60 * 1000 }))
  return `${payload}.${b64(sign(payload))}`
}

/** The report window a valid, unexpired token stands for, or null. */
export function verifyReportToken(token: string | null | undefined, now = new Date()): { start: Date; end: Date } | null {
  const [payload, mac] = String(token || '').split('.')
  if (!payload || !mac) return null
  let expected: Buffer
  try { expected = sign(payload) } catch { return null }
  const given = Buffer.from(mac, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const { s, e, x } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (![s, e, x].every(Number.isFinite) || x < now.getTime() || e <= s || e - s > MAX_WINDOW_MS) return null
    return { start: new Date(s), end: new Date(e) }
  } catch { return null }
}
