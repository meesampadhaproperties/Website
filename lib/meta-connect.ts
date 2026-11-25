import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchPageLeadForms, subscribePageToLeadgenWebhook } from '@/lib/meta'

/**
 * INTERNAL (not a server action): persists a Meta Page connection for a client invite.
 * Only call with an access token obtained SERVER-SIDE (OAuth code exchange or stored pending pages).
 * Never expose this to the browser: it would let a caller attach any page/token to a project.
 */
export async function saveMetaConnection(params: {
  token: string
  pageId: string
  pageName: string
  accessToken: string
}) {
  try {
    const supabaseAdmin = createServiceClient()

    // 1. Verify token
    const { data: record, error: tokenErr } = await supabaseAdmin
      .from('client_connect_tokens')
      .select('id, project_id, projects(name)')
      .eq('token', params.token)
      .is('used_at', null)
      .single()

    if (tokenErr || !record) {
      return { success: false, error: 'Invalid or already consumed invitation token.' }
    }

    const projectId = record.project_id
    const projectName = (record.projects as any)?.name || params.pageName

    // 2. Subscribe page to leadgen webhook
    let webhookSubscribed = false
    try {
      const subRes = await subscribePageToLeadgenWebhook(params.pageId, params.accessToken)
      webhookSubscribed = subRes.success
    } catch (subErr) {
      console.warn('Webhook auto-subscription warning:', subErr)
    }

    // 3. Upsert into project_integrations
    const { error: intErr } = await supabaseAdmin
      .from('project_integrations')
      .upsert({
        project_id: projectId,
        provider: 'meta',
        page_id: params.pageId,
        page_name: params.pageName,
        access_token: params.accessToken,
        token_type: 'page',
        is_connected: true,
        webhook_subscribed: webhookSubscribed,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'project_id' })

    if (intErr) {
      return { success: false, error: `Failed to save integration: ${intErr.message}` }
    }

    // 4. Mark token as consumed
    await supabaseAdmin
      .from('client_connect_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', record.id)

    // 5. Auto-discover forms from Meta
    try {
      const formsRes = await fetchPageLeadForms(params.pageId, params.accessToken)
      if (formsRes.success && formsRes.forms.length > 0) {
        const payload = formsRes.forms.map(f => ({
          project_id: projectId,
          project_name: projectName,
          form_id: f.id,
          name: f.name,
          form_name: f.name,
          is_active: f.status === 'ACTIVE',
          status: f.status,
          leads_count: f.leads_count || 0
        }))

        await supabaseAdmin
          .from('meta_forms')
          .upsert(payload, { onConflict: 'form_id' })
      }
    } catch (fErr) {
      console.warn('Auto form discovery warning:', fErr)
    }

    revalidatePath('/crm/meta')
    revalidatePath('/crm/leads')

    return {
      success: true,
      pageName: params.pageName,
      webhookSubscribed
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to complete connection' }
  }
}

const PENDING_TTL_MS = 15 * 60 * 1000

export interface PendingMetaPage { id: string; name: string; followers?: number; category?: string; access_token: string }

/** Stores discovered pages (WITH tokens) server-side on the invite row for 15 minutes. */
export async function storePendingMetaPages(inviteToken: string, pages: PendingMetaPage[]): Promise<boolean> {
  const db = createServiceClient()
  const { data, error } = await db.from('client_connect_tokens')
    .update({ pending_pages: pages, pending_pages_expires_at: new Date(Date.now() + PENDING_TTL_MS).toISOString() })
    .eq('token', inviteToken).is('used_at', null).select('id')
  return !error && (data || []).length > 0
}

/** Reads pending pages for a still-valid, unused invite (server-side only). */
export async function readPendingMetaPages(inviteToken: string): Promise<PendingMetaPage[]> {
  const db = createServiceClient()
  const { data } = await db.from('client_connect_tokens')
    .select('pending_pages, pending_pages_expires_at, used_at, expires_at')
    .eq('token', inviteToken).maybeSingle()
  if (!data || data.used_at || !data.pending_pages) return []
  if (new Date(data.expires_at).getTime() < Date.now()) return []
  if (!data.pending_pages_expires_at || new Date(data.pending_pages_expires_at).getTime() < Date.now()) return []
  return Array.isArray(data.pending_pages) ? data.pending_pages : []
}
