'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCachedAuthSession } from '@/lib/auth/permissions'
import { COMPANY_NAME_MAX } from '@/lib/company-name'

/** Company name shown in the sidebar under the logo (REQ-104). Company-wide; set by the Super Admin. */

export async function getCompanyNameAction(): Promise<{ name: string }> {
  const session = await getCachedAuthSession()
  if (!session.user) return { name: '' }
  const { data } = await createServiceClient().from('crm_settings').select('value').eq('key', 'company_name').maybeSingle()
  return { name: String(data?.value || '') }
}

export async function saveCompanyNameAction(name: string): Promise<{ success: boolean; name?: string; error?: string }> {
  const session = await getCachedAuthSession()
  if (!session.user) return { success: false, error: 'Please sign in again.' }
  if (session.role !== 'Super Admin') return { success: false, error: 'Only the Super Admin can change the company name.' }
  const clean = String(name || '').replace(/\s+/g, ' ').trim()
  if (clean.length > COMPANY_NAME_MAX) return { success: false, error: `Up to ${COMPANY_NAME_MAX} characters, including spaces.` }
  const { error } = await createServiceClient().from('crm_settings')
    .upsert({ key: 'company_name', value: clean, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return { success: false, error: error.message }
  revalidatePath('/crm', 'layout')
  return { success: true, name: clean }
}
