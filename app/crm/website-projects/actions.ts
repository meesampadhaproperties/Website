'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { checkActionAccess } from '@/lib/auth/permissions'
import { getStorageLimitBytes } from '@/lib/site-config'
import {
  WEBSITE_MEDIA_BUCKET, WEBSITE_MAX_POINTS, WEBSITE_POINT_MAX_CHARS, WEBSITE_MAX_DOWNLOADS,
  WEBSITE_TITLE_MAX_CHARS, WEBSITE_LOCATION_MAX_CHARS, WEBSITE_MAX_TAGS, WEBSITE_TAG_MAX_CHARS, WEBSITE_MAP_URL_MAX_CHARS, WEBSITE_MAX_VIDEO_BYTES, websiteMediaUrl,
} from '@/lib/website-projects'

/**
 * Website Projects (REQ-109): categories (sorted by priority) and website project cards shown on the
 * public /projects page. Uses the 'projects' module permission. All DB/storage access is via the
 * service role AFTER checkActionAccess(); the tables have RLS on with no policies.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VIDEO_PREFIX = 'website-projects/'

export interface WebsiteCategory { id: string; name: string; priority: number }
export interface CrmProjectOption {
  id: string
  name: string
  documents: { id: string; name: string; doc_type: 'file' | 'link'; mime_type: string | null }[]
}
export interface WebsiteProjectRow {
  id: string
  category_id: string
  crm_project_id: string | null
  title: string
  location: string
  tags: string[]
  points: string[]
  video_url: string | null
  video_mime: string | null
  map_url: string | null
  is_published: boolean
  document_ids: string[]
  updated_at: string
}

type Result<T = {}> = { success: boolean; error?: string } & Partial<T>

const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

function revalidate() {
  revalidatePath('/crm/website-projects')
  revalidatePath('/projects')
}

function cleanPriority(v: unknown): number | null {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 1 && n <= 9999 ? n : null
}

function cleanHttpUrl(v: unknown): { ok: boolean; url: string | null } {
  const raw = String(v ?? '').trim()
  if (!raw) return { ok: true, url: null }
  try {
    const u = new URL(raw)
    // Only http(s): blocks javascript:, data:, etc.
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, url: null }
    return { ok: true, url: u.toString() }
  } catch {
    return { ok: false, url: null }
  }
}

const PROJECT_COLS = 'id, category_id, crm_project_id, title, location, tags, points, video_path, video_mime, map_url, is_published, updated_at, website_project_documents(document_id, sort_order)'

function toRow(db: any, p: any): WebsiteProjectRow {
  const links = ((p.website_project_documents || []) as any[]).sort((a, b) => a.sort_order - b.sort_order)
  return {
    id: p.id, category_id: p.category_id, crm_project_id: p.crm_project_id, title: p.title,
    location: p.location || '', tags: p.tags || [], points: p.points || [],
    video_url: websiteMediaUrl(db, p.video_path), video_mime: p.video_mime || null,
    map_url: p.map_url || null, is_published: !!p.is_published,
    document_ids: links.map(l => l.document_id), updated_at: p.updated_at,
  }
}

export async function getWebsiteProjectsWorkspace(): Promise<{
  categories: WebsiteCategory[]; projects: WebsiteProjectRow[]; crmProjects: CrmProjectOption[]; error: string | null
}> {
  const empty = { categories: [], projects: [], crmProjects: [] }
  const auth = await checkActionAccess('projects', 'view')
  if (!auth.authorized) return { ...empty, error: auth.error }

  try {
    const db = createServiceClient()
    const [catRes, projRes, crmRes, docsRes] = await Promise.all([
      db.from('website_project_categories').select('id, name, priority').order('priority', { ascending: true }).order('name', { ascending: true }),
      db.from('website_projects').select(PROJECT_COLS).order('created_at', { ascending: false }),
      db.from('projects').select('id, name').eq('kind', 'workspace').order('name', { ascending: true }),
      db.from('project_documents').select('id, project_id, name, doc_type, mime_type').order('created_at', { ascending: true }),
    ])
    const err = catRes.error || projRes.error || crmRes.error || docsRes.error
    if (err) return { ...empty, error: err.message }

    const docsByProject = new Map<string, CrmProjectOption['documents']>()
    for (const d of (docsRes.data || []) as any[]) {
      const list = docsByProject.get(d.project_id) || []
      list.push({ id: d.id, name: d.name, doc_type: d.doc_type, mime_type: d.mime_type })
      docsByProject.set(d.project_id, list)
    }

    return {
      categories: (catRes.data || []) as WebsiteCategory[],
      projects: (projRes.data || []).map((p: any) => toRow(db, p)),
      crmProjects: (crmRes.data || []).map((p: any) => ({ id: p.id, name: p.name, documents: docsByProject.get(p.id) || [] })),
      error: null,
    }
  } catch (e: any) {
    return { ...empty, error: e.message || 'Failed to load website projects' }
  }
}

// ---------------------------------------------------------------- Categories

export async function createWebsiteCategory(name: string, priority: number): Promise<Result<{ category: WebsiteCategory }>> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }

  const n = clean(name, 80)
  if (!n) return { success: false, error: 'Category name is required.' }
  const p = cleanPriority(priority)
  if (p === null) return { success: false, error: 'Priority must be a whole number from 1 to 9999.' }

  const { data, error } = await createServiceClient()
    .from('website_project_categories').insert({ name: n, priority: p }).select('id, name, priority').single()
  if (error) return { success: false, error: error.code === '23505' ? `Category "${n}" already exists.` : error.message }
  revalidate()
  return { success: true, category: data as WebsiteCategory }
}

export async function updateWebsiteCategory(id: string, name: string, priority: number): Promise<Result<{ category: WebsiteCategory }>> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: 'Invalid category.' }

  const n = clean(name, 80)
  if (!n) return { success: false, error: 'Category name is required.' }
  const p = cleanPriority(priority)
  if (p === null) return { success: false, error: 'Priority must be a whole number from 1 to 9999.' }

  const { data, error } = await createServiceClient()
    .from('website_project_categories').update({ name: n, priority: p }).eq('id', id).select('id, name, priority').single()
  if (error) return { success: false, error: error.code === '23505' ? `Category "${n}" already exists.` : error.message }
  revalidate()
  return { success: true, category: data as WebsiteCategory }
}

export async function deleteWebsiteCategory(id: string): Promise<Result> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: 'Invalid category.' }

  const { error } = await createServiceClient().from('website_project_categories').delete().eq('id', id)
  if (error) {
    return { success: false, error: error.code === '23503' ? 'This category still has projects. Move or delete them first.' : error.message }
  }
  revalidate()
  return { success: true }
}

// ---------------------------------------------------------------- Video upload

/** Step 1 of the video upload: validates and returns a one-time signed upload URL (browser uploads directly). */
export async function createWebsiteVideoUpload(input: { fileName: string; mimeType: string; sizeBytes: number }): Promise<Result<{ path: string; token: string }>> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }

  const mime = String(input.mimeType || '').toLowerCase()
  if (!mime.startsWith('video/')) return { success: false, error: 'Please choose a video file.' }
  if (!(input.sizeBytes > 0) || input.sizeBytes > WEBSITE_MAX_VIDEO_BYTES) return { success: false, error: 'The video must be 50 MB or smaller.' }

  const { data: usage } = await createServiceClient().rpc('crm_storage_usage')
  if (usage) {
    const used = (usage as { total_bytes: number | string }[]).reduce((s, r) => s + Number(r.total_bytes || 0), 0)
    if (used + input.sizeBytes > getStorageLimitBytes()) {
      return { success: false, error: 'Storage is full. Delete some files or upgrade the storage plan, then try again.' }
    }
  }

  const safeName = String(input.fileName || 'video').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-100) || 'video'
  const path = `${VIDEO_PREFIX}${randomUUID()}-${safeName}`
  const { data, error } = await createServiceClient().storage.from(WEBSITE_MEDIA_BUCKET).createSignedUploadUrl(path)
  if (error || !data) return { success: false, error: error?.message || 'Could not start the upload.' }
  return { success: true, path: data.path, token: data.token }
}

