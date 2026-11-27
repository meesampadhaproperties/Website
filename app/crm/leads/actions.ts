'use server'

import { queueWelcomeEmail } from '@/lib/welcome-email-send'
import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { canonicalPhoneNumber } from '@/lib/phone-input'
import { revalidatePath } from 'next/cache'
import { getCachedAuthSession, checkActionAccess } from '@/lib/auth/permissions'
import { fetchHistoricalLeads, fetchFormQuestions } from '@/lib/meta'
import { ingestMetaLead } from '@/lib/meta-ingest'
import { getDayBoundsIst, formatIstDateTime } from '@/lib/timezone'
import { FOLLOW_UP_ACTIVITY, activityLabel, validateFollowUp, type FollowUpInput } from '@/lib/lead-status'
import { FALLBACK_SOURCE_KEYS, resolveLeadSource } from '@/lib/lead-source'
import { findLeadsByPhone, phoneMatchKey } from '@/lib/lead-phone'
import { loadEnquiryTypes } from '@/lib/enquiry-types'
import { WHATSAPP_ACTIVITY_TYPES } from '@/lib/whatsapp-activity'
import {
  ENQUIRY_ACTIVITY_TYPES, mergeEnquiryProjects, resolveEnquiryType, resolveProjectChoice, type ProjectOption,
} from '@/lib/lead-fields'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Source keys configured in Modules → Lead Sources (fallback when the table is empty/missing). */
async function getAllowedSourceKeys(db: ReturnType<typeof createServiceClient>): Promise<string[]> {
  const { data, error } = await db.from('lead_sources').select('key')
  const keys = (data || []).map((r: any) => String(r.key || '').trim()).filter(Boolean)
  return error || keys.length === 0 ? [...FALLBACK_SOURCE_KEYS] : keys
}

export async function getLeads(
  page: number = 1, 
  limit: number = 100,
  filters?: {
    searchQuery?: string,
    project?: string,
    sources?: string[],
    status?: string,
    statuses?: string[],
    startDate?: string,
    endDate?: string,
    sortField?: string,
    sortOrder?: 'asc' | 'desc'
  }
) {
  const from = (page - 1) * limit
  const to = from + limit - 1

  if (!isSupabaseConfigured()) {
    return { data: [], count: 0 };
  }

  const auth = await checkActionAccess('leads', 'view')
  if (!auth.authorized) return { data: [], count: 0, error: auth.error }

  const supabase = createServiceClient() // guarded by checkActionAccess/requireAdmin above; tables are server-only

  let query = supabase
    .from('leads')
    .select('*', { count: 'exact' })

  // Apply Search (Sanitized against PostgREST expression delimiters ,()" to prevent HTTP 400 crashes)
  if (filters?.searchQuery) {
    const cleanSearch = filters.searchQuery.replace(/[,()"]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanSearch) {
      const q = `%${cleanSearch}%`;
      query = query.or(`name.ilike.${q},email.ilike.${q},phone.ilike.${q},project.ilike.${q}`);
    }
  }

  // Apply Project
  if (filters?.project && filters.project !== 'all') {
    query = query.eq('project', filters.project);
  }

  // Apply Status
  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status.toLowerCase());
  } else if (filters?.statuses && filters.statuses.length > 0) {
    query = query.in('status', filters.statuses);
  }

  // Apply Sources
  if (filters?.sources && filters.sources.length > 0) {
    // If 'meta' is selected, it should match meta, facebook, instagram
    let sourceFilters: string[] = [];
    // Source keys are interpolated into a PostgREST filter string: keep plain identifiers only (no , ( ) . : % injection)
    filters.sources.map(s => String(s).replace(/[^a-z0-9_ -]/gi, '').trim()).filter(Boolean).forEach(src => {
      if (src === 'meta') {
        sourceFilters.push('meta', 'facebook', 'instagram');
      } else {
        sourceFilters.push(src);
      }
    });
    // Build an OR condition for source_page using ilike
    if (sourceFilters.length > 0) {
      const sourceOrQuery = sourceFilters.map(src => `source_page.ilike.%${src}%`).join(',');
      query = query.or(sourceOrQuery);
    }
  }

  // Apply Dates (Anchored explicitly to Indian Standard Time Asia/Kolkata +05:30)
  // Prevents UTC day-shift bugs on production Vercel servers where selecting e.g. 24th pulled in 25th early morning leads
  if (filters?.startDate) {
    const { startUtc } = getDayBoundsIst(filters.startDate);
    query = query.gte('created_at', startUtc);
  }
  if (filters?.endDate) {
    const { endUtc } = getDayBoundsIst(filters.endDate);
    query = query.lte('created_at', endUtc);
  }

  // Apply Sorting. Default: latest enquiry first, so a person who enquired again moves back to the top.
  const SORTABLE = ['last_enquiry_at', 'created_at', 'name', 'phone', 'source_page', 'status']
  const sortField = SORTABLE.includes(String(filters?.sortField)) ? String(filters?.sortField) : 'last_enquiry_at';
  const ascending = filters?.sortOrder === 'asc';
  query = query.order(sortField, { ascending }).order('created_at', { ascending: false });

  // Apply Pagination
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching leads:', error)
    return { data: [], count: 0 }
  }

  // Which of these leads have chatted with the WhatsApp bot (whatever their source): they get the "WhatsApp Activity" button
  const ids = (data || []).map((l: any) => l.id)
  let chatted = new Set<string>()
  if (ids.length > 0) {
    const { data: acts } = await supabase.from('lead_activities').select('lead_id')
      .in('lead_id', ids).in('activity_type', WHATSAPP_ACTIVITY_TYPES as unknown as string[]).limit(10000)
    chatted = new Set(((acts || []) as any[]).map((a) => a.lead_id))
  }

  return { data: (data || []).map((l: any) => ({ ...l, has_whatsapp: chatted.has(l.id) })), count: count || 0 }
}

