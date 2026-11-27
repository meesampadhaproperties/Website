import { queueWelcomeEmail } from '@/lib/welcome-email-send'
import { buildLabeledAnswers, formatMetaCustomFields, type MetaFormQuestion, type ParsedMetaLead } from '@/lib/meta'
import { findLeadsByPhone } from '@/lib/lead-phone'
import { mergeEnquiryProjects } from '@/lib/lead-fields'

/**
 * Single source of truth for saving a Meta lead, used by the webhook, historical sync,
 * daily reconciliation cron and manual reconcile button so every path stores identical data.
 *
 * Rules:
 * 1. Same Meta lead id already stored → 'duplicate' (optionally refresh its answers).
 * 2. Same person already exists (phone number in any format: +91 / 0 / spaces) → APPEND the
 *    new submission to that lead's history and count it as a repeat enquiry ('appended').
 * 3. Otherwise → insert a new lead + its form-submission activity ('inserted').
 * 0. Form switched OFF in the CRM (meta_forms.is_active = false) → nothing is saved ('skipped').
 *    Enforced HERE so every path (webhook, cron, manual reconcile, historical sync) obeys it.
 *
 * The lead's PROJECT is the property the form is linked to (meta_forms.lead_project_id,
 * a Projects-page project). Unlinked forms → no project ("Project not set" in the UI).
 */

export type IngestOrigin = 'lead' | 'historical' | 'reconciled'
export type IngestOutcome = 'inserted' | 'appended' | 'duplicate' | 'refreshed' | 'skipped' | 'failed'

export interface IngestParams {
  lead: ParsedMetaLead
  formId: string
  /** The Meta client (Meta page) the form came through. Not the lead's project: see above. */
  projectId?: string | null
  projectName: string
  origin: IngestOrigin
  questions?: MetaFormQuestion[]
  /** Historical sync: re-write answers of an already-stored lead (fixes older, less accurate records) */
  refreshExisting?: boolean
  /** Human-readable origin for the activity log */
  note?: string
}

/** What gets stored in lead_activities.metadata: Meta's raw answers + labelled answers + ids */
export function buildSubmissionMetadata(lead: ParsedMetaLead, formId: string, questions?: MetaFormQuestion[]) {
  return {
    ...(lead.rawFieldData || {}),
    _answers: buildLabeledAnswers(lead.rawFieldData || {}, questions),
    _leadgen_id: lead.leadId,
    _form_id: formId,
  }
}

