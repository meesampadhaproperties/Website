'use server'

import { getRequestSiteUrl } from '@/lib/site-url'

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { checkActionAccess } from '@/lib/auth/permissions'
import { removeProjectDocumentFiles } from '@/lib/project-documents'
import {
  debugMetaAccessToken,
  checkPageLeadgenSubscription,
  fetchPageLeadForms,
  fetchHistoricalLeads,
  subscribePageToLeadgenWebhook,
  fetchFormQuestions
} from '@/lib/meta'
import { ingestMetaLead } from '@/lib/meta-ingest'
import { saveMetaConnection, readPendingMetaPages, storePendingMetaPages } from '@/lib/meta-connect'

export interface ProjectMetaIntegration {
  id?: string
  project_id: string
  provider: string
  page_id?: string
  page_name?: string
  is_connected: boolean
  webhook_subscribed: boolean
  last_synced_at?: string
  token_status?: 'valid' | 'revoked' | 'expired' | 'missing'
  error_message?: string
}

export interface ProjectRecord {
  id: string
  name: string
  client_name: string
  location?: string
  email?: string
  phone_numbers: string[]
  created_at?: string
  updated_at?: string
  active_forms_count?: number
  inactive_forms_count?: number
  total_forms_count?: number
  meta_integration?: ProjectMetaIntegration
  invite_pending?: boolean
}

/**
 * Authorization for project mutations: requires EDIT access on the 'meta' module
 * (previously only checked that a session existed, letting any signed-in user mutate projects).
 */
async function requireAdmin(required: 'view' | 'edit' = 'edit') {
  const auth = await checkActionAccess('meta', required)
  if (!auth.authorized) {
    throw new Error(auth.error)
  }
  return auth.user
}

export async function getProjectsWithFormCounts(): Promise<{ data: ProjectRecord[], error: string | null }> {
  try {
    await requireAdmin('view')
    const supabase = createServiceClient() // guarded by checkActionAccess/requireAdmin above; tables are server-only

    // Fetch projects, forms, integrations, and pending tokens concurrently with Promise.all
    const [
      { data: projects, error: projectsError },
      { data: forms, error: formsError },
      { data: integrations },
      { data: pendingTokens }
    ] = await Promise.all([
      supabase.from('projects').select('*').eq('kind', 'meta').order('created_at', { ascending: false }),
      supabase.from('meta_forms').select('id, project_id, is_active'),
      supabase.from('project_integrations').select('id, project_id, provider, page_id, page_name, is_connected, webhook_subscribed, last_synced_at'),
      supabase.from('client_connect_tokens').select('project_id').is('used_at', null).gt('expires_at', new Date().toISOString())
    ])

    if (projectsError) {
      console.warn('Projects table read notice:', projectsError.message)
      return { data: [], error: null }
    }

    const formsMap = new Map<string, { active: number, inactive: number }>()

    if (!formsError && forms) {
      forms.forEach(f => {
        if (!f.project_id) return
        const entry = formsMap.get(f.project_id) || { active: 0, inactive: 0 }
        if (f.is_active !== false) {
          entry.active += 1
        } else {
          entry.inactive += 1
        }
        formsMap.set(f.project_id, entry)
      })
    }

    const integrationsMap = new Map<string, ProjectMetaIntegration>()
    if (integrations) {
      integrations.forEach((item: any) => {
        integrationsMap.set(item.project_id, item)
      })
    }

    const pendingSet = new Set((pendingTokens || []).map((t: any) => t.project_id))

    const enriched = (projects || []).map((p: any) => {
      const counts = formsMap.get(p.id) || { active: 0, inactive: 0 }
      const meta = integrationsMap.get(p.id)
      return {
        ...p,
        phone_numbers: Array.isArray(p.phone_numbers) ? p.phone_numbers : [],
        active_forms_count: counts.active,
        inactive_forms_count: counts.inactive,
        total_forms_count: counts.active + counts.inactive,
        meta_integration: meta || undefined,
        invite_pending: pendingSet.has(p.id) && !meta?.is_connected
      }
    })

    return { data: enriched, error: null }
  } catch (err: any) {
    return { data: [], error: err.message || 'Failed to fetch projects' }
  }
}