/** Result of saving a lead. `duplicate` = this phone number already belongs to a lead (nothing was saved). */
export interface LeadSaveResult {
  success?: boolean
  error?: string
  data?: any[]
  duplicate?: any
  /** Set when the form was saved as a new enquiry on an existing lead */
  appendedTo?: string
}

/** Projects-page projects (kind 'workspace'): the list for the lead Project dropdown. */
async function getWorkspaceProjects(db: ReturnType<typeof createServiceClient>): Promise<ProjectOption[]> {
  const { data } = await db.from('projects').select('id, name').eq('kind', 'workspace').order('name', { ascending: true })
  return (data || []).map((p: any) => ({ id: String(p.id), name: String(p.name || '') }))
}

const formText = (formData: FormData, key: string) => String(formData.get(key) ?? '').trim()

interface EnquiryDetails {
  project: ProjectOption | null
  enquiryType: string | null
  message: string
  propertyInterest: string | null
  source: string | null
}

/** History entry for an enquiry typed in by staff (first enquiry or a repeat). Metadata keys are "_" so the Inbox doesn't show them as form answers. */
function manualEnquiryActivity(leadId: string, d: EnquiryDetails, user: any, by: string, first: boolean, at: string) {
  const parts = [
    `${first ? 'Lead added' : 'New enquiry added'} by ${by}`,
    d.project ? `Project: ${d.project.name}` : '',
    d.enquiryType || '',
  ].filter(Boolean)
  return {
    lead_id: leadId,
    activity_type: 'manual_enquiry',
    description: `${parts.join(' · ')}${d.message ? `\nNotes: ${d.message}` : ''}`,
    metadata: {
      _project: d.project?.name || null,
      _project_id: d.project?.id || null,
      _enquiry_type: d.enquiryType,
      _notes: d.message || null,
      _property_interest: d.propertyInterest,
      _source: d.source,
      _by_id: user?.id || null,
      _by_name: by,
    },
    created_at: at,
  }
}

