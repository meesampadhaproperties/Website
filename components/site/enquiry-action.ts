'use server'

import { headers } from 'next/headers'
import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { findLeadsByPhone } from '@/lib/lead-phone'
import { canonicalPhoneNumber } from '@/lib/phone-input'
import { cleanPhoneInput, phoneError } from '@/lib/phone-validation'
import { redis } from '@/lib/redis'

export type EnquiryState = {
  ok: boolean
  message?: string
  errors?: { name?: string; phone?: string; message?: string }
  values?: { name: string; phone: string; message: string }
}

const clean = (v: FormDataEntryValue | null, max: number) =>
  String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max)

/** Public website enquiry: name, phone, message. Saved into the CRM as a "website" lead. */
export async function submitEnquiry(_prev: EnquiryState, formData: FormData): Promise<EnquiryState> {
  const values = {
    name: clean(formData.get('name'), 60),
    phone: cleanPhoneInput(String(formData.get('phone') ?? '')),
    message: clean(formData.get('message'), 500),
  }

  // Honeypot: real visitors never see or fill this field. Pretend success so bots learn nothing.
  if (clean(formData.get('website'), 100)) return { ok: true, message: 'Thank you. We will be in touch soon.' }

  const errors: NonNullable<EnquiryState['errors']> = {}
  if (!/^[\p{L}][\p{L} .'-]{1,59}$/u.test(values.name)) errors.name = 'Enter your name (letters only)'
  const pe = phoneError(values.phone)
  if (pe) errors.phone = pe
  if (values.message.length < 5) errors.message = 'Tell us a little more (at least 5 characters)'
  if (Object.keys(errors).length) return { ok: false, errors, values }

  // Light rate limit per visitor: 5 enquiries per 10 minutes.
  const h = await headers()
  const ip = (h.get('x-forwarded-for') || h.get('x-real-ip') || 'unknown').split(',')[0].trim()
  const key = `enquiry:${ip}`
  const used = Number((await redis.get<number>(key)) || 0)
  if (used >= 5) return { ok: false, message: 'Too many enquiries from this device. Please try again in a few minutes.', values }
  await redis.set(key, used + 1, { ex: 600 })

  if (!isSupabaseConfigured()) {
    return { ok: false, message: 'We could not save your enquiry right now. Please call or WhatsApp us instead.', values }
  }

  try {
    const db = createServiceClient()
    const phone = canonicalPhoneNumber(values.phone)
    const now = new Date().toISOString()

    // One lead per person (matched by phone): repeat enquiries are added to their timeline.
    const [existing] = await findLeadsByPhone(db, phone, 'id, enquiry_count', 1)
    let leadId: string | undefined = existing?.id
    if (leadId) {
      await db.from('leads').update({ enquiry_count: (Number(existing.enquiry_count) || 1) + 1, last_enquiry_at: now }).eq('id', leadId)
    } else {
      const { data, error } = await db.from('leads').insert({
        name: values.name, phone, email: null, message: values.message,
        source_page: 'website', status: 'new', enquiry_count: 1, last_enquiry_at: now,
      }).select('id').single()
      if (error || !data) throw new Error(error?.message || 'Insert failed')
      leadId = data.id
    }
    await db.from('lead_activities').insert({
      lead_id: leadId, activity_type: 'website_enquiry',
      description: `Website enquiry: ${values.message}`, metadata: { page: String(formData.get('page') || '').slice(0, 200), ref: clean(formData.get('ref'), 60) || null },
    })
    return { ok: true, message: `Thank you, ${values.name.split(' ')[0]}. We have your details and will get back to you soon.` }
  } catch (e) {
    console.error('[website enquiry] save failed:', e instanceof Error ? e.message : e)
    return { ok: false, message: 'Something went wrong while saving your enquiry. Please try again, or call us.', values }
  }
}
