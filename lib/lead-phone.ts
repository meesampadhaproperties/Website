/**
 * One lead per person, identified by phone number (REQ-96).
 * "+91 98765 43210", "919876543210", "09876543210" and "9876543210" are the same person.
 */

/** Comparable key for a phone number, or '' when it is too short to identify anyone. */
export function phoneMatchKey(phone?: string | null): string {
  let digits = String(phone || '').replace(/\D/g, '').replace(/^0+/, '')
  if (digits.length < 10) return ''
  if (digits.length === 10) digits = `91${digits}` // Indian mobile without country code
  return `+${digits}`
}

export const isSamePhone = (a?: string | null, b?: string | null) => {
  const ka = phoneMatchKey(a)
  return !!ka && ka === phoneMatchKey(b)
}

/** ILIKE pattern that finds every stored format of a number (spaces, dashes, +91, leading 0). */
export function phoneCandidatePattern(phone?: string | null): string | null {
  const key = phoneMatchKey(phone)
  if (!key) return null
  return `%${key.replace(/\D/g, '').slice(-10).split('').join('%')}%`
}

/**
 * Leads with the same phone number, oldest first. `db` is a Supabase service client.
 * Candidates are read with a loose pattern, then only exact key matches are kept.
 */
export async function findLeadsByPhone(
  db: any,
  phone: string | null | undefined,
  columns = 'id, name, phone, email, project, project_id, status, created_at',
  limit = 500
): Promise<any[]> {
  const pattern = phoneCandidatePattern(phone)
  if (!pattern) return []
  // The exact match below compares each row's phone, so it must always be read, whatever columns the caller asked for
  const cols = columns.trim() === '*' || /(^|,)\s*phone\s*(,|$)/.test(columns) ? columns : `${columns}, phone`
  // The loose pattern can also catch other numbers, so read enough candidates and apply `limit` after the exact match
  const { data, error } = await db.from('leads').select(cols).ilike('phone', pattern)
    .order('created_at', { ascending: true }).limit(Math.max(limit, 50))
  if (error || !data) return []
  const key = phoneMatchKey(phone)
  return data.filter((l: any) => phoneMatchKey(l.phone) === key).slice(0, limit)
}