export async function createLead(formData: FormData): Promise<LeadSaveResult> {
  const auth = await checkActionAccess('leads', 'edit')
  if (!auth.authorized) return { error: auth.error }

  const supabase = createServiceClient() // guarded by checkActionAccess/requireAdmin above; tables are server-only

  const name = formText(formData, 'name')
  const email = formText(formData, 'email')
  const phone = formText(formData, 'phone')
  if (!name) return { error: 'Name is required.' }
  // Phone is mandatory for a new lead (it identifies the person); email is optional
  if (!phoneMatchKey(phone)) return { error: 'Please enter a valid phone number (10 digits, with or without +91).' }

  // Source, project and enquiry type must come from their lists
  const source = resolveLeadSource(formText(formData, 'source_page'), null, await getAllowedSourceKeys(supabase))
  if ('error' in source) return { error: source.error }
  const projectChoice = resolveProjectChoice(formText(formData, 'project_id'), null, await getWorkspaceProjects(supabase))
  if ('error' in projectChoice) return { error: projectChoice.error }
  const enquiryChoice = resolveEnquiryType(formText(formData, 'enquiry_type'), null, await loadEnquiryTypes(supabase))
  if ('error' in enquiryChoice) return { error: enquiryChoice.error }

  const details: EnquiryDetails = {
    project: 'value' in projectChoice ? projectChoice.value : null,
    enquiryType: 'value' in enquiryChoice ? enquiryChoice.value : null,
    message: formText(formData, 'message'),
    propertyInterest: formText(formData, 'property_interest') || null,
    source: 'source' in source ? source.source : null,
  }
  const now = new Date().toISOString()
  const by = await actorName(supabase, auth.user)

  // One lead per person: the same phone number (any format) is never added twice
  const sameNumber = phone ? await findLeadsByPhone(supabase, phone, '*') : []
  if (sameNumber.length > 0) {
    const addTo = formText(formData, 'add_to_lead_id')
    const target = addTo ? sameNumber.find((l: any) => l.id === addTo) : null
    if (!target) return { duplicate: sameNumber[0] }

    // Saved as a new enquiry on that lead
    await supabase.from('lead_activities').insert(manualEnquiryActivity(target.id, details, auth.user, by, false, now))
    const { data, error } = await supabase.from('leads').update({
      enquiry_count: (Number(target.enquiry_count) || 1) + 1,
      last_enquiry_at: now,
      enquiry_projects: mergeEnquiryProjects(target.enquiry_projects, details.project?.name, true),
      ...(details.project ? { project: details.project.name, project_id: details.project.id } : {}),
      updated_at: now,
    }).eq('id', target.id).select()
    if (error) return { error: error.message }
    revalidatePath('/crm/leads')
    return { success: true, data: data || [], appendedTo: target.id }
  }

  const { data, error } = await supabase
    .from('leads')
    .insert([{
      name,
      email: email || null,
      phone: phone || null,
      message: details.message,
      property_interest: details.propertyInterest,
      source_page: details.source,
      status: formText(formData, 'status') || 'new',
      location: formText(formData, 'location') || null,
      project: details.project?.name || null,
      project_id: details.project?.id || null,
      enquiry_type: details.enquiryType,
      enquiry_count: 1,
      last_enquiry_at: now,
      enquiry_projects: details.project ? [details.project.name] : [],
    }])
    .select()

  if (error) {
    return { error: error.message }
  }
  if (data?.[0]?.id) {
    await supabase.from('lead_activities').insert(manualEnquiryActivity(data[0].id, details, auth.user, by, true, now))
  }
  queueWelcomeEmail(data?.[0]?.id)

  revalidatePath('/crm/leads')
  return { success: true, data: data || [] }
}

