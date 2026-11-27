'use server'

import { headers } from 'next/headers'
import { redis } from '@/lib/redis'
import { sendOneEmail } from '@/lib/email'
import { isValidEmail } from '@/lib/outreach'
import { cleanPhoneInput, phoneError } from '@/lib/phone-validation'
import { canonicalPhoneNumber } from '@/lib/phone-input'
import { CAREERS_EMAIL, COMPANY_NAME } from '@/lib/site-config'

export type CareerState = {
  ok: boolean
  message?: string
  errors?: { name?: string; phone?: string; email?: string }
  values?: { name: string; phone: string; email: string }
}

const clean = (v: FormDataEntryValue | null, max: number) =>
  String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Careers page: name, mobile number and email, emailed to CAREERS_EMAIL (agents@meesampadha.com). Nothing is saved in the CRM. */
export async function submitCareer(_prev: CareerState, formData: FormData): Promise<CareerState> {
  const values = {
    name: clean(formData.get('name'), 60),
    phone: cleanPhoneInput(String(formData.get('phone') ?? '')),
    email: clean(formData.get('email'), 120).toLowerCase(),
  }

  // Honeypot: real visitors never see or fill this field. Pretend success so bots learn nothing.
  if (clean(formData.get('website'), 100)) return { ok: true, message: 'Thank you. We have received your details.' }

  const errors: NonNullable<CareerState['errors']> = {}
  if (!/^[\p{L}][\p{L} .'-]{1,59}$/u.test(values.name)) errors.name = 'Enter your name (letters only)'
  const pe = phoneError(values.phone)
  if (pe) errors.phone = pe
  if (!isValidEmail(values.email)) errors.email = 'Enter a valid email address'
  if (Object.keys(errors).length) return { ok: false, errors, values }

  // Light rate limit per visitor: 3 applications per 10 minutes.
  const h = await headers()
  const ip = (h.get('x-forwarded-for') || h.get('x-real-ip') || 'unknown').split(',')[0].trim()
  const key = `career:${ip}`
  const used = Number((await redis.get<number>(key)) || 0)
  if (used >= 3) return { ok: false, message: 'Too many submissions from this device. Please try again in a few minutes.', values }
  await redis.set(key, used + 1, { ex: 600 })

  const phone = canonicalPhoneNumber(values.phone)
  const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
  const failure = await sendOneEmail({
    to: CAREERS_EMAIL,
    replyTo: values.email,
    subject: `Careers application: ${values.name}`,
    text: `New careers application from the ${COMPANY_NAME} website\n\nName: ${values.name}\nMobile: ${phone}\nEmail: ${values.email}\nReceived: ${when} (IST)`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">
<h2 style="margin:0 0 12px">New careers application</h2>
<p style="margin:0 0 4px"><b>Name:</b> ${esc(values.name)}</p>
<p style="margin:0 0 4px"><b>Mobile:</b> ${esc(phone)}</p>
<p style="margin:0 0 4px"><b>Email:</b> ${esc(values.email)}</p>
<p style="margin:12px 0 0;color:#6b7280;font-size:13px">Received ${esc(when)} (IST) from the ${esc(COMPANY_NAME)} website. Reply to this email to answer the applicant.</p></div>`,
  })
  if (failure) {
    console.error('[careers] email failed:', failure)
    return { ok: false, message: 'We could not send your details right now. Please call or WhatsApp us instead.', values }
  }
  return { ok: true, message: `Thank you, ${values.name.split(' ')[0]}. We have received your details and will contact you soon.` }
}
