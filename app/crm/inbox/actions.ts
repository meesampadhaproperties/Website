'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { checkActionAccess } from '@/lib/auth/permissions'
import { getDayBoundsIst, getIstCurrentDateString, getIstDaysAgoDateString } from '@/lib/timezone'
import { isFollowUpActivity } from '@/lib/lead-status'
import { onlyMetaLeads } from '@/lib/lead-source'

export type InboxDateRange = 'all' | 'today' | 'yesterday' | '7d' | '30d'

/** IST-aligned UTC bounds for a date preset (null = no date filter) */
function getInboxDateBounds(range?: InboxDateRange): { startUtc: string; endUtc: string } | null {
  if (!range || range === 'all') return null
  const today = getIstCurrentDateString()
  const end = getDayBoundsIst(today).endUtc
  if (range === 'today') return { startUtc: getDayBoundsIst(today).startUtc, endUtc: end }
  if (range === 'yesterday') {
    const b = getDayBoundsIst(getIstDaysAgoDateString(1))
    return { startUtc: b.startUtc, endUtc: b.endUtc }
  }
  // Last N days INCLUDING today
  const days = range === '7d' ? 6 : 29
  return { startUtc: getDayBoundsIst(getIstDaysAgoDateString(days)).startUtc, endUtc: end }
}

export async function getInboxFilterOptions() {
  const auth = await checkActionAccess('inbox', 'view')
  if (!auth.authorized) return { projects: [], forms: [] }

  const supabase = createServiceClient() // guarded by checkActionAccess/requireAdmin above; tables are server-only

  const [{ data: projects }, { data: forms }, { data: leadForms }] = await Promise.all([
    // A lead's project is a Projects-page project (REQ-95)
    supabase.from('projects').select('id, name, client_name').eq('kind', 'workspace').order('name', { ascending: true }),
    supabase.from('meta_forms').select('id, form_id, name, project_id, project_name').order('name', { ascending: true }),
    onlyMetaLeads(supabase.from('leads').select('form_id')).limit(5000),
  ])

  // Only forms of an existing Meta client, or forms that actually have leads here.
  // Leftovers from a deleted/never-connected client are hidden.
  const usedFormIds = new Set((leadForms || []).map((l: any) => l.form_id))
  return {
    projects: projects || [],
    forms: (forms || []).filter((f: any) => f.project_id || usedFormIds.has(f.form_id))
  }
}

export async function getInboxLeadsWithActivity(
  page: number = 1,
  limit: number = 50,
  filters?: {
    project?: string,
    formId?: string,
    dateRange?: InboxDateRange
  }
) {
  const auth = await checkActionAccess('inbox', 'view')
  if (!auth.authorized) return { data: [], count: 0, error: auth.error }

  const supabase = createServiceClient() // guarded by checkActionAccess/requireAdmin above; tables are server-only
  const from = (page - 1) * limit
  const to = from + limit - 1
  
  // Build query for inbox leads: Meta leads only (manual and other sources stay on the Leads page)
  let query = onlyMetaLeads(supabase
    .from('leads')
    .select(`
      *,
      lead_activities (*)
    `, { count: 'exact' }))

  // Apply project filter
  if (filters?.project && filters.project !== 'all') {
    query = query.eq('project', filters.project)
  }

  // Apply date range filter (IST calendar days)
  const bounds = getInboxDateBounds(filters?.dateRange)
  if (bounds) {
    query = query.gte('created_at', bounds.startUtc).lte('created_at', bounds.endUtc)
  }

  // Apply form filter (matches form_id column or source_page text)
  // formId is interpolated into a PostgREST filter string: allow only plain identifiers (no , ( ) . : % injection)
  if (filters?.formId && filters.formId !== 'all' && /^[A-Za-z0-9_-]{1,64}$/.test(filters.formId)) {
    query = query.or(`form_id.eq.${filters.formId},source_page.ilike.%${filters.formId}%`)
  }

  // Latest enquiry first: a person who enquired again moves back to the top
  const { data, error, count } = await query
    .order('last_enquiry_at', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.error('Error fetching inbox leads:', error)
    return { data: [], count: 0, error: 'Failed to fetch inbox leads' }
  }

  // Ensure activities are ordered by created_at ascending (chronological) for each lead
  const formattedData = (data || []).map((lead: any) => {
    if (lead.lead_activities) {
      lead.lead_activities.sort((a: any, b: any) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    }
    return lead
  })

  return { data: formattedData, count: count || 0, error: null }
}

export async function getInboxAnalytics() {
  const auth = await checkActionAccess('inbox', 'view')
  if (!auth.authorized) return { totalLeads: 0, totalInteractions: 0, totalCallbacks: 0 }

  const supabase = createServiceClient() // guarded by checkActionAccess/requireAdmin above; tables are server-only
  
  // All Meta leads (the Inbox's scope) to compute accurate analytics without pagination limits
  const { data, count } = await onlyMetaLeads(supabase
    .from('leads')
    .select(`
      id,
      lead_activities ( activity_type )
    `, { count: 'exact' }))

  if (!data) return { totalLeads: 0, totalInteractions: 0, totalCallbacks: 0 }

  // Customer interactions only: follow-up entries are CRM notes
  const totalInteractions = data.reduce((sum, lead) =>
    sum + (lead.lead_activities || []).filter((a: any) => !isFollowUpActivity(a.activity_type)).length, 0)
  const totalCallbacks = data.filter(lead => lead.lead_activities?.some((a: any) => a.activity_type === 'Requested Callback')).length

  return { totalLeads: count || 0, totalInteractions, totalCallbacks }
}

export async function getInboxUnreadCount(viewedIds: string[] = []) {
  try {
    // Sidebar badge: users without inbox access simply see 0
    const auth = await checkActionAccess('inbox', 'view')
    if (!auth.authorized) return 0

    const supabase = createServiceClient() // guarded by checkActionAccess/requireAdmin above; tables are server-only
    // Same scope as the Inbox: Meta leads only
    const { data, error } = await onlyMetaLeads(supabase
      .from('leads')
      .select('id'))
      .or('status.eq.new,status.is.null')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error || !data) return 0

    const viewedSet = new Set(viewedIds || [])
    const unread = data.filter(l => !viewedSet.has(l.id))
    return unread.length
  } catch (err) {
    console.error('Failed to get inbox unread count:', err)
    return 0
  }
}

// Aliases for backwards compatibility
export const getWhatsappLeadsWithActivity = getInboxLeadsWithActivity
export const getWhatsappAnalytics = getInboxAnalytics
