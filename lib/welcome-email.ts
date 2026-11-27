import { personalize } from './outreach'

/**
 * Welcome email template (Modules → Email Template). Pure code: safe for the browser preview and the server.
 * The text is written by the Super Admin; {name} and {project} are filled per customer.
 */

export interface WelcomeEmailConfig {
  /** Automatic welcome email to every NEW lead that has an email address. Off until the admin turns it on. */
  enabled: boolean
  subject: string
  heading: string
  body: string
  footer: string
  logoUrl: string
  brandColor: string
}

export const WELCOME_EMAIL_KEY = 'welcome_email'

export const DEFAULT_WELCOME_EMAIL: WelcomeEmailConfig = {
  enabled: false,
  subject: 'Welcome, {name}!',
  heading: 'Welcome, {name}!',
  body: 'Thank you for your interest in {project}.\n\nOur team will contact you shortly. If you have any questions in the meantime, just reply to this email.',
  footer: 'Warm regards,\nTeam',
  logoUrl: '',
  brandColor: '#0f1d33',
}

export const WELCOME_LIMITS = { subject: 200, heading: 150, body: 5000, footer: 500 } as const

export const isHexColor = (v: string) => /^#[0-9a-f]{6}$/i.test(v)
export const isHttpUrl = (v: string) => /^https?:\/\/[^\s]+$/i.test(v)

const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const paragraphs = (s: string) => esc(s).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`).join('')

/** Keeps the saved config safe to use: wrong types fall back to the defaults. */
export function normalizeWelcomeConfig(raw: unknown): WelcomeEmailConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const text = (k: keyof WelcomeEmailConfig, max: number) => (typeof r[k] === 'string' ? (r[k] as string).slice(0, max) : DEFAULT_WELCOME_EMAIL[k] as string)
  return {
    enabled: r.enabled === true,
    subject: text('subject', WELCOME_LIMITS.subject),
    heading: text('heading', WELCOME_LIMITS.heading),
    body: text('body', WELCOME_LIMITS.body),
    footer: text('footer', WELCOME_LIMITS.footer),
    logoUrl: text('logoUrl', 1000),
    brandColor: typeof r.brandColor === 'string' && isHexColor(r.brandColor) ? r.brandColor : DEFAULT_WELCOME_EMAIL.brandColor,
  }
}

/** Builds the email for one customer. Customer-typed values are escaped AFTER they are filled in. */
export function renderWelcomeEmail(cfg: WelcomeEmailConfig, lead: { name?: string | null; project?: string | null }, companyName: string) {
  const fill = (t: string) => personalize(t, lead)
  const color = isHexColor(cfg.brandColor) ? cfg.brandColor : DEFAULT_WELCOME_EMAIL.brandColor
  const subject = fill(cfg.subject).replace(/[\r\n]+/g, ' ').trim()
  const heading = fill(cfg.heading).trim()
  const body = fill(cfg.body).trim()
  const footer = fill(cfg.footer).trim()
  const showLogo = isHttpUrl(cfg.logoUrl)

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f3f5f9">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
<tr><td style="background:${color};padding:22px 28px;text-align:center">${showLogo
    ? `<img src="${esc(cfg.logoUrl)}" alt="${esc(companyName)}" style="max-height:56px;max-width:220px;height:auto;display:inline-block">`
    : `<span style="color:#ffffff;font-size:20px;font-weight:bold">${esc(companyName)}</span>`}</td></tr>
<tr><td style="padding:28px;color:#1f2937;font-size:15px;line-height:1.6">
${heading ? `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${color}">${esc(heading)}</h1>` : ''}
${paragraphs(body)}
${footer ? `<p style="margin:22px 0 0;color:#4b5563">${esc(footer).replace(/\n/g, '<br>')}</p>` : ''}
</td></tr>
<tr><td style="padding:14px 28px;background:#f8fafc;color:#94a3b8;font-size:12px;text-align:center">${esc(companyName)}</td></tr>
</table></td></tr></table></body></html>`

  const text = [heading, body, footer].filter(Boolean).join('\n\n')
  return { subject, html, text }
}