export async function createProject(formData: {
  name: string
  client_name: string
  location?: string
  email?: string
  phone_numbers: string[]
}) {
  try {
    await requireAdmin()
    const supabase = createServiceClient() // guarded by checkActionAccess/requireAdmin above; tables are server-only

    const name = formData.name?.trim()
    const client_name = formData.client_name?.trim()
    const location = formData.location?.trim() || ''
    const email = formData.email?.trim() || ''
    
    const phone_numbers = (formData.phone_numbers || [])
      .map(p => p.replace(/\D/g, '').slice(0, 10))
      .filter(Boolean)
      .slice(0, 5)

    if (!name) return { error: 'Project name is required' }
    if (!client_name) return { error: 'Client name is required' }

    for (const phone of phone_numbers) {
      if (phone.length !== 10) {
        return { error: `Contact number "${phone}" must be exactly 10 digits` }
      }
    }

    const { data, error } = await supabase
      .from('projects')
      .insert([{
        kind: 'meta',
        name,
        client_name,
        location,
        email,
        phone_numbers,
        updated_at: new Date().toISOString()
      }])
      .select()
      .single()

    if (error) {
      return { error: error.message }
    }

    revalidatePath('/crm/meta')
    revalidatePath('/crm/leads')
    return { success: true, data }
  } catch (err: any) {
    return { error: err.message || 'Failed to create project' }
  }
}

