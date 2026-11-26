import { phoneMatchKey } from './lead-phone'

/**
 * SMS through MSG91 (REQ-99).
 * India requires DLT-approved templates: the text sent must match an approved template, and only
 * its blanks can change. In the CRM a template's blanks are written as ##name## (the same names
 * used in the MSG91 template). Pure helpers are shared by client and server; sendMsg91Sms is server-only.
 */

const VAR_RE = /##([A-Za-z0-9_]+)##/g

/**
 * SMS master switch. While false, every SMS option in the CRM (Bulk Sender, Inbox composer, wallet card)
 * shows "disabled" and the server refuses to send. Turn it back on when DLT registration is done.
 */
export const SMS_ENABLED = false
export const SMS_DISABLED_MESSAGE = 'SMS is disabled for now.'

/** DLT allows up to 30 characters per blank. */
export const SMS_VALUE_MAX = 30

/** The blanks in a template, in order, without duplicates. */
export function templateVariables(body: string | null | undefined): string[] {
  const seen: string[] = []
  for (const m of String(body || '').matchAll(VAR_RE)) if (!seen.includes(m[1])) seen.push(m[1])
  return seen
}

/** The text the customer will receive (unfilled blanks stay as ##name##). */
export function fillTemplate(body: string | null | undefined, values: Record<string, string>): string {
  return String(body || '').replace(VAR_RE, (whole, name) => {
    const v = String(values?.[name] ?? '').trim()
    return v || whole
  })
}

/** Every blank filled, short enough for DLT, single line. */
export function validateSmsValues(
  body: string | null | undefined,
  values: Record<string, string> | null | undefined
): { ok: true; values: Record<string, string> } | { ok: false; error: string } {
  const clean: Record<string, string> = {}
  for (const name of templateVariables(body)) {
    const v = String(values?.[name] ?? '').replace(/\s+/g, ' ').trim()
    if (!v) return { ok: false, error: `Please fill in "${name}".` }
    if (v.length > SMS_VALUE_MAX) return { ok: false, error: `"${name}" can be at most ${SMS_VALUE_MAX} characters.` }
    clean[name] = v
  }
  return { ok: true, values: clean }
}

/** MSG91 mobile format: country code + number, digits only (e.g. 919876543210). */
export function msg91Mobile(phone: string | null | undefined): string | null {
  const key = phoneMatchKey(phone)
  return key ? key.slice(1) : null
}

/** Sensible starting values for common blank names (staff can change them). */
export function suggestSmsValue(name: string, lead: { name?: string | null; project?: string | null; phone?: string | null }): string {
  const n = name.toLowerCase()
  // Most specific first: "project_name" is a project, not the person's name
  if (n.includes('project') || n.includes('property') || n.includes('venture')) return String(lead.project || '').trim()
  if (n.includes('phone') || n.includes('mobile')) return String(lead.phone || '').trim()
  if (n.includes('name')) return String(lead.name || '').trim().split(/\s+/)[0] || ''
  return ''
}

export const MSG91_FLOW_URL = 'https://control.msg91.com/api/v5/flow'

/**
 * Sends a templated SMS to one recipient (mobile + values) or many (recipients, each with their own
 * values) in ONE MSG91 call. Never throws: returns ok/error for the caller to log and show.
 */
export async function sendMsg91Sms(p: {
  authKey: string
  templateId: string
  mobile?: string
  values?: Record<string, string>
  recipients?: { mobile: string; values: Record<string, string> }[]
  fetchImpl?: typeof fetch
}): Promise<{ ok: true; requestId: string | null } | { ok: false; error: string }> {
  const list = p.recipients || [{ mobile: p.mobile || '', values: p.values || {} }]
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await (p.fetchImpl || fetch)(MSG91_FLOW_URL, {
      method: 'POST',
      headers: { authkey: p.authKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ template_id: p.templateId, short_url: '0', recipients: list.map((r) => ({ mobiles: r.mobile, ...r.values })) }),
      signal: controller.signal,
    })
    const json: any = await res.json().catch(() => ({}))
    if (res.ok && String(json?.type || '').toLowerCase() === 'success') {
      return { ok: true, requestId: json?.message ? String(json.message) : null }
    }
    return { ok: false, error: String(json?.message || `MSG91 returned HTTP ${res.status}`) }
  } catch (e: any) {
    return { ok: false, error: e?.name === 'AbortError' ? 'MSG91 did not respond in time.' : (e?.message || 'Could not reach MSG91.') }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * MSG91 SMS balance (credits left on the route). MSG91's balance endpoint returns a plain number.
 * Route type comes from MSG91_ROUTE_TYPE (default 4 = transactional). Never throws.
 */
export async function fetchMsg91Balance(authKey: string, routeType = '4', fetchImpl?: typeof fetch): Promise<{ ok: true; credits: number } | { ok: false; error: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const url = `https://control.msg91.com/api/balance.php?authkey=${encodeURIComponent(authKey)}&type=${encodeURIComponent(routeType)}`
    const res = await (fetchImpl || fetch)(url, { signal: controller.signal, cache: 'no-store' } as RequestInit)
    const text = (await res.text()).trim()
    const n = Number(text)
    if (res.ok && text !== '' && Number.isFinite(n)) return { ok: true, credits: n }
    let msg = text
    try { msg = JSON.parse(text)?.message || text } catch {}
    return { ok: false, error: msg ? `MSG91: ${msg.slice(0, 120)}` : `MSG91 returned HTTP ${res.status}` }
  } catch (e: any) {
    return { ok: false, error: e?.name === 'AbortError' ? 'MSG91 did not respond in time.' : 'Could not reach MSG91.' }
  } finally {
    clearTimeout(timer)
  }
}
