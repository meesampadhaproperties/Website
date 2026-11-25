'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { checkActionAccess } from '@/lib/auth/permissions'
import { getTodayBoundsIst } from '@/lib/timezone'

/** Dashboard card id for "leads with a pending follow up" (any status). Not a status key. */
const FOLLOW_UPS_CARD = 'follow_ups'

/** KPI data for /crm: statuses + exact counts (one aggregate RPC for all-time, one for today). */
export async function getDashboardStats(): Promise<{
  statuses: any[]; total: number; today: number; followUps: number; statusCounts: Record<string, number>; error: string | null
}> {
  const auth = await checkActionAccess('dashboard', 'view')
  if (!auth.authorized) return { statuses: [], total: 0, today: 0, followUps: 0, statusCounts: {}, error: auth.error }
  try {
    const db = createServiceClient()
    const { startUtc, endUtc } = getTodayBoundsIst()
    const [statusesRes, allRes, todayRes] = await Promise.all([
      db.from('lead_statuses').select('*').order('sort_order', { ascending: true }).order('name', { ascending: true }),
      db.rpc('crm_leads_report', { p_start: null, p_end: null, p_source_keys: [] }),
      db.rpc('crm_leads_report', { p_start: startUtc, p_end: endUtc, p_source_keys: [] }),
    ])
    if (allRes.error) throw new Error(allRes.error.message)
    const statusCounts: Record<string, number> = {}
    for (const s of (allRes.data?.by_status || [])) statusCounts[String(s.key).toLowerCase()] = Number(s.count)
    return {
      statuses: statusesRes.data || [],
      total: Number(allRes.data?.total || 0),
      today: Number(todayRes.data?.total || 0),
      followUps: Number(allRes.data?.follow_up?.total || 0),
      statusCounts,
      error: null,
    }
  } catch (e: any) {
    return { statuses: [], total: 0, today: 0, followUps: 0, statusCounts: {}, error: e.message || 'Failed to load dashboard' }
  }
}

/** Paginated leads for a selected dashboard card ('follow_ups' | 'total' | 'todays' | <status key>). */
export async function getDashboardLeads(filterId: string, page: number, pageSize: number): Promise<{ data: any[]; count: number; error: string | null }> {
  const auth = await checkActionAccess('dashboard', 'view')
  if (!auth.authorized) return { data: [], count: 0, error: auth.error }

  const size = Math.min(Math.max(Number(pageSize) || 50, 1), 100)
  const p = Math.max(Number(page) || 1, 1)
  const from = (p - 1) * size
  const key = String(filterId || '')
  if (key !== 'total' && key !== 'todays' && !/^[a-z0-9_]{1,64}$/i.test(key)) return { data: [], count: 0, error: 'Invalid filter' }

  const db = createServiceClient()
  let query = db.from('leads')
    .select('id, name, email, phone, status, source_page, project, created_at, follow_up_at, follow_up_note', { count: 'exact' })
  if (key === FOLLOW_UPS_CARD) {
    // Pending follow ups on any status, soonest (and overdue) first
    query = query.not('follow_up_at', 'is', null)
  } else if (key === 'todays') {
    const { startUtc, endUtc } = getTodayBoundsIst()
    query = query.gte('created_at', startUtc).lte('created_at', endUtc)
  } else if (key !== 'total') {
    query = query.ilike('status', key) // key validated to [a-z0-9_] above: no wildcard/filter injection
  }
  query = key === FOLLOW_UPS_CARD
    ? query.order('follow_up_at', { ascending: true })
    : query.order('created_at', { ascending: false })

  const { data, count, error } = await query.range(from, from + size - 1)
  if (error) return { data: [], count: 0, error: error.message }
  return { data: data || [], count: count || 0, error: null }
}