export async function updateLead(id: string, formData: FormData): Promise<LeadSaveResult> {
  const auth = await checkActionAccess('leads', 'edit')
  if (!auth.authorized) return { error: auth.error }
  if (!UUID_RE.test(String(id || ''))) return { error: 'Invalid lead.' }

  const supabase = createServiceClient() // guarded by checkActionAccess/requireAdmin above; tables are server-only

  const name = formText(formData, 'name')
  const email = formText(formData, 'email')
  const phone = formText(formData, 'phone')
  if (!name) return { error: 'Name is required.' }
  if (phone && !phoneMatchKey(phone)) return { error: 'Please enter a valid phone number (10 digits, with or without +91).' }

  const { data: current } = await supabase.from('leads')
    .select('source_page, form_id, project, project_id, enquiry_type, enquiry_projects').eq('id', id).maybeSingle()
  if (!current) return { error: 'Lead not found.' }

  // Source: from Modules → Lead Sources; locked for leads captured automatically (Meta)
  const source = resolveLeadSource(formText(formData, 'source_page'), current, await getAllowedSourceKeys(supabase))
  if ('error' in source) return { error: source.error }
  // Project / enquiry type: from their lists, or keep an older typed value unchanged
  const projectChoice = resolveProjectChoice(formText(formData, 'project_id'), current, await getWorkspaceProjects(supabase))
  if ('error' in projectChoice) return { error: projectChoice.error }
  const enquiryChoice = resolveEnquiryType(formText(formData, 'enquiry_type'), current.enquiry_type, await loadEnquiryTypes(supabase))
  if ('error' in enquiryChoice) return { error: enquiryChoice.error }

  const { data, error } = await supabase
    .from('leads')
    .update({
      name,
      email: email || null,
      phone: phone || null,
      message: formText(formData, 'message'),
      // Not on the form any more: never wiped by an edit
      ...(formData.has('property_interest') ? { property_interest: formText(formData, 'property_interest') || null } : {}),
      status: formText(formData, 'status') || 'new',
      location: formText(formData, 'location') || null,
      ...('source' in source ? { source_page: source.source } : {}),
      ...('value' in projectChoice ? {
        project: projectChoice.value?.name ?? null,
        project_id: projectChoice.value?.id ?? null,
        enquiry_projects: mergeEnquiryProjects(current.enquiry_projects, projectChoice.value?.name, true),
      } : {}),
      ...('value' in enquiryChoice ? { enquiry_type: enquiryChoice.value } : {}),
      // Not on the form any more (filled by website brochure downloads): never wiped by an edit
      ...(formData.has('downloaded_item') ? { downloaded_item: formText(formData, 'downloaded_item') || null } : {}),
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/crm/leads')
  return { success: true, data: data || [] }
}

export async function deleteLead(id: string) {
  const auth = await checkActionAccess('leads', 'edit')
  if (!auth.authorized) return { error: auth.error }
  // Deleting leads is Super Admin only (matches the UI)
  if (auth.role !== 'Super Admin') return { error: 'Only the Super Admin can delete leads.' }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  if (!isUuid) {
    return { error: 'Invalid lead ID format.' }
  }

  const supabase = createServiceClient() // guarded by checkActionAccess/requireAdmin above; tables are server-only

  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/crm/leads')
  return { success: true }
}

export async function deleteMultipleLeads(ids: string[]) {
  const auth = await checkActionAccess('leads', 'edit')
  if (!auth.authorized) return { error: auth.error }
  // Deleting leads is Super Admin only (matches the UI)
  if (auth.role !== 'Super Admin') return { error: 'Only the Super Admin can delete leads.' }

  if (!ids || ids.length === 0) return { success: true }

  const validIds = ids.filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
  if (validIds.length === 0) return { success: true }

  const supabase = createServiceClient() // guarded by checkActionAccess/requireAdmin above; tables are server-only

  const { error } = await supabase
    .from('leads')
    .delete()
    .in('id', validIds)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/crm/leads')
  return { success: true }
}

export async function updateLeadStatus(id: string, status: string): Promise<{
  success: boolean
  error?: string
  syncedCount?: number
  phone?: string | null
  name?: string | null
}> {
  const auth = await checkActionAccess('leads', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }

  const supabase = createServiceClient() // guarded by checkActionAccess/requireAdmin above; tables are server-only

  // 1. Fetch lead details to check phone number
  const { data: currentLead, error: fetchErr } = await supabase
    .from('leads')
    .select('id, name, phone, status')
    .eq('id', id)
    .single()

  if (fetchErr || !currentLead) {
    return { success: false, error: fetchErr?.message || 'Lead not found.' }
  }

  const canonicalPhone = canonicalPhoneNumber(currentLead.phone || '')
  let syncedCount = 1

  // 2. Read a bounded candidate set, allowing historical spaces and punctuation.
  // Only full canonical equality authorizes writes; a suffix is never an identity.
  if (canonicalPhone) {
    const candidateLimit = 500
    const candidatePattern = `%${canonicalPhone.replace(/\D/g, '').slice(-10).split('').join('%')}%`
    const { data: candidates, error: candidateError } = await supabase
      .from('leads')
      .select('id, phone')
      .ilike('phone', candidatePattern)
      .limit(candidateLimit + 1)

    if (candidateError) return { success: false, error: candidateError.message }
    if ((candidates?.length || 0) > candidateLimit) {
      return { success: false, error: 'Too many phone matches to synchronize safely. Please contact an administrator.' }
    }

    const matchingIds = [...new Set([
      id,
      ...(candidates || [])
        .filter(lead => canonicalPhoneNumber(lead.phone || '') === canonicalPhone)
        .map(lead => lead.id),
    ])]
    const { data: updatedRows, error: batchError } = await supabase
      .from('leads')
      .update({ status, updated_at: new Date().toISOString() })
      .in('id', matchingIds)
      .select('id')

    if (!batchError && updatedRows && updatedRows.length > 0) {
      syncedCount = updatedRows.length
    } else {
      // Fallback single update
      const { error: singleErr } = await supabase
        .from('leads')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (singleErr) return { success: false, error: singleErr.message }
    }
  } else {
    // Keep unrecognized or absent phone numbers scoped to the selected lead.
    const { error: singleErr } = await supabase
      .from('leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (singleErr) {
      return { success: false, error: singleErr.message }
    }
  }

  revalidatePath('/crm/leads')
  revalidatePath('/crm')
  return {
    success: true,
    syncedCount,
    phone: currentLead.phone,
    name: currentLead.name
  }
}

// ---------------------------------------------------------------------------
// Follow ups (REQ-93): separate from status. One pending follow up per lead
// (leads.follow_up_at + follow_up_note); every change is logged in lead_activities.
// ---------------------------------------------------------------------------

export type FollowUpState = { follow_up_at: string | null; follow_up_note: string | null }
type FollowUpActionResult = ({ success: true } & FollowUpState) | { success: false; error: string }

export interface FollowUpLogEntry {
  id: string
  type: string
  label: string
  /** When this entry was logged */
  at: string
  /** The follow-up time this entry is about */
  dueAt: string | null
  /** The earlier time, when a follow up was moved */
  previousDueAt: string | null
  note: string | null
  by: string | null
}

const istLabel = (iso?: string | null) => (iso ? `${formatIstDateTime(iso).date}, ${formatIstDateTime(iso).time}` : '')

/** Display name from the trusted profiles table (never user_metadata), else the login email. */
async function actorName(db: ReturnType<typeof createServiceClient>, user: any): Promise<string> {
  const { data } = await db.from('profiles').select('name, email').eq('id', user?.id).maybeSingle()
  return String(data?.name || '').trim() || data?.email || user?.email || 'Unknown user'
}

async function logFollowUp(
  db: ReturnType<typeof createServiceClient>,
  leadId: string,
  type: string,
  description: string,
  metadata: Record<string, unknown>
) {
  const { error } = await db.from('lead_activities').insert({
    lead_id: leadId,
    activity_type: type,
    description,
    metadata,
    created_at: new Date().toISOString(),
  })
  if (error) console.error('Follow-up history log failed:', error.message)
}

function revalidateFollowUpViews() {
  revalidatePath('/crm/leads')
  revalidatePath('/crm/inbox')
  revalidatePath('/crm')
}

/** Schedule a follow up, or change the pending one. Times in the past are rejected. */
export async function scheduleFollowUp(leadId: string, input: FollowUpInput): Promise<FollowUpActionResult> {
  const auth = await checkActionAccess('leads', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(String(leadId || ''))) return { success: false, error: 'Invalid lead.' }

  const valid = validateFollowUp(input)
  if ('error' in valid) return { success: false, error: valid.error }

  const db = createServiceClient() // guarded by checkActionAccess above; tables are server-only
  const { data: lead, error: fetchErr } = await db.from('leads').select('id, follow_up_at, follow_up_note').eq('id', leadId).maybeSingle()
  if (fetchErr || !lead) return { success: false, error: fetchErr?.message || 'Lead not found.' }

  const { error: updErr } = await db.from('leads')
    .update({ follow_up_at: valid.iso, follow_up_note: valid.note, updated_at: new Date().toISOString() })
    .eq('id', leadId)
  if (updErr) return { success: false, error: updErr.message }

  const by = await actorName(db, auth.user)
  const changed = Boolean(lead.follow_up_at)
  await logFollowUp(db, leadId,
    changed ? FOLLOW_UP_ACTIVITY.changed : FOLLOW_UP_ACTIVITY.scheduled,
    changed
      ? `Follow up moved to ${istLabel(valid.iso)} (was ${istLabel(lead.follow_up_at)}): ${valid.note} · by ${by}`
      : `Follow up for ${istLabel(valid.iso)}: ${valid.note} · by ${by}`,
    {
      follow_up_at: valid.iso, note: valid.note, by_id: auth.user?.id || null, by_name: by,
      ...(changed ? { previous_at: lead.follow_up_at, previous_note: lead.follow_up_note } : {}),
    })

  revalidateFollowUpViews()
  return { success: true, follow_up_at: valid.iso, follow_up_note: valid.note }
}

/** Close the pending follow up: 'done' (it happened) or 'removed' (cancelled). */
async function closeFollowUp(leadId: string, outcome: 'done' | 'removed'): Promise<FollowUpActionResult> {
  const auth = await checkActionAccess('leads', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(String(leadId || ''))) return { success: false, error: 'Invalid lead.' }

  const db = createServiceClient() // guarded by checkActionAccess above; tables are server-only
  const { data: lead, error: fetchErr } = await db.from('leads').select('id, follow_up_at, follow_up_note').eq('id', leadId).maybeSingle()
  if (fetchErr || !lead) return { success: false, error: fetchErr?.message || 'Lead not found.' }
  if (!lead.follow_up_at) return { success: false, error: 'This lead has no pending follow up.' }

  const { error: updErr } = await db.from('leads')
    .update({ follow_up_at: null, follow_up_note: null, updated_at: new Date().toISOString() })
    .eq('id', leadId)
  if (updErr) return { success: false, error: updErr.message }

  const by = await actorName(db, auth.user)
  await logFollowUp(db, leadId,
    outcome === 'done' ? FOLLOW_UP_ACTIVITY.done : FOLLOW_UP_ACTIVITY.removed,
    `${outcome === 'done' ? 'Follow up done' : 'Follow up removed'} (was due ${istLabel(lead.follow_up_at)})${lead.follow_up_note ? `: ${lead.follow_up_note}` : ''} · by ${by}`,
    { follow_up_at: lead.follow_up_at, note: lead.follow_up_note, by_id: auth.user?.id || null, by_name: by })

  revalidateFollowUpViews()
  return { success: true, follow_up_at: null, follow_up_note: null }
}

export async function completeFollowUp(leadId: string) {
  return closeFollowUp(leadId, 'done')
}

export async function removeFollowUp(leadId: string) {
  return closeFollowUp(leadId, 'removed')
}

/** Follow-up history for one lead, newest first. Readable with Leads or Inbox access. */
export async function getFollowUpHistory(leadId: string): Promise<{ data: FollowUpLogEntry[]; error?: string }> {
  let auth = await checkActionAccess('leads', 'view')
  if (!auth.authorized) auth = await checkActionAccess('inbox', 'view')
  if (!auth.authorized) return { data: [], error: auth.error }
  if (!UUID_RE.test(String(leadId || ''))) return { data: [], error: 'Invalid lead.' }

  const db = createServiceClient() // guarded by checkActionAccess above; tables are server-only
  const { data, error } = await db.from('lead_activities')
    .select('id, activity_type, description, metadata, created_at')
    .eq('lead_id', leadId)
    .in('activity_type', Object.values(FOLLOW_UP_ACTIVITY))
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return { data: [], error: 'Could not load the follow-up history.' }

  return {
    data: (data || []).map((a: any) => {
      const m = a.metadata && typeof a.metadata === 'object' ? a.metadata : {}
      return {
        id: String(a.id),
        type: a.activity_type,
        label: activityLabel(a.activity_type),
        at: a.created_at,
        dueAt: m.follow_up_at || null,
        previousDueAt: m.previous_at || null,
        note: m.note || null,
        by: m.by_name || null,
      }
    }),
  }
}

export async function getLeadActivities(leadId: string) {
  const auth = await checkActionAccess('leads', 'view')
  if (!auth.authorized) return { data: [], error: auth.error }

  const supabase = createServiceClient() // guarded by checkActionAccess/requireAdmin above; tables are server-only
  const { data, error } = await supabase
    .from('lead_activities')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  if (error) {
    console.error('Error fetching lead activities:', error)
    return { data: [], error: 'Failed to fetch activities' }
  }

  return { data, error: null }
}

// Meta Forms Server Actions
export async function getProjectsList() {
  const auth = await checkActionAccess('leads', 'view')
  if (!auth.authorized) return { data: [], error: auth.error }

  const supabase = createServiceClient() // guarded by checkActionAccess/requireAdmin above; tables are server-only
  // kind: 'workspace' = a property (Projects page, used as the lead's project); 'meta' = a Meta client
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, client_name, kind')
    .order('name', { ascending: true })

  if (error) {
    return { data: [], error: error.message }
  }
  return { data: data || [], error: null }
}

export async function getMetaForms() {
  const auth = await checkActionAccess('leads', 'view')
  if (!auth.authorized) return { data: [], error: auth.error }

  const supabase = createServiceClient() // guarded by checkActionAccess/requireAdmin above; tables are server-only
  const { data, error } = await supabase
    .from('meta_forms')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching meta forms:', error)
    return { data: [], error: error.message }
  }

  return { data, error: null }
}

export async function addMetaForm(
  form_id: string,
  name: string = '',
  project_id: string = '',
  project_name: string = ''
) {
  const auth = await checkActionAccess('leads', 'edit')
  if (!auth.authorized) return { error: auth.error }

  const supabase = createServiceClient() // guarded by checkActionAccess/requireAdmin above; tables are server-only
  const { data, error } = await supabase
    .from('meta_forms')
    .insert([{
      form_id,
      name,
      project_id: project_id || null,
      project_name: project_name || '',
      is_active: true
    }])
    .select()

  if (error) {
    return { error: error.message }
  }
  return { success: true, data }
}

export async function toggleMetaFormStatus(id: string, is_active: boolean) {
  const auth = await checkActionAccess('leads', 'edit')
  if (!auth.authorized) return { error: auth.error }

  const supabase = createServiceClient() // guarded by checkActionAccess/requireAdmin above; tables are server-only
  const { error } = await supabase
    .from('meta_forms')
    .update({ is_active })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }
  return { success: true }
}

