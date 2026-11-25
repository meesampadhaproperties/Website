import { getIstCurrentDateString } from './timezone'

/**
 * Lead form rules (REQ-95, REQ-97). Shared by client and server.
 * - Project: picked from the Projects page (workspace projects). Meta leads get it from their form.
 * - Enquiry type: a fixed list. Older typed values are kept until changed.
 */

/** Used only until Modules → Enquiry Types has rows (the table is seeded with these). */
export const ENQUIRY_TYPES = ['Site visit', 'Price quote', 'Brochure', 'Loan help', 'General'] as const

/** Select value meaning "keep the lead's current (older, typed) value". */
export const KEEP_CURRENT = '__keep__'

/** lead_activities types that are an enquiry (a form submission or a manually added enquiry). */
export const ENQUIRY_ACTIVITY_TYPES = ['meta_form_submission', 'manual_enquiry'] as const

export interface ProjectOption {
  id: string
  name: string
}

type Choice<T> = { ok: true; keep: true } | { ok: true; keep: false; value: T } | { ok: false; error: string }

/** Enquiry type from the form: '' → none, a list value, or (editing) the current typed value. */
export function resolveEnquiryType(
  submitted: string | null | undefined,
  current: string | null | undefined,
  types: readonly string[] = ENQUIRY_TYPES
): Choice<string | null> {
  const v = String(submitted ?? '').trim()
  if (v === KEEP_CURRENT) return current ? { ok: true, keep: true } : { ok: true, keep: false, value: null }
  if (!v) return { ok: true, keep: false, value: null }
  const match = types.find((t) => t.toLowerCase() === v.toLowerCase())
  if (match) return { ok: true, keep: false, value: match }
  if (current && v === current.trim()) return { ok: true, keep: true }
  return { ok: false, error: 'Please choose an enquiry type from the list.' }
}

/** Project from the form: '' → none, a project id from the list, or (editing) keep the current typed value. */
export function resolveProjectChoice(
  submitted: string | null | undefined,
  current: { project?: string | null } | null,
  projects: ProjectOption[]
): Choice<ProjectOption | null> {
  const v = String(submitted ?? '').trim()
  if (v === KEEP_CURRENT) return current?.project ? { ok: true, keep: true } : { ok: true, keep: false, value: null }
  if (!v) return { ok: true, keep: false, value: null }
  const match = projects.find((p) => p.id === v)
  if (match) return { ok: true, keep: false, value: { id: match.id, name: match.name } }
  return { ok: false, error: 'Please choose a project from the list. Projects are added on the Projects page.' }
}

/** The project option a lead's stored project matches (by id, else by name), if any. */
export function matchProjectOption(
  lead: { project?: string | null; project_id?: string | null } | null | undefined,
  projects: ProjectOption[]
): ProjectOption | undefined {
  if (!lead) return undefined
  const byId = lead.project_id ? projects.find((p) => p.id === lead.project_id) : undefined
  if (byId) return byId
  const name = String(lead.project || '').trim().toLowerCase()
  return name ? projects.find((p) => p.name.trim().toLowerCase() === name) : undefined
}

const MAX_PROJECTS = 20

/**
 * Adds a project name to the list of projects a person asked about (latest first).
 * newest = this enquiry is the latest one (moves/puts it first); otherwise an older
 * enquiry only appends a project that isn't listed yet.
 */
export function mergeEnquiryProjects(list: string[] | null | undefined, name: string | null | undefined, newest = true): string[] {
  const current = (list || []).map((s) => String(s || '').trim()).filter(Boolean)
  const n = String(name || '').trim()
  if (!n) return current.slice(0, MAX_PROJECTS)
  const exists = current.some((p) => p.toLowerCase() === n.toLowerCase())
  if (!newest) return (exists ? current : [...current, n]).slice(0, MAX_PROJECTS)
  return [n, ...current.filter((p) => p.toLowerCase() !== n.toLowerCase())].slice(0, MAX_PROJECTS)
}

/** Projects to show on a lead row: the current project first, then the others they asked about. */
export function leadProjectsForDisplay(lead: { project?: string | null; enquiry_projects?: string[] | null }): string[] {
  return mergeEnquiryProjects(lead.enquiry_projects, lead.project, true)
}

/** True when a returning person (2+ enquiries) enquired again today (IST). */
export function isNewRepeatEnquiry(
  lead: { enquiry_count?: number | null; last_enquiry_at?: string | null },
  now: Date = new Date()
): boolean {
  if ((lead.enquiry_count || 1) < 2 || !lead.last_enquiry_at) return false
  const t = new Date(lead.last_enquiry_at)
  return !isNaN(t.getTime()) && getIstCurrentDateString(t) === getIstCurrentDateString(now)
}
