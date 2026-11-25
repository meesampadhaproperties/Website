import { ENQUIRY_TYPES } from './lead-fields'

/** Enquiry types from Modules → Enquiry Types (REQ-105), falling back to the defaults. Server-only (takes a service client). */
export async function loadEnquiryTypes(db: any): Promise<string[]> {
  const { data, error } = await db.from('enquiry_types').select('name').order('sort_order', { ascending: true }).order('name', { ascending: true })
  const names = (data || []).map((r: any) => String(r.name || '').trim()).filter(Boolean)
  return error || names.length === 0 ? [...ENQUIRY_TYPES] : names
}