/** Link a Meta form to the project (Projects page) its leads are about. null = unlink. */
export async function setLeadFormProject(formRowId: string, projectId: string | null): Promise<{ success: boolean; error?: string }> {
  const auth = await checkActionAccess('leads', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(String(formRowId || '')) || (projectId && !UUID_RE.test(projectId))) return { success: false, error: 'Invalid form or project.' }

  const supabase = createServiceClient() // guarded by checkActionAccess above; tables are server-only
  if (projectId) {
    const { data: proj } = await supabase.from('projects').select('id').eq('id', projectId).eq('kind', 'workspace').maybeSingle()
    if (!proj) return { success: false, error: 'Project not found on the Projects page.' }
  }
  const { error } = await supabase.from('meta_forms').update({ lead_project_id: projectId || null }).eq('id', formRowId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/crm/leads')
  revalidatePath('/crm/meta')
  return { success: true }
}

export interface EnquiryEntry {
  id: string
  at: string
  /** meta = Meta form, manual = typed in by staff, lead = first enquiry recorded before history existed */
  kind: 'meta' | 'manual' | 'lead'
  project: string | null
  formName: string | null
  formId: string | null
  enquiryType: string | null
  message: string | null
  by: string | null
  /** Where this enquiry came from: "Meta", "YouTube", "Excel import"… */
  source: string
  /** Meta form answers given THIS time */
  answers: { question: string; answer: string }[]
  /** Contact details used this time (Meta forms), when known */
  email: string | null
  phone: string | null
  imported: boolean
}

/**
 * Everything this person enquired about, newest first. Identified by PHONE NUMBER, so older
 * duplicate leads with the same number (any format) are included. Readable with Leads or Inbox access.
 */
export async function getLeadEnquiries(leadId: string): Promise<{ data: EnquiryEntry[]; phone?: string | null; email?: string | null; error?: string }> {
  let auth = await checkActionAccess('leads', 'view')
  if (!auth.authorized) auth = await checkActionAccess('inbox', 'view')
  if (!auth.authorized) return { data: [], error: auth.error }
  if (!UUID_RE.test(String(leadId || ''))) return { data: [], error: 'Invalid lead.' }

  const db = createServiceClient() // guarded by checkActionAccess above; tables are server-only
  const cols = 'id, phone, email, project, created_at, form_id, enquiry_count, message, enquiry_type, source_page'
  const { data: lead } = await db.from('leads').select(cols).eq('id', leadId).maybeSingle()
  if (!lead) return { data: [], error: 'Lead not found.' }

  const samePerson = lead.phone ? await findLeadsByPhone(db, lead.phone, cols) : []
  const people: any[] = samePerson.some((l: any) => l.id === lead.id) ? samePerson : [lead, ...samePerson]

  const { data: acts, error } = await db.from('lead_activities')
    .select('id, lead_id, activity_type, metadata, created_at')
    .in('lead_id', people.map((l) => l.id))
    .in('activity_type', [...ENQUIRY_ACTIVITY_TYPES])
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return { data: [], error: 'Could not load the enquiry history.' }

  const formIds = [...new Set((acts || []).map((a: any) => a.metadata?._form_id).concat(people.map((l) => l.form_id)).filter(Boolean))] as string[]
  const [{ data: forms }, { data: sourceRows }] = await Promise.all([
    formIds.length ? db.from('meta_forms').select('form_id, name, form_name').in('form_id', formIds) : Promise.resolve({ data: [] as any[] }),
    db.from('lead_sources').select('key, name'),
  ])
  const sourceName = (v?: string | null) => {
    const raw = String(v || '').trim()
    if (!raw) return 'Added manually'
    if (/^meta[_:]/i.test(raw)) return 'Meta'
    return (sourceRows || []).find((s: any) => String(s.key).toLowerCase() === raw.toLowerCase())?.name || raw
  }
  const answersOf = (m: any) => (Array.isArray(m?._answers) ? m._answers : [])
    .map((a: any) => ({ question: String(a?.question || a?.key || '').trim(), answer: Array.isArray(a?.answer) ? a.answer.join(', ') : String(a?.answer ?? '').trim() }))
    .filter((a: any) => a.question && a.answer)
  const formName = (fid?: string | null) => {
    const f = (forms || []).find((x: any) => x.form_id === fid)
    return f ? (f.name || f.form_name || null) : null
  }

  const entries: EnquiryEntry[] = (acts || []).map((a: any) => {
    const m = a.metadata && typeof a.metadata === 'object' ? a.metadata : {}
    const meta = a.activity_type === 'meta_form_submission'
    return {
      id: String(a.id),
      at: a.created_at,
      kind: meta ? 'meta' : 'manual',
      project: m._project || null,
      formName: meta ? formName(m._form_id) : null,
      formId: meta ? (m._form_id || null) : null,
      enquiryType: m._enquiry_type || null,
      message: m._notes || m._message || null,
      by: m._by_name || null,
      source: meta ? 'Meta' : m._imported ? 'Excel import' : sourceName(m._source),
      answers: meta ? answersOf(m) : [],
      email: meta ? (String(m.email || '').trim() || null) : null,
      phone: meta ? (String(m.phone_number || m.phone || '').trim() || null) : null,
      imported: !!m._imported,
    }
  })

  // Leads whose first enquiry was saved before enquiry history existed (e.g. typed in earlier)
  for (const l of people) {
    const logged = (acts || []).filter((a: any) => a.lead_id === l.id).length
    if ((Number(l.enquiry_count) || 1) > logged) {
      entries.push({
        id: `lead-${l.id}`, at: l.created_at, kind: 'lead', project: l.project || null,
        formName: formName(l.form_id), formId: l.form_id || null, enquiryType: l.enquiry_type || null,
        message: l.message || null, by: null,
        source: sourceName(l.source_page), answers: [], email: null, phone: null, imported: false,
      })
    }
  }

  entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return { data: entries, phone: lead.phone, email: (lead as any).email || null }
}

export async function deleteMetaForm(id: string) {
  const auth = await checkActionAccess('leads', 'edit')
  if (!auth.authorized) return { error: auth.error }

  const supabase = createServiceClient() // guarded by checkActionAccess/requireAdmin above; tables are server-only
  const { error } = await supabase
    .from('meta_forms')
    .delete()
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }
  return { success: true }
}

