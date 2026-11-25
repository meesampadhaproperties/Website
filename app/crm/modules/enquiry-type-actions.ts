'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { checkActionAccess } from '@/lib/auth/permissions'
import { loadEnquiryTypes } from '@/lib/enquiry-types'

/** Modules → Enquiry Types (REQ-105). Managing = Super Admin; reading = anyone with Leads access. */

export interface EnquiryType { id: string; name: string; sort_order: number }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function refresh() { revalidatePath('/crm/modules'); revalidatePath('/crm/leads') }

/** Names for the lead form dropdown. */
export async function getEnquiryTypeOptions(): Promise<string[]> {
  const auth = await checkActionAccess('leads', 'view')
  if (!auth.authorized) return []
  return loadEnquiryTypes(createServiceClient())
}

export async function getEnquiryTypesAdmin(): Promise<{ data: EnquiryType[]; error?: string }> {
  const auth = await checkActionAccess('modules', 'view')
  if (!auth.authorized) return { data: [], error: auth.error }
  const { data, error } = await createServiceClient().from('enquiry_types').select('id, name, sort_order').order('sort_order', { ascending: true }).order('name', { ascending: true })
  return { data: (data || []) as EnquiryType[], error: error?.message }
}

const cleanName = (n: string) => String(n || '').replace(/\s+/g, ' ').trim()

export async function addEnquiryType(name: string): Promise<{ success: boolean; data?: EnquiryType; error?: string }> {
  const auth = await checkActionAccess('modules', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  const n = cleanName(name)
  if (!n || n.length > 40) return { success: false, error: 'Use 1 to 40 characters.' }
  const db = createServiceClient()
  const { data: last } = await db.from('enquiry_types').select('sort_order').order('sort_order', { ascending: false }).limit(1)
  const { data, error } = await db.from('enquiry_types').insert({ name: n, sort_order: (last?.[0]?.sort_order || 0) + 1 }).select('id, name, sort_order').single()
  if (error) return { success: false, error: /duplicate|unique/i.test(error.message) ? `"${n}" already exists.` : error.message }
  refresh()
  return { success: true, data: data as EnquiryType }
}

export async function renameEnquiryType(id: string, name: string): Promise<{ success: boolean; error?: string }> {
  const auth = await checkActionAccess('modules', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  const n = cleanName(name)
  if (!UUID_RE.test(String(id || ''))) return { success: false, error: 'Invalid type.' }
  if (!n || n.length > 40) return { success: false, error: 'Use 1 to 40 characters.' }
  const db = createServiceClient()
  const { data: old } = await db.from('enquiry_types').select('name').eq('id', id).maybeSingle()
  const { error } = await db.from('enquiry_types').update({ name: n }).eq('id', id)
  if (error) return { success: false, error: /duplicate|unique/i.test(error.message) ? `"${n}" already exists.` : error.message }
  // Leads keep pointing at the renamed type
  if (old?.name && old.name !== n) await db.from('leads').update({ enquiry_type: n }).eq('enquiry_type', old.name)
  refresh()
  return { success: true }
}

/** Deleting a type leaves existing leads' value as typed text (shown as "not in list" until changed). */
export async function deleteEnquiryType(id: string): Promise<{ success: boolean; error?: string }> {
  const auth = await checkActionAccess('modules', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(String(id || ''))) return { success: false, error: 'Invalid type.' }
  const { error } = await createServiceClient().from('enquiry_types').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  refresh()
  return { success: true }
}
