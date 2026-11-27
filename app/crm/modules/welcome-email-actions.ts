'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { checkActionAccess } from '@/lib/auth/permissions'
import { COMPANY_NAME } from '@/lib/site-config'
import { emailConfigured, sendEmails } from '@/lib/email'
import { isValidEmail } from '@/lib/outreach'
import { loadWelcomeConfig } from '@/lib/welcome-email-send'
import { WELCOME_EMAIL_KEY, isHexColor, isHttpUrl, normalizeWelcomeConfig, renderWelcomeEmail, type WelcomeEmailConfig } from '@/lib/welcome-email'

/** Modules → Email Template. Super Admin only ('modules' access). */

const BUCKET = 'crm-branding'
const LOGO_MAX_BYTES = 2 * 1024 * 1024

/** The sender shown to customers. Fixed: it comes from RESEND_FROM_EMAIL in Vercel and cannot be changed here. */
function fromAddress() {
  const email = process.env.RESEND_FROM_EMAIL || ''
  return { name: COMPANY_NAME, email, display: email ? `${COMPANY_NAME} <${email}>` : '' }
}

export async function getWelcomeEmailAdmin(): Promise<{ config: WelcomeEmailConfig; from: { name: string; email: string; display: string }; emailReady: boolean; error?: string }> {
  const auth = await checkActionAccess('modules', 'view')
  const base = { from: fromAddress(), emailReady: emailConfigured() }
  if (!auth.authorized) return { config: normalizeWelcomeConfig(null), ...base, error: auth.error }
  return { config: await loadWelcomeConfig(), ...base }
}

export async function saveWelcomeEmail(input: WelcomeEmailConfig): Promise<{ success: boolean; config?: WelcomeEmailConfig; error?: string }> {
  const auth = await checkActionAccess('modules', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }

  const cfg = normalizeWelcomeConfig({ ...input, enabled: input?.enabled === true })
  const subject = cfg.subject.trim()
  const body = cfg.body.trim()
  if (!subject) return { success: false, error: 'Please write a subject.' }
  if (!body) return { success: false, error: 'Please write the message.' }
  if (!isHexColor(String(input?.brandColor || ''))) return { success: false, error: 'Pick a valid colour.' }
  if (cfg.logoUrl && !isHttpUrl(cfg.logoUrl)) return { success: false, error: 'Invalid logo.' }
  if (cfg.enabled && !emailConfigured()) return { success: false, error: 'Email is not set up yet (RESEND_API_KEY and RESEND_FROM_EMAIL in Vercel), so it cannot be turned on.' }

  const saved = { ...cfg, subject, body }
  const { error } = await createServiceClient().from('crm_settings')
    .upsert({ key: WELCOME_EMAIL_KEY, value: JSON.stringify(saved), updated_at: new Date().toISOString() })
  if (error) return { success: false, error: error.message }
  revalidatePath('/crm/modules')
  return { success: true, config: saved }
}

export async function uploadWelcomeLogo(formData: FormData): Promise<{ success: boolean; url?: string; error?: string }> {
  const auth = await checkActionAccess('modules', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { success: false, error: 'No image selected.' }
  if (file.size > LOGO_MAX_BYTES) return { success: false, error: 'The logo must be 2 MB or smaller.' }
  const type = file.type.toLowerCase()
  if (type !== 'image/png' && type !== 'image/jpeg') return { success: false, error: 'Only PNG or JPEG logos work in emails.' }

  const db = createServiceClient()
  const path = `email/welcome-logo-${Date.now()}.${type === 'image/png' ? 'png' : 'jpg'}`
  const { error } = await db.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: type, upsert: true })
  if (error) return { success: false, error: `Upload failed: ${error.message}` }
  return { success: true, url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl }
}

/** Sends the CURRENT form content (saved or not) as a test to one address typed by the admin. */
export async function sendWelcomeTest(input: WelcomeEmailConfig, to: string): Promise<{ success: boolean; error?: string }> {
  const auth = await checkActionAccess('modules', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  const address = String(to || '').trim()
  if (!isValidEmail(address)) return { success: false, error: 'Enter a valid email address for the test.' }
  if (!emailConfigured()) return { success: false, error: 'Email is not set up yet (RESEND_API_KEY and RESEND_FROM_EMAIL in Vercel).' }
  const cfg = normalizeWelcomeConfig(input)
  const mail = renderWelcomeEmail(cfg, { name: 'Test Customer', project: 'Sample Project' }, COMPANY_NAME)
  const [result] = await sendEmails([{ to: address, subject: `[TEST] ${mail.subject}`, html: mail.html, text: mail.text }])
  return result?.ok ? { success: true } : { success: false, error: result?.error || 'Could not send the test.' }
}
