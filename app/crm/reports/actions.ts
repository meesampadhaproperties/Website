'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { checkActionAccess } from '@/lib/auth/permissions'
import { getDayBoundsIst, getIstCurrentDateString, getIstDaysAgoDateString } from '@/lib/timezone'

export type ReportRange = 'all' | 'today' | '7d' | '30d' | '90d'

export interface ReportStatus { key: string; name: string; color_bg: string; color_text: string; color_border?: string; sort_order: number }
export interface ReportSource { key: string; name: string }
export interface LeadsReport {
  range: ReportRange
  startDate: string | null // IST YYYY-MM-DD
  endDate: string          // IST YYYY-MM-DD
  total: number
  byStatus: { key: string; count: number }[]
  bySource: { key: string; count: number }[]
  unmatchedSource: number
  byProject: { name: string; count: number }[]
  daily: { day: string; count: number }[]
  /** Pending follow ups on any status: current snapshot (not limited by range) */
  followUp: { total: number; overdue: number; due_today: number; upcoming: number }
  statuses: ReportStatus[]
  sources: ReportSource[]
  generatedAt: string
}

const RANGE_DAYS: Record<Exclude<ReportRange, 'all' | 'today'>, number> = { '7d': 6, '30d': 29, '90d': 89 }

/** Exact aggregates computed in Postgres (crm_leads_report) over ALL leads in range: no row cap. */
export async function getLeadsReport(range: ReportRange = 'all'): Promise<{ data: LeadsReport | null; error: string | null }> {
  const auth = await checkActionAccess('reports', 'view')
  if (!auth.authorized) return { data: null, error: auth.error }

  try {
    const db = createServiceClient()
    const today = getIstCurrentDateString()
    const endUtc = getDayBoundsIst(today).endUtc
    const startDate = range === 'all' ? null : range === 'today' ? today : getIstDaysAgoDateString(RANGE_DAYS[range])
    const startUtc = startDate ? getDayBoundsIst(startDate).startUtc : null

    const [{ data: statuses }, { data: sources }] = await Promise.all([
      db.from('lead_statuses').select('key, name, color_bg, color_text, color_border, sort_order').order('sort_order', { ascending: true }),
      db.from('lead_sources').select('key, name').order('sort_order', { ascending: true }),
    ])
    const sourceList: ReportSource[] = (sources && sources.length > 0)
      ? sources
      : [{ key: 'meta', name: 'Meta' }, { key: 'website', name: 'Website' }, { key: 'whatsapp', name: 'WhatsApp' }]

    const { data, error } = await db.rpc('crm_leads_report', {
      p_start: startUtc,
      p_end: range === 'all' ? null : endUtc,
      p_source_keys: sourceList.map(s => s.key),
    })
    if (error) return { data: null, error: error.message }

    const r: any = data || {}
    return {
      data: {
        range,
        startDate,
        endDate: today,
        total: Number(r.total || 0),
        byStatus: r.by_status || [],
        bySource: r.by_source || [],
        unmatchedSource: Number(r.unmatched_source || 0),
        byProject: r.by_project || [],
        daily: r.daily || [],
        followUp: {
          total: Number(r.follow_up?.total || 0),
          overdue: Number(r.follow_up?.overdue || 0),
          due_today: Number(r.follow_up?.due_today || 0),
          upcoming: Number(r.follow_up?.upcoming || 0),
        },
        statuses: (statuses || []) as ReportStatus[],
        sources: sourceList,
        generatedAt: new Date().toISOString(),
      },
      error: null,
    }
  } catch (e: any) {
    return { data: null, error: e.message || 'Failed to build report' }
  }
}
