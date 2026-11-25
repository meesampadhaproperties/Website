'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { checkActionAccess } from '@/lib/auth/permissions'
import { phoneMatchKey } from '@/lib/lead-phone'
import { FALLBACK_SOURCE_KEYS } from '@/lib/lead-source'
import { loadEnquiryTypes } from '@/lib/enquiry-types'
import { IMPORT_MAX_ROWS, validateImportRow, type ImportLists, type ImportRow } from '@/lib/lead-import'

/** Leads → Import from Excel (REQ-101). Rows are re-validated here; the browser preview is only a guide. */

export interface ImportRowResult {
  row: number
  status: 'imported' | 'skipped' | 'error'
  message?: string
}

/** The CRM lists an import must match (also used by the browser to build the template dropdowns). */
export async function getImportLists(): Promise<ImportLists & { error?: string }> {
  const auth = await checkActionAccess('leads', 'edit')
  if (!auth.authorized) return { sources: [], statuses: [], projects: [], enquiryTypes: [], error: auth.error }
  const db = createServiceClient()
  const [{ data: sources }, { data: statuses }, { data: projects }] = await Promise.all([
    db.from('lead_sources').select('key, name').order('sort_order', { ascending: true }),
    db.from('lead_statuses').select('key, name').order('sort_order', { ascending: true }),
    db.from('projects').select('id, name').eq('kind', 'workspace').order('name', { ascending: true }),
  ])
  return {
    sources: sources && sources.length ? sources : FALLBACK_SOURCE_KEYS.map((k) => ({ key: k, name: k.charAt(0).toUpperCase() + k.slice(1) })),
    statuses: statuses || [],
    projects: (projects || []).map((p: any) => ({ id: String(p.id), name: String(p.name || '') })),
    enquiryTypes: await loadEnquiryTypes(db),
  }
}

/** Every stored phone number's key → lead id (one-lead-per-person check), read in pages. */
async function existingPhoneKeys(db: ReturnType<typeof createServiceClient>): Promise<Set<string>> {
  const keys = new Set<string>()
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await db.from('leads').select('phone').not('phone', 'is', null).range(from, from + 999)
    if (error || !data) break
    data.forEach((l: any) => { const k = phoneMatchKey(l.phone); if (k) keys.add(k) })
    if (data.length < 1000) break
  }
  return keys
}

/**
 * Imports up to 500 rows per call (the browser sends the file in chunks).
 * Numbers already in the CRM, or repeated earlier in the file, are skipped (one lead per person).
 */
export async function importLeadsChunk(rows: ImportRow[], seenInFile: string[] = []): Promise<{ results: ImportRowResult[]; seen: string[]; error?: string }> {
  const auth = await checkActionAccess('leads', 'edit')
  if (!auth.authorized) return { results: [], seen: seenInFile, error: auth.error }
  if (!Array.isArray(rows) || rows.length === 0) return { results: [], seen: seenInFile }
  if (rows.length > 500 || seenInFile.length > IMPORT_MAX_ROWS) return { results: [], seen: seenInFile, error: 'Too many rows in one go.' }

  const db = createServiceClient()
  const lists = await getImportLists()
  const existing = await existingPhoneKeys(db)
  const seen = new Set(seenInFile)

  const { data: profile } = await db.from('profiles').select('name, email').eq('id', auth.user?.id).maybeSingle()
  const by = String(profile?.name || '').trim() || profile?.email || auth.user?.email || 'Unknown user'

  const results: ImportRowResult[] = []
  const toInsert: { row: number; lead: Record<string, unknown>; activity: Record<string, unknown> }[] = []
  const now = new Date().toISOString()

  for (const r of rows) {
    const checked = validateImportRow(r, lists)
    if ('errors' in checked) { results.push({ row: r.row, status: 'error', message: checked.errors.join('; ') }); continue }
    const v = checked.value
    if (existing.has(v.phoneKey)) { results.push({ row: v.row, status: 'skipped', message: 'Number already in the CRM' }); continue }
    if (seen.has(v.phoneKey)) { results.push({ row: v.row, status: 'skipped', message: 'Same number appears earlier in the file' }); continue }
    seen.add(v.phoneKey)
    const at = v.createdAt || now
    toInsert.push({
      row: v.row,
      lead: {
        name: v.name, phone: v.phone, email: v.email, source_page: v.source, status: v.status,
        project: v.project?.name || null, project_id: v.project?.id || null, enquiry_type: v.enquiryType,
        location: v.location, message: v.notes, created_at: at,
        enquiry_count: 1, last_enquiry_at: at, enquiry_projects: v.project ? [v.project.name] : [],
      },
      activity: {
        activity_type: 'manual_enquiry',
        description: `Imported from Excel by ${by}${v.project ? ` · Project: ${v.project.name}` : ''}${v.enquiryType ? ` · ${v.enquiryType}` : ''}${v.notes ? `\nNotes: ${v.notes}` : ''}`,
        metadata: { _imported: true, _project: v.project?.name || null, _project_id: v.project?.id || null, _enquiry_type: v.enquiryType, _notes: v.notes || null, _source: v.source, _by_id: auth.user?.id || null, _by_name: by },
        created_at: at,
      },
    })
  }

  if (toInsert.length) {
    const { data: inserted, error } = await db.from('leads').insert(toInsert.map((t) => t.lead)).select('id')
    if (error || !inserted || inserted.length !== toInsert.length) {
      toInsert.forEach((t) => results.push({ row: t.row, status: 'error', message: error?.message || 'Could not save' }))
    } else {
      await db.from('lead_activities').insert(toInsert.map((t, i) => ({ ...t.activity, lead_id: inserted[i].id })))
      toInsert.forEach((t) => results.push({ row: t.row, status: 'imported' }))
    }
  }

  revalidatePath('/crm/leads')
  results.sort((a, b) => a.row - b.row)
  return { results, seen: [...seen] }
}
