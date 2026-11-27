'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { checkActionAccess } from '@/lib/auth/permissions'
import { FALLBACK_SOURCE_KEYS } from '@/lib/lead-source'
import { OUTREACH_MAX_LEADS } from '@/lib/outreach'

/** Bulk Sender page (REQ-103): find leads by search / source / status, then message them. */

export interface BulkFilters {
  search?: string
  source?: string
  status?: string
}

export interface BulkLead {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  project: string | null
  source_page: string | null
  form_id: string | null
  status: string | null
  created_at: string
  last_enquiry_at: string | null
  enquiry_count: number | null
}

const COLUMNS = 'id, name, phone, email, project, source_page, form_id, status, created_at, last_enquiry_at, enquiry_count'

function applyFilters(query: any, f: BulkFilters) {
  // Characters with meaning in PostgREST filters are removed (no filter injection)
  const search = String(f?.search || '').replace(/[,()"%*\\:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (search) {
    const v = `%${search}%`
    query = query.or(`name.ilike.${v},email.ilike.${v},phone.ilike.${v},project.ilike.${v}`)
  }
  const source = String(f?.source || '').replace(/[^a-z0-9_]/gi, '')
  if (source && source !== 'all') query = query.ilike('source_page', `%${source}%`)
  const status = String(f?.status || '').replace(/[^a-z0-9_]/gi, '')
  if (status && status !== 'all') query = query.eq('status', status)
  return query
}

export async function getBulkSenderOptions(): Promise<{
  statuses: { key: string; name: string; color_bg?: string; color_text?: string; color_border?: string }[]
  sources: { key: string; name: string }[]
}> {
  const auth = await checkActionAccess('bulk_sender', 'view')
  if (!auth.authorized) return { statuses: [], sources: [] }
  const db = createServiceClient()
  const [{ data: statuses }, { data: sources }] = await Promise.all([
    db.from('lead_statuses').select('key, name, color_bg, color_text, color_border').order('sort_order', { ascending: true }),
    db.from('lead_sources').select('key, name').order('sort_order', { ascending: true }),
  ])
  return {
    statuses: statuses || [],
    sources: sources && sources.length ? sources : FALLBACK_SOURCE_KEYS.map((k) => ({ key: k, name: k.charAt(0).toUpperCase() + k.slice(1) })),
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Deletes leads from the Bulk Sender (and their history: activities are removed with them).
 * Same rule as the Leads page: Super Admin only. Up to OUTREACH_MAX_LEADS at a time.
 */
export async function deleteBulkLeads(ids: string[]): Promise<{ success: boolean; deleted: number; error?: string }> {
  const auth = await checkActionAccess('bulk_sender', 'edit')
  if (!auth.authorized) return { success: false, deleted: 0, error: auth.error }
  if (auth.role !== 'Super Admin') return { success: false, deleted: 0, error: 'Only the Super Admin can delete leads.' }

  const list = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter((id) => UUID_RE.test(id)))]
  if (list.length === 0) return { success: false, deleted: 0, error: 'Choose at least one lead to delete.' }
  if (list.length > OUTREACH_MAX_LEADS) return { success: false, deleted: 0, error: `You can delete up to ${OUTREACH_MAX_LEADS} leads at a time.` }

  const { data, error } = await createServiceClient().from('leads').delete().in('id', list).select('id')
  if (error) return { success: false, deleted: 0, error: error.message }
  for (const path of ['/crm/bulk-sender', '/crm/leads', '/crm/inbox', '/crm']) revalidatePath(path)
  return { success: true, deleted: (data || []).length }
}

/** One page of leads, latest enquiry first. */
export async function getBulkLeads(filters: BulkFilters, page = 1, pageSize = 50): Promise<{ data: BulkLead[]; count: number; error?: string }> {
  const auth = await checkActionAccess('bulk_sender', 'view')
  if (!auth.authorized) return { data: [], count: 0, error: auth.error }
  const size = Math.min(Math.max(Number(pageSize) || 50, 10), 100)
  const from = (Math.max(Number(page) || 1, 1) - 1) * size
  const query = applyFilters(createServiceClient().from('leads').select(COLUMNS, { count: 'exact' }), filters)
  const { data, count, error } = await query
    .order('last_enquiry_at', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, from + size - 1)
  if (error) return { data: [], count: 0, error: 'Could not load leads.' }
  return { data: (data || []) as BulkLead[], count: count || 0 }
}

/** "Select all matching": every matching lead, up to the per-send limit. */
export async function getBulkLeadsForSelection(filters: BulkFilters): Promise<{ data: BulkLead[]; count: number; capped: boolean; error?: string }> {
  const auth = await checkActionAccess('bulk_sender', 'edit')
  if (!auth.authorized) return { data: [], count: 0, capped: false, error: auth.error }
  const query = applyFilters(createServiceClient().from('leads').select(COLUMNS, { count: 'exact' }), filters)
  const { data, count, error } = await query
    .order('last_enquiry_at', { ascending: false })
    .order('created_at', { ascending: false })
    .range(0, OUTREACH_MAX_LEADS - 1)
  if (error) return { data: [], count: 0, capped: false, error: 'Could not load leads.' }
  return { data: (data || []) as BulkLead[], count: count || 0, capped: (count || 0) > OUTREACH_MAX_LEADS }
}

export interface SmsWallet {
  configured: boolean
  credits: number | null
  /** ₹ per SMS from MSG91_COST_PER_SMS (MSG91 doesn't report the price) */
  costPerSms: number | null
  error?: string
}

/** SMS wallet for the Bulk Sender status card (REQ-106). */
export async function getSmsWallet(): Promise<SmsWallet> {
  const auth = await checkActionAccess('bulk_sender', 'view')
  if (!auth.authorized) return { configured: false, credits: null, costPerSms: null, error: auth.error }
  const cost = Number(process.env.MSG91_COST_PER_SMS)
  const costPerSms = Number.isFinite(cost) && cost > 0 ? cost : null
  const key = process.env.MSG91_AUTH_KEY
  if (!key) return { configured: false, credits: null, costPerSms }
  const { fetchMsg91Balance } = await import('@/lib/sms')
  const res = await fetchMsg91Balance(key, process.env.MSG91_ROUTE_TYPE || '4')
  return 'error' in res ? { configured: true, credits: null, costPerSms, error: res.error } : { configured: true, credits: res.credits, costPerSms }
}
