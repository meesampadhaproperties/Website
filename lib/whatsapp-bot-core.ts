/**
 * WhatsApp bot: the pure part (no database, no network). Safe to test on its own.
 * Rule-based and English only. Every step is a button or list tap, so the bot keeps no state:
 * the id of what the customer tapped says what to do next.
 *
 *   any message → Welcome (Explore projects · Contact us)
 *   Explore projects → list of published website projects (9 per page, "More projects" for the rest)
 *   a project → its details + its documents, then (More projects · Contact us · Main menu)
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const PROJECTS_PER_PAGE = 9 // a WhatsApp list holds 10 rows: 9 projects + one "More projects" row
export const MAX_DOCUMENTS = 5

export interface WaIncoming {
  id: string
  /** Sender's number, digits with country code (e.g. 918977036622) */
  from: string
  /** Name on their WhatsApp profile (may be empty) */
  name: string
  /** Unix seconds */
  timestamp: number
  type: string
  /** What they typed (empty for taps and media) */
  text: string
  /** Id of the button / list row they tapped, if any */
  actionId: string | null
  /** The label of that button / row */
  actionTitle: string
}

/** Pulls every customer message out of a WhatsApp webhook payload (ignores delivery receipts etc.). */
export function parseIncoming(body: any): WaIncoming[] {
  const out: WaIncoming[] = []
  if (!body || body.object !== 'whatsapp_business_account') return out
  for (const entry of Array.isArray(body.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== 'messages') continue
      const value = change.value || {}
      const names = new Map<string, string>()
      for (const c of Array.isArray(value.contacts) ? value.contacts : []) {
        if (c?.wa_id) names.set(String(c.wa_id), String(c?.profile?.name || '').trim())
      }
      for (const m of Array.isArray(value.messages) ? value.messages : []) {
        const id = String(m?.id || '')
        const from = String(m?.from || '').replace(/\D/g, '')
        if (!id || !from) continue
        const reply = m?.interactive?.button_reply || m?.interactive?.list_reply
        out.push({
          id, from,
          name: names.get(from) || '',
          timestamp: Number(m?.timestamp) || 0,
          type: String(m?.type || ''),
          text: m?.type === 'text' ? String(m?.text?.body || '').trim() : '',
          actionId: reply?.id ? String(reply.id) : null,
          actionTitle: reply?.title ? String(reply.title) : '',
        })
      }
    }
  }
  return out
}

export type BotAction =
  | { kind: 'welcome' }
  | { kind: 'explore'; page: number }
  | { kind: 'project'; id: string }
  | { kind: 'contact' }

/** What the bot should do for a message. Anything that is not a known button tap shows the welcome menu. */
export function routeAction(m: Pick<WaIncoming, 'actionId'>): BotAction {
  const id = m.actionId || ''
  if (id === 'explore') return { kind: 'explore', page: 1 }
  if (id === 'contact') return { kind: 'contact' }
  const page = /^page:(\d{1,3})$/.exec(id)
  if (page) return { kind: 'explore', page: Math.max(1, Number(page[1])) }
  const proj = /^proj:([0-9a-f-]{36})$/i.exec(id)
  if (proj && UUID_RE.test(proj[1])) return { kind: 'project', id: proj[1].toLowerCase() }
  return { kind: 'welcome' } // "menu", text, media, anything unknown
}

/** Cuts text to WhatsApp's limit, adding … when shortened. */
export function clip(text: string, max: number): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

export interface ProjectLite { id: string; title: string; location?: string | null }

/** One page of the project list as WhatsApp list rows (max 10), with a "More projects" row when there are more. */
export function projectRows(projects: ProjectLite[], page: number): { rows: { id: string; title: string; description?: string }[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(projects.length / PROJECTS_PER_PAGE))
  const p = Math.min(Math.max(1, page), pages)
  const slice = projects.slice((p - 1) * PROJECTS_PER_PAGE, p * PROJECTS_PER_PAGE)
  const rows = slice.map((x) => ({
    id: `proj:${x.id}`,
    title: clip(x.title, 24) || 'Project',
    ...(x.location ? { description: clip(x.location, 72) } : {}),
  }))
  if (p < pages) rows.push({ id: `page:${p + 1}`, title: 'More projects', description: `Page ${p + 1} of ${pages}` })
  return { rows, page: p, pages }
}

export interface ProjectDetail {
  title: string
  location?: string | null
  tags?: string[] | null
  points?: string[] | null
  mapUrl?: string | null
  videoUrl?: string | null
}

/** The project summary message (plain WhatsApp text, *bold* title). */
export function projectText(p: ProjectDetail): string {
  const lines: string[] = [`*${clip(p.title, 100)}*`]
  if (p.location) lines.push(`📍 ${clip(p.location, 100)}`)
  const tags = (p.tags || []).filter(Boolean)
  if (tags.length) lines.push(tags.join(' · '))
  const points = (p.points || []).filter(Boolean).slice(0, 6)
  if (points.length) lines.push('', ...points.map((x) => `• ${clip(x, 80)}`))
  if (p.mapUrl) lines.push('', `Location map: ${p.mapUrl}`)
  if (p.videoUrl) lines.push(`Watch the video: ${p.videoUrl}`)
  return lines.join('\n')
}

/** A safe file name for a document sent on WhatsApp. */
export function documentFileName(name: string, storagePath?: string | null): string {
  const ext = (String(storagePath || '').match(/\.[a-z0-9]{1,8}$/i)?.[0] || '.pdf').toLowerCase()
  const base = String(name || 'document').replace(/[^\w .()-]+/g, '').replace(/^[.\s]+/, '').trim().slice(0, 80) || 'document'
  return base.toLowerCase().endsWith(ext) ? base : `${base}${ext}`
}

/** Messages older than this are ignored (Meta can re-deliver old events; replying to them would confuse people). */
export const MAX_MESSAGE_AGE_SECONDS = 60 * 60