async function videoExists(db: any, path: string): Promise<boolean> {
  const key = path.slice(VIDEO_PREFIX.length)
  const { data } = await db.storage.from(WEBSITE_MEDIA_BUCKET).list(VIDEO_PREFIX.slice(0, -1), { search: key, limit: 1 })
  return !!data?.some((o: any) => o.name === key)
}

// ---------------------------------------------------------------- Website projects

export interface WebsiteProjectInput {
  id?: string | null
  categoryId: string
  crmProjectId: string | null
  title: string
  location: string
  tags: string[]
  points: string[]
  mapUrl: string
  isPublished: boolean
  documentIds: string[]
  /** A freshly uploaded video (from createWebsiteVideoUpload). Omit to keep the current one. */
  video?: { path: string; mimeType: string; sizeBytes: number } | null
  removeVideo?: boolean
}

const isOurVideoPath = (path: unknown) =>
  typeof path === 'string' && path.startsWith(VIDEO_PREFIX) && !path.includes('..') && !path.slice(VIDEO_PREFIX.length).includes('/')

/** Creates or updates a website project (fields, video, and the up-to-5 linked downloads). */
export async function saveWebsiteProject(input: WebsiteProjectInput): Promise<Result<{ project: WebsiteProjectRow }>> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }

  const db = createServiceClient()
  const res = await saveWebsiteProjectInner(db, auth.user.id, input)
  // A video uploaded for this save but not saved on any project would sit in storage forever: remove it
  const newPath = input.video?.path
  if (!res.success && isOurVideoPath(newPath)) {
    const { data: used } = await db.from('website_projects').select('id').eq('video_path', newPath).limit(1)
    if (!used || used.length === 0) await db.storage.from(WEBSITE_MEDIA_BUCKET).remove([newPath as string])
  }
  return res
}

