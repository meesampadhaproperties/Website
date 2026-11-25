'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { checkActionAccess } from '@/lib/auth/permissions'
import { templateVariables } from '@/lib/sms'

/** Modules → SMS Templates (MSG91). Super Admin only ('modules' access requires Super Admin). */

export interface SmsTemplate {
  id: string
  name: string
  msg91_template_id: string
  body: string
  is_active: boolean
  created_at?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function getSmsTemplatesAdmin(): Promise<{ templates: SmsTemplate[]; keyConfigured: boolean; error?: string }> {
  const auth = await checkActionAccess('modules', 'view')
  if (!auth.authorized) return { templates: [], keyConfigured: false, error: auth.error }
  const { data, error } = await createServiceClient().from('sms_templates')
    .select('id, name, msg91_template_id, body, is_active, created_at').order('created_at', { ascending: true })
  return { templates: (data || []) as SmsTemplate[], keyConfigured: !!process.env.MSG91_AUTH_KEY, error: error?.message }
}

export async function saveSmsTemplate(input: { id?: string; name: string; msg91_template_id: string; body: string }): Promise<{ success: boolean; template?: SmsTemplate; error?: string }> {
  const auth = await checkActionAccess('modules', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }

  const name = String(input?.name || '').trim().slice(0, 80)
  const templateId = String(input?.msg91_template_id || '').trim()
  const body = String(input?.body || '').trim()
  if (!name) return { success: false, error: 'Please give the template a name.' }
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(templateId)) return { success: false, error: 'Please paste the template ID from MSG91 (letters and numbers only).' }
  if (body.length < 5 || body.length > 1000) return { success: false, error: 'Please paste the template text exactly as approved (5 to 1000 characters).' }
  if (/\{#var#\}/i.test(body)) return { success: false, error: 'Replace each {#var#} with a named blank like ##name##, exactly as in the MSG91 template.' }
  if (templateVariables(body).length > 10) return { success: false, error: 'A template can have at most 10 blanks.' }

  const db = createServiceClient()
  const row = { name, msg91_template_id: templateId, body, updated_at: new Date().toISOString() }
  const q = input.id
    ? (UUID_RE.test(input.id) ? db.from('sms_templates').update(row).eq('id', input.id) : null)
    : db.from('sms_templates').insert({ ...row, is_active: true })
  if (!q) return { success: false, error: 'Invalid template.' }
  const { data, error } = await q.select('id, name, msg91_template_id, body, is_active, created_at').single()
  if (error) return { success: false, error: error.message }
  revalidatePath('/crm/modules')
  return { success: true, template: data as SmsTemplate }
}

export async function setSmsTemplateActive(id: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
  const auth = await checkActionAccess('modules', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(String(id || ''))) return { success: false, error: 'Invalid template.' }
  const { error } = await createServiceClient().from('sms_templates')
    .update({ is_active: !!isActive, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/crm/modules')
  return { success: true }
}

export async function deleteSmsTemplate(id: string): Promise<{ success: boolean; error?: string }> {
  const auth = await checkActionAccess('modules', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(String(id || ''))) return { success: false, error: 'Invalid template.' }
  const { error } = await createServiceClient().from('sms_templates').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/crm/modules')
  return { success: true }
}
