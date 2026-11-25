/**
 * Lead source rules (REQ-94). Shared by client and server.
 * - Manually added leads pick a source from Modules → Lead Sources (the source KEY is stored,
 *   which is what the Leads filters and reports match on).
 * - Leads captured automatically (Meta) keep their source: it is locked when editing.
 */

export interface LeadSourceOption {
  key: string
  name: string
}

/** Sources used when the lead_sources table is empty or missing. */
export const FALLBACK_SOURCE_KEYS: readonly string[] = ['meta', 'website', 'whatsapp']

/**
 * Inbox = Meta leads only (REQ-98). Every lead that has a Meta form submission carries
 * the form id (new Meta leads, and existing leads that later submit a Meta form);
 * manually added leads and other sources don't.
 */
export function onlyMetaLeads<Q>(query: Q): Q {
  return (query as any).not('form_id', 'is', null)
}

/** True for leads the CRM captured itself (Meta Lead Ads), whose source must not be edited. */
export function isAutoCapturedLead(sourcePage?: string | null, formId?: string | null): boolean {
  if (String(formId || '').trim()) return true
  return /^meta[_:]/i.test(String(sourcePage || '').trim())
}

/** The source option a stored value matches (case-insensitive key match), if any. */
export function matchSourceOption<T extends LeadSourceOption>(value: string | null | undefined, options: T[]): T | undefined {
  const v = String(value || '').trim().toLowerCase()
  if (!v) return undefined
  return options.find((o) => String(o.key || '').trim().toLowerCase() === v)
}

/** Display name for a stored source: the configured name for a known key, else the raw value. */
export function sourceLabel(value: string | null | undefined, options: LeadSourceOption[]): string {
  return matchSourceOption(value, options)?.name || String(value || '').trim()
}

export type ResolvedSource =
  | { ok: true; locked: true }
  | { ok: true; locked: false; source: string }
  | { ok: false; error: string }

/**
 * Decides what source_page to save.
 * - Editing an auto-captured lead: locked (keep what is stored).
 * - Otherwise the submitted value must be a configured source key, or (when editing) the
 *   lead's current value unchanged, so older free-text sources are not silently wiped.
 */
export function resolveLeadSource(
  submitted: string | null | undefined,
  current: { source_page?: string | null; form_id?: string | null } | null,
  allowedKeys: readonly string[]
): ResolvedSource {
  if (current && isAutoCapturedLead(current.source_page, current.form_id)) return { ok: true, locked: true }

  const value = String(submitted || '').trim()
  if (!value) return { ok: false, error: 'Please choose a source.' }

  const key = allowedKeys.find((k) => k.trim().toLowerCase() === value.toLowerCase())
  if (key) return { ok: true, locked: false, source: key.trim() }

  if (current && value === String(current.source_page || '').trim()) return { ok: true, locked: false, source: value }

  return { ok: false, error: 'Please choose a source from the list. New sources are added in Modules → Lead Sources.' }
}