async function saveWebsiteProjectInner(db: any, userId: string, input: WebsiteProjectInput): Promise<Result<{ project: WebsiteProjectRow }>> {
  const isEdit = !!input.id
  if (isEdit && !UUID_RE.test(String(input.id))) return { success: false, error: 'Invalid project.' }
  if (!UUID_RE.test(String(input.categoryId))) return { success: false, error: 'Choose a category.' }

  const title = clean(input.title, 1000)
  if (!title) return { success: false, error: 'Project title is required.' }
  if (title.length > WEBSITE_TITLE_MAX_CHARS) return { success: false, error: `Project title can be up to ${WEBSITE_TITLE_MAX_CHARS} characters.` }
  const location = clean(input.location, 1000)
  if (location.length > WEBSITE_LOCATION_MAX_CHARS) return { success: false, error: `Location line can be up to ${WEBSITE_LOCATION_MAX_CHARS} characters.` }
  const seenTags = new Set<string>()
  const tags = (input.tags || []).map(t => clean(t, 1000)).filter(t => t && !seenTags.has(t.toLowerCase()) && seenTags.add(t.toLowerCase()))
  if (tags.length > WEBSITE_MAX_TAGS) return { success: false, error: `Up to ${WEBSITE_MAX_TAGS} tags are allowed.` }
  if (tags.some(t => t.length > WEBSITE_TAG_MAX_CHARS)) return { success: false, error: `Each tag can be up to ${WEBSITE_TAG_MAX_CHARS} characters.` }
  if (String(input.mapUrl || '').trim().length > WEBSITE_MAP_URL_MAX_CHARS) return { success: false, error: `Location link can be up to ${WEBSITE_MAP_URL_MAX_CHARS} characters.` }
  const points = (input.points || []).map(p => clean(p, 1000)).filter(Boolean)
  if (points.some(p => p.length > WEBSITE_POINT_MAX_CHARS)) return { success: false, error: `Each point can be up to ${WEBSITE_POINT_MAX_CHARS} characters.` }
  if (points.length > WEBSITE_MAX_POINTS) return { success: false, error: `Up to ${WEBSITE_MAX_POINTS} points are allowed.` }
  const map = cleanHttpUrl(input.mapUrl)
  if (!map.ok) return { success: false, error: 'Location link must start with http:// or https://' }

  const crmProjectId = input.crmProjectId && UUID_RE.test(input.crmProjectId) ? input.crmProjectId : null
  const documentIds = Array.from(new Set((input.documentIds || []).filter(id => UUID_RE.test(id))))
  if (documentIds.length > WEBSITE_MAX_DOWNLOADS) return { success: false, error: `Up to ${WEBSITE_MAX_DOWNLOADS} downloads are allowed.` }
  if (documentIds.length > 0) {
    if (!crmProjectId) return { success: false, error: 'Choose the CRM project the documents come from.' }
    // Every picked document must belong to the chosen CRM project
    const { data: owned, error } = await db.from('project_documents').select('id').eq('project_id', crmProjectId).in('id', documentIds)
    if (error) return { success: false, error: error.message }
    if ((owned || []).length !== documentIds.length) return { success: false, error: 'Some documents no longer exist. Refresh and try again.' }
  }

  const { data: cat } = await db.from('website_project_categories').select('id').eq('id', input.categoryId).maybeSingle()
  if (!cat) return { success: false, error: 'That category no longer exists.' }

  // New video: it must already be uploaded, under our prefix
  const video = input.video || null
  if (video) {
    if (!isOurVideoPath(video.path)) return { success: false, error: 'Invalid video upload.' }
    if (!String(video.mimeType || '').toLowerCase().startsWith('video/')) return { success: false, error: 'Please choose a video file.' }
    // Never point at a video another project already uses (deleting one would delete the other's video)
    const { data: taken } = await db.from('website_projects').select('id').eq('video_path', video.path).limit(1)
    if (taken && taken.length > 0 && taken[0].id !== input.id) return { success: false, error: 'Invalid video upload.' }
    if (!(await videoExists(db, video.path))) return { success: false, error: 'The video upload was not found. Please try again.' }
  }

  let oldVideoPath: string | null = null
  if (isEdit) {
    const { data: existing } = await db.from('website_projects').select('video_path').eq('id', input.id).maybeSingle()
    if (!existing) return { success: false, error: 'Project not found.' }
    oldVideoPath = existing.video_path
  }

  const fields: Record<string, any> = {
    category_id: input.categoryId, crm_project_id: crmProjectId, title, location, tags, points,
    map_url: map.url, is_published: !!input.isPublished, updated_at: new Date().toISOString(),
  }
  if (video) Object.assign(fields, { video_path: video.path, video_mime: String(video.mimeType || '').toLowerCase() || null, video_size_bytes: Number(video.sizeBytes) || null })
  else if (input.removeVideo) Object.assign(fields, { video_path: null, video_mime: null, video_size_bytes: null })

  const write = isEdit
    ? db.from('website_projects').update(fields).eq('id', input.id).select('id').single()
    : db.from('website_projects').insert({ ...fields, created_by: userId }).select('id').single()
  const { data: saved, error: saveErr } = await write
  if (saveErr || !saved) return { success: false, error: saveErr?.message || 'Could not save the project.' }
  revalidate() // the project row changed: refresh the website even if a later step fails

  // Download links: upsert the picked ones (in pick order) FIRST, then drop the rest,
  // so a failure never leaves the project with no downloads
  if (documentIds.length > 0) {
    const { error: linkErr } = await db.from('website_project_documents')
      .upsert(documentIds.map((document_id, i) => ({ website_project_id: saved.id, document_id, sort_order: i })), { onConflict: 'website_project_id,document_id' })
    if (linkErr) return { success: false, error: `Saved, but the downloads could not be updated: ${linkErr.message}` }
  }
  let drop = db.from('website_project_documents').delete().eq('website_project_id', saved.id)
  if (documentIds.length > 0) drop = drop.not('document_id', 'in', `(${documentIds.join(',')})`)
  const { error: delErr } = await drop
  if (delErr) return { success: false, error: `Saved, but old downloads could not be removed: ${delErr.message}` }

  // The old video is no longer used
  if (oldVideoPath && (video || input.removeVideo) && oldVideoPath !== video?.path) {
    await db.storage.from(WEBSITE_MEDIA_BUCKET).remove([oldVideoPath])
  }

  const { data: row, error: readErr } = await db.from('website_projects').select(PROJECT_COLS).eq('id', saved.id).single()
  if (readErr || !row) return { success: false, error: readErr?.message || 'Saved, but could not reload the project.' }
  revalidate()
  return { success: true, project: toRow(db, row) }
}

export async function setWebsiteProjectPublished(id: string, isPublished: boolean): Promise<Result> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: 'Invalid project.' }

  const { error } = await createServiceClient().from('website_projects')
    .update({ is_published: !!isPublished, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidate()
  return { success: true }
}

export async function deleteWebsiteProject(id: string): Promise<Result> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: 'Invalid project.' }

  const db = createServiceClient()
  const { data: existing } = await db.from('website_projects').select('video_path').eq('id', id).maybeSingle()
  if (!existing) return { success: false, error: 'Project not found.' }
  // Download links cascade; the CRM documents themselves are NOT touched
  const { error } = await db.from('website_projects').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  if (existing.video_path) await db.storage.from(WEBSITE_MEDIA_BUCKET).remove([existing.video_path])
  revalidate()
  return { success: true }
}
