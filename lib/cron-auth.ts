import { timingSafeEqual } from 'crypto'

/**
 * Cron endpoint authentication (shared by all /api/cron/* routes).
 * - FAILS CLOSED: if CRON_SECRET is not configured, nothing runs.
 * - Secret accepted ONLY via the Authorization header (never in the URL, where it ends up in logs).
 * - Constant-time comparison.
 */
export function checkCronAuth(request: Request): { ok: boolean; status: number; error?: string } {
  const secret = process.env.CRON_SECRET
  if (!secret) return { ok: false, status: 503, error: 'CRON_SECRET is not configured' }
  const given = Buffer.from(request.headers.get('authorization') || '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, status: 401, error: 'Unauthorized cron invocation' }
  }
  return { ok: true, status: 200 }
}
