import { createHash, randomInt, timingSafeEqual } from 'crypto'

/**
 * One-time verification codes stored in Postgres (public.verification_codes, server-only).
 * - Cryptographically random 6-digit codes (crypto.randomInt, not Math.random)
 * - Only a SHA-256 hash is stored, 10-minute expiry, max 5 attempts, single use
 * Works across serverless instances (the previous in-memory store did not).
 */
const TTL_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5
const hash = (channel: string, target: string, code: string) =>
  createHash('sha256').update(`${channel}:${target.toLowerCase()}:${code}`).digest('hex')

export async function issueVerificationCode(db: any, channel: 'email' | 'whatsapp', target: string): Promise<string> {
  const code = String(randomInt(100000, 1000000))
  const { error } = await db.from('verification_codes').upsert({
    channel, target: target.toLowerCase(), code_hash: hash(channel, target, code), attempts: 0,
    expires_at: new Date(Date.now() + TTL_MS).toISOString(), created_at: new Date().toISOString(),
  }, { onConflict: 'channel,target' })
  if (error) throw new Error(error.message)
  return code
}

export async function consumeVerificationCode(db: any, channel: 'email' | 'whatsapp', target: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const t = target.toLowerCase()
  const { data: row } = await db.from('verification_codes').select('id, code_hash, attempts, expires_at')
    .eq('channel', channel).eq('target', t).maybeSingle()
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return { ok: false, error: 'Invalid or expired code. Request a new one.' }
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: 'Too many wrong attempts. Request a new code.' }

  const expected = Buffer.from(row.code_hash, 'hex')
  const given = Buffer.from(hash(channel, t, String(code || '').trim()), 'hex')
  if (!timingSafeEqual(expected, given)) {
    await db.from('verification_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id)
    return { ok: false, error: `Incorrect code. ${MAX_ATTEMPTS - row.attempts - 1} attempt(s) left.` }
  }
  await db.from('verification_codes').delete().eq('id', row.id) // single use
  return { ok: true }
}
