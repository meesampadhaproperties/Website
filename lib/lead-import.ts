import { phoneMatchKey } from './lead-phone'
import { ENQUIRY_TYPES } from './lead-fields'

/**
 * Leads → Import from Excel (REQ-101). Shared by the browser (template + preview) and the server
 * (authoritative validation). One column per CRM lead field.
 */

export interface ImportColumn {
  key: ImportField
  header: string
  required?: boolean
  help: string
}

export type ImportField = 'name' | 'phone' | 'email' | 'source' | 'status' | 'project' | 'enquiry_type' | 'location' | 'notes' | 'date'

export const IMPORT_COLUMNS: ImportColumn[] = [
  { key: 'name', header: 'Name', required: true, help: 'Full name' },
  { key: 'phone', header: 'Phone', required: true, help: '10-digit mobile, with or without +91' },
  { key: 'email', header: 'Email', help: 'Optional' },
  { key: 'source', header: 'Source', required: true, help: 'Pick from the list (Modules → Lead Sources)' },
  { key: 'status', header: 'Status', help: 'Pick from the list. Empty = New' },
  { key: 'project', header: 'Project', help: 'Pick from the list (Projects page). Optional' },
  { key: 'enquiry_type', header: 'Enquiry Type', help: 'Pick from the list. Optional' },
  { key: 'location', header: 'Location', help: 'City or area. Optional' },
  { key: 'notes', header: 'Notes', help: 'Your notes about this lead. Optional' },
  { key: 'date', header: 'Date', help: 'When the lead came in (DD/MM/YYYY). Empty = today' },
]

export const IMPORT_MAX_ROWS = 2000

export type ImportRow = Partial<Record<ImportField, string>> & { row: number }

/** Plain text from an Excel cell value (strings, numbers, dates, rich text, links, formulas). */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return isNaN(value.getTime()) ? '' : value.toISOString()
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(value)
  if (typeof value === 'object') {
    const v: any = value
    if (Array.isArray(v.richText)) return v.richText.map((r: any) => r?.text || '').join('').trim()
    if (v.text !== undefined) return cellText(v.text)
    if (v.result !== undefined) return cellText(v.result)
    if (v.hyperlink) return String(v.hyperlink).replace(/^mailto:/i, '').trim()
    return ''
  }
  return String(value).trim()
}

/** Maps a sheet's header row to import fields (case/space-insensitive). Unknown headers are ignored. */
export function mapHeaders(headers: string[]): Partial<Record<number, ImportField>> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
  const aliases: Record<string, ImportField> = {
    name: 'name', fullname: 'name', leadname: 'name',
    phone: 'phone', mobile: 'phone', phonenumber: 'phone', contact: 'phone', mobilenumber: 'phone',
    email: 'email', emailaddress: 'email',
    source: 'source', leadsource: 'source',
    status: 'status', leadstatus: 'status',
    project: 'project', projectname: 'project',
    enquirytype: 'enquiry_type', inquirytype: 'enquiry_type',
    location: 'location', city: 'location',
    notes: 'notes', note: 'notes', message: 'notes',
    date: 'date', createdat: 'date', created: 'date', leaddate: 'date',
  }
  const map: Partial<Record<number, ImportField>> = {}
  headers.forEach((h, i) => { const f = aliases[norm(h || '')]; if (f && !Object.values(map).includes(f)) map[i] = f })
  return map
}

/** Accepts an ISO date (Excel date cells), DD/MM/YYYY, DD-MM-YYYY or YYYY-MM-DD. Date-only → noon IST. */
export function parseImportDate(text: string | null | undefined): { ok: true; iso: string | null } | { ok: false; error: string } {
  const t = String(text || '').trim()
  if (!t) return { ok: true, iso: null }
  let y: number, m: number, d: number
  let match = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/)
  if (match) { y = +match[1]; m = +match[2]; d = +match[3] }
  else if ((match = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) { d = +match[1]; m = +match[2]; y = +match[3] }
  else return { ok: false, error: `Date "${t}" isn't valid. Use DD/MM/YYYY.` }
  const date = new Date(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00+05:30`)
  // Noon IST is 06:30 UTC, so the UTC day/month must match (catches 31/02 rolling into March)
  if (isNaN(date.getTime()) || date.getUTCDate() !== d || date.getUTCMonth() + 1 !== m) return { ok: false, error: `Date "${t}" isn't a real date.` }
  if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) return { ok: false, error: `Date "${t}" is in the future.` }
  return { ok: true, iso: date.toISOString() }
}

export interface ImportLists {
  sources: { key: string; name: string }[]
  statuses: { key: string; name: string }[]
  projects: { id: string; name: string }[]
  /** Modules → Enquiry Types (defaults when missing) */
  enquiryTypes?: string[]
}

export interface CleanImportRow {
  row: number
  name: string
  phone: string
  phoneKey: string
  email: string | null
  source: string
  status: string
  project: { id: string; name: string } | null
  enquiryType: string | null
  location: string | null
  notes: string
  createdAt: string | null
}

const byKeyOrName = <T extends { name: string }>(list: T[], v: string, key: (x: T) => string) =>
  list.find((x) => key(x).toLowerCase() === v.toLowerCase() || x.name.trim().toLowerCase() === v.toLowerCase())

/** Validates one row against the CRM's lists. Returns the clean row or the reasons it can't be imported. */
export function validateImportRow(r: ImportRow, lists: ImportLists): { ok: true; value: CleanImportRow } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const val = (f: ImportField) => String(r[f] ?? '').trim()

  const name = val('name')
  if (!name) errors.push('Name is missing')
  const phone = val('phone')
  const phoneKey = phoneMatchKey(phone)
  if (!phone) errors.push('Phone is missing')
  else if (!phoneKey) errors.push(`Phone "${phone}" isn't a valid number`)
  const email = val('email')
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`Email "${email}" isn't valid`)

  const sourceText = val('source')
  const source = sourceText ? byKeyOrName(lists.sources, sourceText, (s) => s.key) : undefined
  if (!sourceText) errors.push('Source is missing')
  else if (!source) errors.push(`Source "${sourceText}" isn't in the list`)

  const statusText = val('status')
  const status = statusText ? byKeyOrName(lists.statuses, statusText, (s) => s.key) : undefined
  if (statusText && !status) errors.push(`Status "${statusText}" isn't in the list`)

  const projectText = val('project')
  const project = projectText ? lists.projects.find((p) => p.name.trim().toLowerCase() === projectText.toLowerCase()) : undefined
  if (projectText && !project) errors.push(`Project "${projectText}" isn't on the Projects page`)

  const typeText = val('enquiry_type')
  const enquiryType = typeText ? (lists.enquiryTypes?.length ? lists.enquiryTypes : [...ENQUIRY_TYPES]).find((t) => t.toLowerCase() === typeText.toLowerCase()) : undefined
  if (typeText && !enquiryType) errors.push(`Enquiry Type "${typeText}" isn't in the list`)

  const date = parseImportDate(val('date'))
  if ('error' in date) errors.push(date.error)

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    value: {
      row: r.row,
      name: name.slice(0, 200),
      phone,
      phoneKey,
      email: email || null,
      source: source!.key,
      status: status?.key || 'new',
      project: project ? { id: project.id, name: project.name } : null,
      enquiryType: enquiryType || null,
      location: val('location').slice(0, 200) || null,
      notes: val('notes').slice(0, 2000),
      createdAt: 'iso' in date ? date.iso : null,
    },
  }
}