export async function updateMetaFormName(id: string, name: string) {
  const auth = await checkActionAccess('leads', 'edit')
  if (!auth.authorized) return { error: auth.error }

  const supabase = createServiceClient() // guarded by checkActionAccess/requireAdmin above; tables are server-only
  const { error } = await supabase
    .from('meta_forms')
    .update({ name })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }
  return { success: true }
}

export async function reconcileMetaLeadsAction(): Promise<{
  success: boolean;
  totalChecked?: number;
  totalRecovered?: number;
  error?: string;
  message?: string;
}> {
  try {
    const session = await getCachedAuthSession();
    if (!session.user || session.role !== 'Super Admin') {
      return { success: false, error: 'Forbidden: Only Super Admin can trigger manual lead reconciliation.' };
    }

    const supabaseAdmin = createServiceClient();

    // 1. Fetch all connected Meta integrations across all projects
    const { data: integrations, error: intErr } = await supabaseAdmin
      .from('project_integrations')
      .select('project_id, page_name, access_token, projects(name)')
      .eq('is_connected', true);

    if (intErr || !integrations || integrations.length === 0) {
      return {
        success: true,
        totalChecked: 0,
        totalRecovered: 0,
        message: 'No active project integrations found to reconcile.'
      };
    }

    let totalChecked = 0;
    let totalRecovered = 0;

    // 2. Iterate through all projects in a single sweep
    for (const integration of integrations) {
      if (!integration.access_token) continue;

      const projectId = integration.project_id;
      const projectName = (integration.projects as any)?.name || integration.page_name || 'Project';

      // Fetch active forms for this project
      const { data: forms } = await supabaseAdmin
        .from('meta_forms')
        .select('form_id')
        .eq('project_id', projectId);

      const formIds = (forms || []).map((f: any) => f.form_id);
      if (formIds.length === 0) continue;

      for (const fid of formIds) {
        // Check rolling 3-day window (same ingestion as webhook/cron: full answers are saved)
        const questions = await fetchFormQuestions(fid, integration.access_token);
        const pullRes = await fetchHistoricalLeads(fid, integration.access_token, 100, 3, questions);
        if (!pullRes.success || !pullRes.leads) continue;

        totalChecked += pullRes.leads.length;

        for (const lead of pullRes.leads) {
          const result = await ingestMetaLead(supabaseAdmin, {
            lead, formId: fid, projectId, projectName, origin: 'reconciled', questions,
            note: 'recovered by manual reconcile',
          });
          if (result.outcome === 'inserted' || result.outcome === 'appended') totalRecovered++;
        }
      }
    }

    revalidatePath('/crm/leads');
    revalidatePath('/crm');

    return {
      success: true,
      totalChecked,
      totalRecovered,
      message: totalRecovered > 0
        ? `Reconciliation complete: Recovered ${totalRecovered} missed leads (scanned ${totalChecked} total from Meta).`
        : `All leads up to date: Scanned ${totalChecked} leads from Meta with zero drops.`
    };
  } catch (err: any) {
    console.error('Error executing manual lead reconciliation:', err);
    return { success: false, error: err.message || 'Failed to reconcile leads from Meta.' };
  }
}