export async function updateProject(
  id: string,
  formData: {
    name: string
    client_name: string
    location?: string
    email?: string
    phone_numbers: string[]
  }
) {
  try {
    await requireAdmin()
    const supabase = createServiceClient() // guarded by checkActionAccess/requireAdmin above; tables are server-only

    const name = formData.name?.trim()
    const client_name = formData.client_name?.trim()
    const location = formData.location?.trim() || ''
    const email = formData.email?.trim() || ''
    const phone_numbers = (formData.phone_numbers || [])
      .map(p => p.replace(/\D/g, '').slice(0, 10))
      .filter(Boolean)
      .slice(0, 5)

    if (!name) return { error: 'Project name is required' }
    if (!client_name) return { error: 'Client name is required' }

    for (const phone of phone_numbers) {
      if (phone.length !== 10) {
        return { error: `Contact number "${phone}" must be exactly 10 digits` }
      }
    }

    const { data, error } = await supabase
      .from('projects')
      .update({
        name,
        client_name,
        location,
        email,
        phone_numbers,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('kind', 'meta')
      .select()
      .single()

    if (error) {
      return { error: error.message }
    }

    revalidatePath('/crm/meta')
    revalidatePath('/crm/leads')
    return { success: true, data }
  } catch (err: any) {
    return { error: err.message || 'Failed to update project' }
  }
}

export async function deleteProject(id: string) {
  try {
    await requireAdmin()
    const supabase = createServiceClient() // guarded by checkActionAccess/requireAdmin above; tables are server-only

    // Documents rows cascade, but their storage files must be removed explicitly
    await removeProjectDocumentFiles(createServiceClient(), id)

    // The client's synced lead forms go with it. (The FK only sets project_id to NULL, which left
    // ownerless forms showing in the Inbox filter.) Leads keep their form id and are not touched.
    const { data: isMetaClient } = await supabase.from('projects').select('id').eq('id', id).eq('kind', 'meta').maybeSingle()
    if (isMetaClient) {
      const { error: formsError } = await supabase.from('meta_forms').delete().eq('project_id', id)
      if (formsError) return { error: formsError.message }
    }

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('kind', 'meta')

    if (error) {
      return { error: error.message }
    }

    revalidatePath('/crm/meta')
    revalidatePath('/crm/leads')
    return { success: true }
  } catch (err: any) {
    return { error: err.message || 'Failed to delete project' }
  }
}

// -------------------------------------------------------------
// META CONNECT & LEAD SYNC ACTIONS
// -------------------------------------------------------------

/**
 * Generates a secure, 72-hour one-time client connect link for Alice or Bob
 */
export async function generateClientConnectLink(projectId: string) {
  try {
    await requireAdmin()
    const supabaseAdmin = createServiceClient()

    // 1. Fetch project to ensure it exists
    const { data: project, error: pErr } = await supabaseAdmin
      .from('projects')
      .select('id, name, client_name')
      .eq('id', projectId)
      .single()

    if (pErr || !project) {
      return { success: false, error: 'Project not found.' }
    }

    // 2. Generate unique secure token
    const token = `inv_${crypto.randomUUID().replace(/-/g, '')}`
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() // 72 hours

    // Invalidate any previous unused tokens for this project
    await supabaseAdmin
      .from('client_connect_tokens')
      .delete()
      .eq('project_id', projectId)
      .is('used_at', null)

    // Insert new token
    const { error: tokenErr } = await supabaseAdmin
      .from('client_connect_tokens')
      .insert({
        project_id: projectId,
        token,
        expires_at: expiresAt
      })

    if (tokenErr) {
      return { success: false, error: `Failed to create invite token: ${tokenErr.message}` }
    }

    const origin = await getRequestSiteUrl()

    const connectUrl = `${origin}/connect/meta?token=${token}`

    revalidatePath('/crm/meta')

    return {
      success: true,
      token,
      connectUrl,
      projectName: project.name,
      clientName: project.client_name,
      expiresAt
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Could not generate client connect link' }
  }
}

/**
 * Diagnostics & "Why are leads not working?" automated troubleshooter
 */
export async function checkMetaDiagnostics(projectId: string) {
  // Each check: state 'pass' | 'warn' | 'fail'. Overall status is DERIVED from the checks,
  // so the banner can never disagree with the checklist.
  type CheckState = 'pass' | 'warn' | 'fail'
  const mk = (check: string, state: CheckState, detail: string) => ({ check, state, passed: state === 'pass', detail })
  const summarize = (checks: { state: CheckState }[]) =>
    checks.some(c => c.state === 'fail') ? 'error' : checks.some(c => c.state === 'warn') ? 'warning' : 'healthy'

  try {
    await requireAdmin('view')
    const supabaseAdmin = createServiceClient()

    const [{ data: integration, error }, { data: project }, { count: formsCount }, { count: activeFormsCount }] = await Promise.all([
      supabaseAdmin.from('project_integrations').select('*').eq('project_id', projectId).maybeSingle(),
      supabaseAdmin.from('projects').select('name').eq('id', projectId).maybeSingle(),
      supabaseAdmin.from('meta_forms').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
      supabaseAdmin.from('meta_forms').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('is_active', true),
    ])

    // Last lead: by this client's form ids (a lead's project is now the property, REQ-95),
    // plus project id / name for rows saved before that.
    const { data: clientForms } = await supabaseAdmin.from('meta_forms').select('form_id').eq('project_id', projectId)
    const clientFormIds = (clientForms || []).map((f: any) => f.form_id).filter(Boolean)
    const [{ data: lastByForm }, { data: lastById }, { data: lastByName }] = await Promise.all([
      clientFormIds.length
        ? supabaseAdmin.from('leads').select('created_at').in('form_id', clientFormIds).order('created_at', { ascending: false }).limit(1)
        : Promise.resolve({ data: [] as any[] }),
      supabaseAdmin.from('leads').select('created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1),
      project?.name
        ? supabaseAdmin.from('leads').select('created_at').eq('project', project.name).order('created_at', { ascending: false }).limit(1)
        : Promise.resolve({ data: [] as any[] }),
    ])
    const lastLeadAt = [lastByForm?.[0]?.created_at, lastById?.[0]?.created_at, lastByName?.[0]?.created_at].filter(Boolean).sort().pop() || null

    const formsCheck = (activeFormsCount || 0) > 0
      ? mk('Active Lead Forms', 'pass', `${activeFormsCount} active of ${formsCount || 0} synced form(s).`)
      : mk('Active Lead Forms', 'fail', (formsCount || 0) > 0 ? `${formsCount} form(s) synced but none are active.` : 'No forms synced.')

    if (error || !integration || !integration.is_connected) {
      const checks = [
        mk('Facebook Page Connected', 'fail', integration?.page_name ? `Page "${integration.page_name}" is disconnected.` : 'Client has not completed Facebook login.'),
        mk('Token Validity', 'fail', 'No Page Access Token found.'),
        mk('Webhook Subscription', 'fail', 'Webhook cannot be subscribed without a page token.'),
        formsCheck,
      ]
      return { status: 'disconnected', isConnected: false, tokenStatus: 'missing', pageName: integration?.page_name || null, formsCount: formsCount || 0, activeFormsCount: activeFormsCount || 0, lastLeadAt, diagnostics: checks }
    }

    if (!integration.access_token) {
      const checks = [
        mk('Facebook Page Connected', 'pass', `Page: ${integration.page_name} (ID: ${integration.page_id})`),
        mk('Token Validity', 'fail', 'Access token is missing or was cleared.'),
        mk('Webhook Subscription', 'fail', 'Cannot verify without a token.'),
        formsCheck,
      ]
      return { status: 'error', isConnected: true, tokenStatus: 'missing', pageName: integration.page_name, pageId: integration.page_id, formsCount: formsCount || 0, activeFormsCount: activeFormsCount || 0, lastLeadAt, diagnostics: checks }
    }

    // Live checks against Meta
    const isSandbox = String(integration.access_token).includes('simulated')
    const [tokenCheck, webhookCheck] = await Promise.all([
      isSandbox ? Promise.resolve({ isValid: true, isNeverExpiring: undefined, scopes: [] as string[] } as any) : debugMetaAccessToken(integration.access_token),
      checkPageLeadgenSubscription(integration.page_id, integration.access_token),
    ])

    const REQUIRED_SCOPES = ['leads_retrieval', 'pages_manage_metadata']
    const scopes: string[] = tokenCheck.scopes || []
    const missingScopes = scopes.length > 0 ? REQUIRED_SCOPES.filter(sc => !scopes.includes(sc)) : []

    let tokenCheckRow
    if (isSandbox) tokenCheckRow = mk('Token Validity', 'warn', 'Sandbox (simulated) token: not a real Facebook connection.')
    else if (tokenCheck.unverified) tokenCheckRow = mk('Token Validity', 'warn', tokenCheck.errorMessage || 'Token could not be verified.')
    else if (!tokenCheck.isValid) tokenCheckRow = mk('Token Validity', 'fail', `Token revoked or invalid: ${tokenCheck.errorMessage || 'client may have changed password or removed permissions.'}`)
    else if (missingScopes.length > 0) tokenCheckRow = mk('Token Validity', 'fail', `Token is valid but missing permission(s): ${missingScopes.join(', ')}. Leads cannot be read.`)
    else tokenCheckRow = mk('Token Validity', 'pass', tokenCheck.isNeverExpiring
      ? 'Valid, with required permissions. Never expires.'
      : `Valid, with required permissions.${tokenCheck.expiresAt ? ` Expires ${new Date(tokenCheck.expiresAt * 1000).toLocaleDateString('en-IN')}.` : ''}`)

    let webhookRow
    if (webhookCheck.subscribed === true) webhookRow = mk('Webhook Subscription', 'pass', 'Live check: Page is subscribed to real-time leadgen events.')
    else if (webhookCheck.subscribed === false) webhookRow = mk('Webhook Subscription', 'fail', 'Live check: Page is NOT subscribed to leadgen events. New leads will only arrive via reconciliation.')
    else webhookRow = mk('Webhook Subscription', 'warn', `Could not verify live (${webhookCheck.error || 'unknown'}). Last recorded: ${integration.webhook_subscribed ? 'subscribed' : 'not subscribed'}.`)

    // Keep the stored flag honest when we have a definite live answer
    if (webhookCheck.subscribed !== null && webhookCheck.subscribed !== integration.webhook_subscribed) {
      await supabaseAdmin.from('project_integrations').update({ webhook_subscribed: webhookCheck.subscribed }).eq('project_id', projectId)
    }

    const checks = [
      mk('Facebook Page Connected', 'pass', `Page: ${integration.page_name} (ID: ${integration.page_id})`),
      tokenCheckRow,
      webhookRow,
      formsCheck,
    ]

    return {
      status: summarize(checks),
      isConnected: true,
      pageId: integration.page_id,
      pageName: integration.page_name,
      tokenStatus: !isSandbox && !tokenCheck.unverified && !tokenCheck.isValid ? 'revoked' : (tokenCheck.isValid ? 'valid' : 'unverified'),
      isNeverExpiring: tokenCheck.isNeverExpiring === true,
      lastSyncedAt: integration.last_synced_at,
      lastLeadAt,
      formsCount: formsCount || 0,
      activeFormsCount: activeFormsCount || 0,
      errorMessage: tokenCheck.errorMessage,
      diagnostics: checks,
    }
  } catch (err: any) {
    return {
      status: 'error',
      isConnected: false,
      tokenStatus: 'unknown',
      message: err.message || 'Diagnostic error',
      diagnostics: [{ check: 'Diagnostics', state: 'fail', passed: false, detail: err.message || 'Diagnostic error' }],
    }
  }
}

/**
 * Synchronizes all active Meta Lead Forms from the connected Facebook page into the CRM
 */
export async function syncProjectMetaForms(projectId: string) {
  try {
    await requireAdmin()
    const supabaseAdmin = createServiceClient()

    const { data: integration, error } = await supabaseAdmin
      .from('project_integrations')
      .select('page_id, page_name, access_token')
      .eq('project_id', projectId)
      .single()

    if (error || !integration?.page_id || !integration?.access_token) {
      return { success: false, error: 'Facebook Page is not connected for this project.' }
    }

    // Also fetch project name
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .single()

    const formsRes = await fetchPageLeadForms(integration.page_id, integration.access_token)
    if (!formsRes.success) {
      return { success: false, error: formsRes.error || 'Failed to query forms from Meta Graph API.' }
    }

    const forms = formsRes.forms
    if (forms.length === 0) {
      return { success: true, count: 0, message: 'No lead forms found on this Facebook Page.' }
    }

    // Upsert into meta_forms
    const payload = forms.map(f => ({
      project_id: projectId,
      project_name: project?.name || integration.page_name,
      form_id: f.id,
      name: f.name,
      form_name: f.name,
      is_active: f.status === 'ACTIVE',
      status: f.status,
      leads_count: f.leads_count || 0
    }))

    // The CRM on/off switch (is_active) is the user's choice: only NEW forms get a default
    // (on if Meta says ACTIVE). Existing forms keep whatever the user set.
    const { data: existingRows } = await supabaseAdmin
      .from('meta_forms').select('form_id').in('form_id', payload.map(p => p.form_id))
    const existingIds = new Set((existingRows || []).map((r: any) => r.form_id))
    const newRows = payload.filter(p => !existingIds.has(p.form_id))
    const updatedRows = payload.filter(p => existingIds.has(p.form_id)).map(({ is_active, ...rest }) => rest)

    let upsertErr: { message: string } | null = null
    if (newRows.length) {
      const { error } = await supabaseAdmin.from('meta_forms').insert(newRows)
      upsertErr = error
    }
    if (!upsertErr && updatedRows.length) {
      const { error } = await supabaseAdmin.from('meta_forms').upsert(updatedRows, { onConflict: 'form_id' })
      upsertErr = error
    }

    if (upsertErr) {
      return { success: false, error: `Error saving forms: ${upsertErr.message}` }
    }

    // Update last_synced_at
    await supabaseAdmin
      .from('project_integrations')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('project_id', projectId)

    revalidatePath('/crm/meta')
    revalidatePath('/crm/leads')

    return {
      success: true,
      count: forms.length,
      forms
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to sync forms from Meta' }
  }
}

/**
 * CRM on/off switch for a discovered form: true = import its leads into the CRM, false = ignore them.
 * Enforced for every ingest path in lib/meta-ingest.ts.
 */
export async function setMetaFormImportAction(formRowId: string, isActive: boolean) {
  try {
    await requireAdmin('edit')
    const { error } = await createServiceClient().from('meta_forms').update({ is_active: isActive }).eq('id', formRowId)
    if (error) throw error
    revalidatePath('/crm/meta')
    revalidatePath('/crm/leads')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update form' }
  }
}

/** Projects-page projects (properties) a Meta form can be linked to. */
export async function getLeadProjectOptions(): Promise<{ data: { id: string; name: string }[] }> {
  try {
    await requireAdmin('view')
    const { data } = await createServiceClient().from('projects').select('id, name').eq('kind', 'workspace').order('name', { ascending: true })
    return { data: (data || []).map((p: any) => ({ id: String(p.id), name: String(p.name || '') })) }
  } catch {
    return { data: [] }
  }
}

/** Link a Meta form to the project its leads are about (REQ-95). null = unlink. */
export async function setMetaFormProjectAction(formRowId: string, projectId: string | null) {
  try {
    await requireAdmin('edit')
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuid.test(String(formRowId || '')) || (projectId && !uuid.test(projectId))) throw new Error('Invalid form or project.')
    const db = createServiceClient()
    if (projectId) {
      const { data: proj } = await db.from('projects').select('id').eq('id', projectId).eq('kind', 'workspace').maybeSingle()
      if (!proj) throw new Error('Project not found on the Projects page.')
    }
    const { error } = await db.from('meta_forms').update({ lead_project_id: projectId || null }).eq('id', formRowId)
    if (error) throw error
    revalidatePath('/crm/meta')
    revalidatePath('/crm/leads')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to link the form to a project' }
  }
}

/**
 * Retrieves all stored lead gen forms for a project
 */
export async function getProjectMetaForms(projectId: string) {
  try {
    await requireAdmin('view')
    const supabaseAdmin = createServiceClient()

    const { data: forms, error } = await supabaseAdmin
      .from('meta_forms')
      .select('id, form_id, name, form_name, status, is_active, leads_count, created_at, lead_project_id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return { success: true, forms: forms || [] }
  } catch (err: any) {
    return { success: false, error: err.message, forms: [] }
  }
}

/**
 * Manually add a Form ID for a project (useful when a specific form wasn't auto-discovered)
 */
export async function addManualMetaForm(projectId: string, formId: string, formName?: string) {
  try {
    await requireAdmin()
    const supabaseAdmin = createServiceClient()

    const cleanFormId = formId.trim()
    if (!cleanFormId) {
      return { success: false, error: 'Form ID cannot be empty.' }
    }

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .single()

    const nameToUse = formName?.trim() || `Lead Form ${cleanFormId}`

    const { data, error } = await supabaseAdmin
      .from('meta_forms')
      .upsert({
        project_id: projectId,
        project_name: project?.name || 'Project Lead Form',
        form_id: cleanFormId,
        name: nameToUse,
        form_name: nameToUse,
        is_active: true,
        status: 'ACTIVE',
        leads_count: 0
      }, { onConflict: 'form_id' })
      .select()
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/crm/meta')
    return { success: true, form: data }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * Historical Lead Sync: Backfills past leads from a form (up to 90 days)
 */
export async function syncHistoricalMetaLeads(
  projectId: string,
  formId?: string,
  daysBack: number = 90
) {
  try {
    await requireAdmin()
    const supabaseAdmin = createServiceClient()

    const { data: integration } = await supabaseAdmin
      .from('project_integrations')
      .select('page_id, page_name, access_token')
      .eq('project_id', projectId)
      .single()

    if (!integration?.access_token) {
      return { success: false, error: 'No active Page Access Token found.' }
    }

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .single()

    // If specific formId not supplied, fetch all forms for this project
    let targetFormIds: string[] = []
    if (formId && formId !== 'all') {
      targetFormIds = [formId]
    } else {
      const { data: forms } = await supabaseAdmin
        .from('meta_forms')
        .select('form_id')
        .eq('project_id', projectId)
      targetFormIds = (forms || []).map(f => f.form_id)
    }

    if (targetFormIds.length === 0) {
      return { success: false, error: 'No lead forms found to sync. Please click "Refresh Forms from Meta" or add a Form ID manually.' }
    }

    let totalFetched = 0
    let totalInserted = 0

    for (const fid of targetFormIds) {
      const questions = await fetchFormQuestions(fid, integration.access_token)
      const pullRes = await fetchHistoricalLeads(fid, integration.access_token, 100, daysBack, questions)
      if (!pullRes.success) continue

      totalFetched += pullRes.leads.length

      for (const lead of pullRes.leads) {
        // Same ingestion as webhook/cron; existing leads get their answers refreshed with real labels
        const result = await ingestMetaLead(supabaseAdmin, {
          lead, formId: fid, projectId, projectName: project?.name || integration.page_name,
          origin: 'historical', questions, refreshExisting: true, note: 'historical sync',
        })
        if (result.outcome === 'inserted') totalInserted += 1
      }

      // Update leads_count on the form
      await supabaseAdmin
        .from('meta_forms')
        .update({ leads_count: pullRes.leads.length })
        .eq('form_id', fid)
    }

    revalidatePath('/crm/leads')
    revalidatePath('/crm/inbox')
    revalidatePath('/crm/meta')

    const timeFrameLabel = daysBack <= 0 
      ? 'across all available history' 
      : `from the last ${daysBack} days`;

    return {
      success: true,
      fetched: totalFetched,
      inserted: totalInserted,
      message: `Historical sync complete: Checked ${totalFetched} leads ${timeFrameLabel} (${totalInserted} new leads imported into CRM).`
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Historical lead sync failed' }
  }
}

/**
 * Disconnects Meta integration for a project
 */
export async function disconnectMetaIntegration(projectId: string) {
  try {
    await requireAdmin()
    const supabaseAdmin = createServiceClient()

    await supabaseAdmin
      .from('project_integrations')
      .delete()
      .eq('project_id', projectId)

    await supabaseAdmin
      .from('client_connect_tokens')
      .delete()
      .eq('project_id', projectId)

    // Mark forms as inactive
    await supabaseAdmin
      .from('meta_forms')
      .update({ is_active: false, status: 'DISCONNECTED' })
      .eq('project_id', projectId)

    revalidatePath('/crm/meta')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to disconnect integration' }
  }
}

/**
 * Public Verification: Used by the /connect/meta client onboarding page
 */
export async function verifyClientConnectToken(token: string) {
  try {
    const supabaseAdmin = createServiceClient()

    const { data: record, error } = await supabaseAdmin
      .from('client_connect_tokens')
      .select('id, project_id, expires_at, used_at, projects(id, name, client_name, location)')
      .eq('token', token)
      .single()

    if (error || !record) {
      return { valid: false, error: 'Invalid or unrecognized invitation link.' }
    }

    if (record.used_at) {
      return { valid: false, error: 'This invitation link has already been used. If you need to reconnect, please request a new link from your agency.' }
    }

    if (new Date(record.expires_at) < new Date()) {
      return { valid: false, error: 'This invitation link has expired (links are valid for 72 hours). Please request a fresh link.' }
    }

    const project: any = record.projects

    return {
      valid: true,
      tokenId: record.id,
      projectId: record.project_id,
      projectName: project?.name || 'Client Project',
      clientName: project?.client_name || 'Valued Client'
    }
  } catch (err: any) {
    return { valid: false, error: err.message || 'Verification failure' }
  }
}

/**
 * Completes client onboarding connection: saves page details, token, subscribes webhook, and auto-discovers forms
 */
/**
 * Public (invite-token gated) actions for /connect/meta. Page access tokens NEVER leave the server:
 * the browser only sees page ids/names and sends back the chosen page id.
 */
export async function getPendingMetaPages(token: string): Promise<{ pages: { id: string; name: string; followers?: number; category?: string }[] }> {
  if (!/^inv_[a-f0-9]{32}$/.test(String(token || ''))) return { pages: [] }
  const pages = await readPendingMetaPages(token)
  return { pages: pages.map(p => ({ id: p.id, name: p.name, followers: p.followers, category: p.category })) }
}

export async function confirmPendingMetaPage(token: string, pageId: string) {
  if (!/^inv_[a-f0-9]{32}$/.test(String(token || ''))) return { success: false, error: 'Invalid invitation link.' }
  const pages = await readPendingMetaPages(token)
  const page = pages.find(p => p.id === String(pageId))
  if (!page) return { success: false, error: 'This page selection has expired. Please connect with Facebook again.' }
  const res = await saveMetaConnection({ token, pageId: page.id, pageName: page.name, accessToken: page.access_token })
  if (res.success) {
    await createServiceClient().from('client_connect_tokens')
      .update({ pending_pages: null, pending_pages_expires_at: null }).eq('token', token)
  }
  return res
}

/**
 * Sandbox only (no META_APP_ID configured): creates two simulated pages server-side so the
 * multi-page flow can be demoed. Disabled automatically once a real Meta app is configured.
 */
export async function startSandboxMetaConnection(token: string): Promise<{ success: boolean; error?: string }> {
  if (process.env.META_APP_ID) return { success: false, error: 'Sandbox mode is disabled when a Meta app is configured.' }
  if (!/^inv_[a-f0-9]{32}$/.test(String(token || ''))) return { success: false, error: 'Invalid invitation link.' }
  const check = await verifyClientConnectToken(token)
  if (!check.valid) return { success: false, error: check.error || 'Invalid invitation link.' }
  const rand = () => String(Math.floor(100000000 + Math.random() * 900000000))
  const ok = await storePendingMetaPages(token, [
    { id: `page_${rand()}`, name: check.projectName || 'Client Business', category: 'Real Estate / Business', followers: 12450, access_token: `EAAG_simulated_never_expiring_token_${rand()}` },
    { id: `page_${rand()}`, name: `${check.clientName || 'Personal'} Blog & Community`, category: 'Personal Blog', followers: 430, access_token: `EAAG_simulated_personal_token_${rand()}` },
  ])
  return ok ? { success: true } : { success: false, error: 'Could not start sandbox connection.' }
}