export async function ingestMetaLead(db: any, p: IngestParams): Promise<{ outcome: IngestOutcome; leadId?: string; error?: string }> {
  const { lead, formId, questions } = p
  const message = formatMetaCustomFields(lead.rawFieldData || {}, questions) || (lead.city ? `City: ${lead.city}` : 'Meta Lead Form Submission')
  const submittedAt = lead.createdTime ? new Date(lead.createdTime).toISOString() : new Date().toISOString()

  // 0. Form switched off in the CRM → not accepting leads. Also read the project the form is linked to.
  let formProject: { id: string; name: string } | null = null
  if (formId) {
    const { data: forms } = await db.from('meta_forms').select('is_active, lead_project_id').eq('form_id', formId)
      .order('created_at', { ascending: true }).limit(1)
    const form = forms?.[0]
    if (form && form.is_active === false) return { outcome: 'skipped' }
    if (form?.lead_project_id) {
      const { data: proj } = await db.from('projects').select('id, name').eq('id', form.lead_project_id).eq('kind', 'workspace').maybeSingle()
      if (proj) formProject = { id: proj.id, name: proj.name }
    }
  }
  const metadata = {
    ...buildSubmissionMetadata(lead, formId, questions),
    _project: formProject?.name || null,
    _project_id: formProject?.id || null,
  }

  // 1. Exact duplicate: this Meta lead id is already stored (as a lead or as an appended submission)
  if (lead.leadId) {
    const { data: byLead } = await db.from('leads').select('id').ilike('source_page', `%${lead.leadId}%`).limit(1)
    const { data: byActivity } = await db.from('lead_activities').select('id, lead_id').eq('metadata->>_leadgen_id', lead.leadId).limit(1)
    const existingLeadId = byLead?.[0]?.id || byActivity?.[0]?.lead_id
    if (existingLeadId) {
      if (!p.refreshExisting) return { outcome: 'duplicate', leadId: existingLeadId }
      const activityId = byActivity?.[0]?.id
      if (activityId) {
        await db.from('lead_activities').update({ metadata }).eq('id', activityId)
      } else {
        const { data: firstAct } = await db.from('lead_activities').select('id')
          .eq('lead_id', existingLeadId).eq('activity_type', 'meta_form_submission').order('created_at', { ascending: true }).limit(1)
        if (firstAct?.[0]?.id) await db.from('lead_activities').update({ metadata }).eq('id', firstAct[0].id)
        else await db.from('lead_activities').insert({ lead_id: existingLeadId, activity_type: 'meta_form_submission', description: `Captured from Meta Form ${formId}`, metadata, created_at: submittedAt })
      }
      if (byLead?.[0]?.id) await db.from('leads').update({ message }).eq('id', existingLeadId)
      return { outcome: 'refreshed', leadId: existingLeadId }
    }
  }

  // 2. Repeat enquiry (same person = same phone number in any format): keep one lead, add to its history
  const phone = (lead.phoneNumber || '').trim()
  const existing = (await findLeadsByPhone(db, phone,
    'id, phone, form_id, enquiry_count, last_enquiry_at, enquiry_projects'))[0]
  if (existing) {
    const { error } = await db.from('lead_activities').insert({
      lead_id: existing.id,
      activity_type: 'meta_form_submission',
      description: `Enquired again via Meta form (Form ID: ${formId}, Lead ID: ${lead.leadId})${formProject ? ` · Project: ${formProject.name}` : ''}${p.note ? ` · ${p.note}` : ''}`,
      metadata,
      created_at: submittedAt,
    })
    if (error) return { outcome: 'failed', error: error.message }
    // Historical syncs can deliver an older submission after a newer one: only the latest sets the project/time
    const newest = !existing.last_enquiry_at || new Date(submittedAt).getTime() >= new Date(existing.last_enquiry_at).getTime()
    await db.from('leads').update({
      updated_at: new Date().toISOString(),
      enquiry_count: (Number(existing.enquiry_count) || 1) + 1,
      enquiry_projects: mergeEnquiryProjects(existing.enquiry_projects, formProject?.name, newest),
      ...(newest ? { last_enquiry_at: submittedAt } : {}),
      ...(newest && formProject ? { project: formProject.name, project_id: formProject.id } : {}),
      // A manually added person who now submits a Meta form gets the form id, so they show in the Inbox
      ...(existing.form_id ? {} : { form_id: formId || null }),
    }).eq('id', existing.id)
    return { outcome: 'appended', leadId: existing.id }
  }

  // 3. New lead
  const { data: inserted, error: insErr } = await db.from('leads').insert({
    name: lead.fullName,
    phone: phone || null,
    email: lead.email || null,
    project: formProject?.name || null,
    project_id: formProject?.id || null,
    enquiry_count: 1,
    last_enquiry_at: submittedAt,
    enquiry_projects: formProject ? [formProject.name] : [],
    source_page: `meta_${p.origin}_${lead.leadId}`,
    form_id: formId,
    status: 'new',
    location: lead.city || null,
    message,
    created_at: submittedAt,
  }).select('id').single()
  if (insErr || !inserted) return { outcome: 'failed', error: insErr?.message || 'Insert failed' }

  await db.from('lead_activities').insert({
    lead_id: inserted.id,
    activity_type: 'meta_form_submission',
    description: `Captured from Meta Lead Ad (Form ID: ${formId}, Lead ID: ${lead.leadId})${p.note ? ` · ${p.note}` : ''}`,
    metadata,
    created_at: submittedAt,
  })
  // Welcome email only for fresh leads: syncing old leads (historical sync, reconcile) must never email people who enquired weeks ago
  if (Date.now() - new Date(submittedAt).getTime() < 24 * 60 * 60 * 1000) queueWelcomeEmail(inserted.id)
  return { outcome: 'inserted', leadId: inserted.id }
}
