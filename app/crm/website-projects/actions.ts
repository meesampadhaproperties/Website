'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { checkActionAccess } from '@/lib/auth/permissions'
import { getStorageLimitBytes } from '@/lib/site-config'
import { parseYouTubeId } from '@/lib/youtube'
import {
  WEBSITE_MEDIA_BUCKET, WEBSITE_MAX_POINTS, WEBSITE_POINT_MAX_CHARS, WEBSITE_MAX_DOWNLOADS,
  WEBSITE_TITLE_MAX_CHARS, WEBSITE_LOCATION_MAX_CHARS, WEBSITE_MAX_TAGS, WEBSITE_TAG_MAX_CHARS, WEBSITE_MAP_URL_MAX_CHARS, WEBSITE_MAX_VIDEO_BYTES, WEBSITE_VIDEO_MIME, isWebsiteDownloadable, websiteMediaUrl,
  WEBSITE_GALLERY_BUCKET, WEBSITE_GALLERY_MAX_IMAGES, WEBSITE_GALLERY_MAX_BYTES, WEBSITE_GALLERY_MIMES, WEBSITE_REVIEW_TITLE_MAX_CHARS, WEBSITE_TESTIMONIAL_TITLE_MAX_CHARS, WEBSITE_PROJECT_EXTRA_VIDEOS_MAX, websiteGalleryUrl,
} from '@/lib/website-projects'

/**
 * Website Projects (REQ-109): categories (sorted by priority) and website project cards shown on the
 * public /projects page. Uses the 'projects' module permission. All DB/storage access is via the
 * service role AFTER checkActionAccess(); the tables have RLS on with no policies.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VIDEO_PREFIX = 'website-projects/'
const GALLERY_PREFIX = 'gallery/'
const TESTIMONIAL_PREFIX = 'testimonials/'
const PROJECT_VIDEO_PREFIX = 'project-videos/'

export interface WebsiteCategory { id: string; name: string; priority: number }
export interface CrmProjectOption {
  id: string
  name: string
  documents: { id: string; name: string; doc_type: 'file' | 'link'; mime_type: string | null; size_bytes: number | null }[]
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
  youtube_id: string | null
  images: GalleryImage[]
  extra_videos: ExtraVideo[]
  map_url: string | null
  is_published: boolean
  document_ids: string[]
  updated_at: string
}

export interface GalleryImage { id: string; url: string; thumb_url: string }
export interface ExtraVideo { id: string; youtube_id: string | null; video_url: string | null }
export interface WebsiteTestimonialRow { id: string; title: string; youtube_id: string | null; video_url: string | null; is_published: boolean; created_at: string }
export interface WebsiteReviewRow { id: string; title: string; youtube_id: string; is_published: boolean; created_at: string }

type Result<T = {}> = { success: boolean; error?: string } & Partial<T>

const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

function revalidate() {
  revalidatePath('/crm/website-projects')
  revalidatePath('/projects')
  revalidatePath('/gallery')
  revalidatePath('/reviews')
  revalidatePath('/')
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

const PROJECT_COLS = 'id, category_id, crm_project_id, title, location, tags, points, video_path, video_mime, youtube_id, map_url, is_published, updated_at, website_project_documents(document_id, sort_order), website_gallery_images(id, storage_path, thumb_path, sort_order, created_at), website_project_videos(id, youtube_id, video_path, sort_order, created_at)'

function toGalleryImage(db: any, i: any): GalleryImage {
  const url = websiteGalleryUrl(db, i.storage_path) as string
  return { id: i.id, url, thumb_url: (websiteGalleryUrl(db, i.thumb_path) || url) as string }
}

function toTestimonial(db: any, t: any): WebsiteTestimonialRow {
  return { id: t.id, title: t.title, youtube_id: t.youtube_id || null, video_url: websiteMediaUrl(db, t.video_path), is_published: !!t.is_published, created_at: t.created_at }
}

function toRow(db: any, p: any): WebsiteProjectRow {
  const links = ((p.website_project_documents || []) as any[]).sort((a, b) => a.sort_order - b.sort_order)
  return {
    id: p.id, category_id: p.category_id, crm_project_id: p.crm_project_id, title: p.title,
    location: p.location || '', tags: p.tags || [], points: p.points || [],
    video_url: websiteMediaUrl(db, p.video_path), video_mime: p.video_mime || null, youtube_id: p.youtube_id || null,
    images: ((p.website_gallery_images || []) as any[])
      .sort((a, b) => a.sort_order - b.sort_order || String(a.created_at).localeCompare(String(b.created_at)))
      .map(i => toGalleryImage(db, i)).filter(i => !!i.url),
    extra_videos: ((p.website_project_videos || []) as any[])
      .sort((a, b) => a.sort_order - b.sort_order || String(a.created_at).localeCompare(String(b.created_at)))
      .map(v => ({ id: v.id, youtube_id: v.youtube_id || null, video_url: websiteMediaUrl(db, v.video_path) })),
    map_url: p.map_url || null, is_published: !!p.is_published,
    document_ids: links.map(l => l.document_id), updated_at: p.updated_at,
  }
}

export async function getWebsiteProjectsWorkspace(): Promise<{
  categories: WebsiteCategory[]; projects: WebsiteProjectRow[]; crmProjects: CrmProjectOption[]; reviews: WebsiteReviewRow[]; testimonials: WebsiteTestimonialRow[]; error: string | null
}> {
  const empty = { categories: [], projects: [], crmProjects: [], reviews: [], testimonials: [] }
  const auth = await checkActionAccess('projects', 'view')
  if (!auth.authorized) return { ...empty, error: auth.error }

  try {
    const db = createServiceClient()
    const [catRes, projRes, crmRes, docsRes, revRes, testRes] = await Promise.all([
      db.from('website_project_categories').select('id, name, priority').order('priority', { ascending: true }).order('name', { ascending: true }),
      db.from('website_projects').select(PROJECT_COLS).order('created_at', { ascending: false }),
      db.from('projects').select('id, name').eq('kind', 'workspace').order('name', { ascending: true }),
      db.from('project_documents').select('id, project_id, name, doc_type, mime_type, size_bytes').order('created_at', { ascending: true }),
      db.from('website_reviews').select('id, title, youtube_id, is_published, created_at').order('created_at', { ascending: false }),
      db.from('website_testimonials').select('id, title, youtube_id, video_path, is_published, created_at').order('created_at', { ascending: true }),
    ])
    const err = catRes.error || projRes.error || crmRes.error || docsRes.error || revRes.error || testRes.error
    if (err) return { ...empty, error: err.message }

    const docsByProject = new Map<string, CrmProjectOption['documents']>()
    for (const d of (docsRes.data || []) as any[]) {
      const list = docsByProject.get(d.project_id) || []
      list.push({ id: d.id, name: d.name, doc_type: d.doc_type, mime_type: d.mime_type, size_bytes: d.size_bytes })
      docsByProject.set(d.project_id, list)
    }

    return {
      categories: (catRes.data || []) as WebsiteCategory[],
      projects: (projRes.data || []).map((p: any) => toRow(db, p)),
      crmProjects: (crmRes.data || []).map((p: any) => ({ id: p.id, name: p.name, documents: docsByProject.get(p.id) || [] })),
      reviews: (revRes.data || []) as WebsiteReviewRow[],
      testimonials: (testRes.data || []).map((t: any) => toTestimonial(db, t)),
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
  return startVideoUpload(VIDEO_PREFIX, input)
}

/** Same rules (MP4, 45 MB, storage not full) for a testimonial video, stored under testimonials/. */
export async function createWebsiteTestimonialVideoUpload(input: { fileName: string; mimeType: string; sizeBytes: number }): Promise<Result<{ path: string; token: string }>> {
  return startVideoUpload(TESTIMONIAL_PREFIX, input)
}

async function startVideoUpload(prefix: string, input: { fileName: string; mimeType: string; sizeBytes: number }): Promise<Result<{ path: string; token: string }>> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }

  const mime = String(input.mimeType || '').toLowerCase()
  if (mime !== WEBSITE_VIDEO_MIME || !/\.mp4$/i.test(String(input.fileName || ''))) return { success: false, error: 'Only MP4 videos are allowed.' }
  if (!(input.sizeBytes > 0) || input.sizeBytes > WEBSITE_MAX_VIDEO_BYTES) return { success: false, error: 'The video must be 45 MB or smaller.' }

  const { data: usage } = await createServiceClient().rpc('crm_storage_usage')
  if (usage) {
    const used = (usage as { total_bytes: number | string }[]).reduce((s, r) => s + Number(r.total_bytes || 0), 0)
    if (used + input.sizeBytes > getStorageLimitBytes()) {
      return { success: false, error: 'Storage is full. Delete some files or upgrade the storage plan, then try again.' }
    }
  }

  const safeName = String(input.fileName || 'video').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-100) || 'video'
  const path = `${prefix}${randomUUID()}-${safeName}`
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
  /** YouTube link instead of an uploaded video. undefined = keep, '' = clear. */
  youtubeUrl?: string
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
    const { data: owned, error } = await db.from('project_documents').select('id, doc_type, mime_type, size_bytes').eq('project_id', crmProjectId).in('id', documentIds)
    if (error) return { success: false, error: error.message }
    if ((owned || []).length !== documentIds.length) return { success: false, error: 'Some documents no longer exist. Refresh and try again.' }
    if ((owned || []).some((d: any) => !isWebsiteDownloadable(d))) return { success: false, error: 'Downloads must be PDF files of 25 MB or less.' }
  }

  const { data: cat } = await db.from('website_project_categories').select('id').eq('id', input.categoryId).maybeSingle()
  if (!cat) return { success: false, error: 'That category no longer exists.' }

  // YouTube link (instead of an uploaded video): store only the 11-character id
  let ytId: string | null | undefined
  if (input.youtubeUrl !== undefined) {
    const raw = String(input.youtubeUrl || '').trim()
    if (!raw) ytId = null
    else {
      ytId = parseYouTubeId(raw)
      if (!ytId) return { success: false, error: 'Enter a valid YouTube video link.' }
    }
  }
  if (ytId && input.video) return { success: false, error: 'Choose either an uploaded video or a YouTube link, not both.' }

  // New video: it must already be uploaded, under our prefix
  const video = input.video || null
  if (video) {
    if (!isOurVideoPath(video.path)) return { success: false, error: 'Invalid video upload.' }
    if (String(video.mimeType || '').toLowerCase() !== WEBSITE_VIDEO_MIME || !/\.mp4$/i.test(video.path)) return { success: false, error: 'Only MP4 videos are allowed.' }
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
  else if (input.removeVideo || ytId) Object.assign(fields, { video_path: null, video_mime: null, video_size_bytes: null })
  if (ytId !== undefined) fields.youtube_id = ytId
  if (video) fields.youtube_id = null // an uploaded video replaces a YouTube link

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
  if (oldVideoPath && (video || input.removeVideo || ytId) && oldVideoPath !== video?.path) {
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
  const { data: pics } = await db.from('website_gallery_images').select('storage_path, thumb_path').eq('website_project_id', id)
  const { data: moreVideos } = await db.from('website_project_videos').select('video_path').eq('website_project_id', id)
  // Download links and picture rows cascade; the CRM documents themselves are NOT touched
  const { error } = await db.from('website_projects').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  if (existing.video_path) await db.storage.from(WEBSITE_MEDIA_BUCKET).remove([existing.video_path])
  const picPaths = ((pics || []) as any[]).flatMap(p => [p.storage_path, p.thumb_path]).filter(Boolean)
  if (picPaths.length > 0) await db.storage.from(WEBSITE_GALLERY_BUCKET).remove(picPaths)
  const videoPaths = ((moreVideos || []) as any[]).map(v => v.video_path).filter(Boolean)
  if (videoPaths.length > 0) await db.storage.from(WEBSITE_MEDIA_BUCKET).remove(videoPaths)
  revalidate()
  return { success: true }
}

// ---------------------------------------------------------------- Gallery pictures

const isOurGalleryPath = (path: unknown, projectId: string) =>
  typeof path === 'string' && path.startsWith(`${GALLERY_PREFIX}${projectId}/`) && !path.includes('..') && !path.slice(`${GALLERY_PREFIX}${projectId}/`.length).includes('/')

/** Step 1 of a picture upload: validates and returns a one-time signed upload URL (the browser uploads directly). */
/** The small copy of a picture lives next to it: gallery/<project>/<id>.jpg → gallery/<project>/<id>-t.jpg */
const thumbPathOf = (path: string) => path.replace(/\.[a-z]+$/i, '-t.jpg')

export async function createWebsiteGalleryUpload(input: { projectId: string; fileName: string; mimeType: string; sizeBytes: number; /** set to the full picture's path to upload its small thumbnail instead */ thumbOf?: string }): Promise<Result<{ path: string; token: string }>> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(input.projectId)) return { success: false, error: 'Invalid project.' }

  const mime = String(input.mimeType || '').toLowerCase()
  if (!WEBSITE_GALLERY_MIMES.includes(mime)) return { success: false, error: 'Pictures must be JPG, PNG or WebP.' }
  if (!(input.sizeBytes > 0) || input.sizeBytes > WEBSITE_GALLERY_MAX_BYTES) return { success: false, error: 'Each picture must be 5 MB or smaller.' }

  const db = createServiceClient()
  const { data: proj } = await db.from('website_projects').select('id').eq('id', input.projectId).maybeSingle()
  if (!proj) return { success: false, error: 'Project not found.' }

  const { data: usage } = await db.rpc('crm_storage_usage')
  if (usage) {
    const used = (usage as { total_bytes: number | string }[]).reduce((s, r) => s + Number(r.total_bytes || 0), 0)
    if (used + input.sizeBytes > getStorageLimitBytes()) return { success: false, error: 'Storage is full. Delete some files or upgrade the storage plan, then try again.' }
  }

  if (input.thumbOf !== undefined && (!isOurGalleryPath(input.thumbOf, input.projectId) || mime !== 'image/jpeg')) return { success: false, error: 'Invalid thumbnail upload.' }
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
  const path = input.thumbOf !== undefined ? thumbPathOf(input.thumbOf) : `${GALLERY_PREFIX}${input.projectId}/${randomUUID()}.${ext}`
  const { data, error } = await db.storage.from(WEBSITE_GALLERY_BUCKET).createSignedUploadUrl(path)
  if (error || !data) return { success: false, error: error?.message || 'Could not start the upload.' }
  return { success: true, path: data.path, token: data.token }
}

/** Step 2: records pictures that were uploaded with createWebsiteGalleryUpload. Returns the project's full picture list. */
export async function addWebsiteGalleryImages(projectId: string, items: { path: string; thumbPath?: string | null; mimeType: string; sizeBytes: number }[]): Promise<Result<{ images: GalleryImage[] }>> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(projectId)) return { success: false, error: 'Invalid project.' }
  const list = Array.isArray(items) ? items : []
  const db = createServiceClient()

  const cleanup = async (paths: string[]) => { if (paths.length) await db.storage.from(WEBSITE_GALLERY_BUCKET).remove(paths.filter(p => isOurGalleryPath(p, projectId))) }
  const fail = async (error: string): Promise<Result<{ images: GalleryImage[] }>> => { await cleanup(list.flatMap(i => [i?.path, i?.thumbPath || ''])); return { success: false, error } }

  if (list.length === 0) return { success: false, error: 'No pictures to add.' }
  if (list.some(i => !isOurGalleryPath(i?.path, projectId) || !WEBSITE_GALLERY_MIMES.includes(String(i?.mimeType || '').toLowerCase()))) return fail('Invalid picture upload.')
  // A thumbnail must be exactly the one made for that picture
  if (list.some(i => i.thumbPath && i.thumbPath !== thumbPathOf(i.path))) return fail('Invalid picture upload.')

  const { data: existing, error: exErr } = await db.from('website_gallery_images').select('id, sort_order').eq('website_project_id', projectId)
  if (exErr) return fail(exErr.message)
  if ((existing || []).length + list.length > WEBSITE_GALLERY_MAX_IMAGES) return fail(`A project can have up to ${WEBSITE_GALLERY_MAX_IMAGES} pictures.`)

  // Every file must really be in storage
  const { data: found } = await db.storage.from(WEBSITE_GALLERY_BUCKET).list(`${GALLERY_PREFIX}${projectId}`, { limit: 100 })
  const have = new Set((found || []).map((o: any) => o.name))
  if (list.some(i => !have.has(i.path.split('/').pop() as string))) return fail('A picture upload was not found. Please try again.')
  // A missing thumbnail is not an error: that picture simply uses its full file in the grid
  const withThumb = (i: { path: string; thumbPath?: string | null }) => (i.thumbPath && have.has(i.thumbPath.split('/').pop() as string) ? i.thumbPath : null)

  const start = (existing || []).reduce((m: number, r: any) => Math.max(m, r.sort_order), -1) + 1
  const { error } = await db.from('website_gallery_images').insert(list.map((i, n) => ({
    website_project_id: projectId, storage_path: i.path, thumb_path: withThumb(i), mime_type: String(i.mimeType).toLowerCase(),
    size_bytes: Number(i.sizeBytes) || null, sort_order: start + n,
  })))
  if (error) return fail(error.message)

  revalidate()
  const { data: all } = await db.from('website_gallery_images').select('id, storage_path, thumb_path, sort_order, created_at').eq('website_project_id', projectId)
  const images = ((all || []) as any[]).sort((a, b) => a.sort_order - b.sort_order)
    .map(i => toGalleryImage(db, i)).filter(i => !!i.url)
  return { success: true, images }
}

export async function deleteWebsiteGalleryImage(id: string): Promise<Result> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: 'Invalid picture.' }

  const db = createServiceClient()
  const { data: img } = await db.from('website_gallery_images').select('storage_path, thumb_path').eq('id', id).maybeSingle()
  if (!img) return { success: false, error: 'Picture not found.' }
  const { error } = await db.from('website_gallery_images').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  await db.storage.from(WEBSITE_GALLERY_BUCKET).remove([img.storage_path, img.thumb_path].filter(Boolean))
  revalidate()
  return { success: true }
}

// ---------------------------------------------------------------- Reviews (YouTube)

// Flat shape (tsconfig is non-strict, so discriminated unions do not narrow): check `ok` first.
function cleanReview(title: unknown, url: unknown): { ok: boolean; error?: string; title?: string; id?: string } {
  const t = clean(title, 1000)
  if (!t) return { ok: false, error: 'Review title is required.' }
  if (t.length > WEBSITE_REVIEW_TITLE_MAX_CHARS) return { ok: false, error: `Review title can be up to ${WEBSITE_REVIEW_TITLE_MAX_CHARS} characters.` }
  const id = parseYouTubeId(String(url ?? ''))
  if (!id) return { ok: false, error: 'Enter a valid YouTube video link (youtube.com/watch, youtu.be or Shorts).' }
  return { ok: true, title: t, id }
}

export async function createWebsiteReview(input: { title: string; url: string }): Promise<Result<{ review: WebsiteReviewRow }>> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  const v = cleanReview(input.title, input.url)
  if (!v.ok) return { success: false, error: v.error }

  const { data, error } = await createServiceClient().from('website_reviews')
    .insert({ title: v.title, youtube_id: v.id, created_by: auth.user.id }).select('id, title, youtube_id, is_published, created_at').single()
  if (error) return { success: false, error: error.message }
  revalidate()
  return { success: true, review: data as WebsiteReviewRow }
}

export async function updateWebsiteReview(id: string, input: { title: string; url: string }): Promise<Result<{ review: WebsiteReviewRow }>> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: 'Invalid review.' }
  const v = cleanReview(input.title, input.url)
  if (!v.ok) return { success: false, error: v.error }

  const { data, error } = await createServiceClient().from('website_reviews')
    .update({ title: v.title, youtube_id: v.id, updated_at: new Date().toISOString() }).eq('id', id)
    .select('id, title, youtube_id, is_published, created_at').single()
  if (error) return { success: false, error: error.message }
  revalidate()
  return { success: true, review: data as WebsiteReviewRow }
}

export async function setWebsiteReviewPublished(id: string, isPublished: boolean): Promise<Result> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: 'Invalid review.' }
  const { error } = await createServiceClient().from('website_reviews')
    .update({ is_published: !!isPublished, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidate()
  return { success: true }
}

export async function deleteWebsiteReview(id: string): Promise<Result> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: 'Invalid review.' }
  const { error } = await createServiceClient().from('website_reviews').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidate()
  return { success: true }
}

// ---------------------------------------------------------------- Testimonials (home page)

const isOurTestimonialPath = (path: unknown) =>
  typeof path === 'string' && path.startsWith(TESTIMONIAL_PREFIX) && !path.includes('..') && !path.slice(TESTIMONIAL_PREFIX.length).includes('/')

export interface WebsiteTestimonialInput {
  id?: string | null
  title: string
  /** Where the video comes from: a YouTube link, or an uploaded MP4 */
  source: 'youtube' | 'video'
  youtubeUrl?: string
  /** A freshly uploaded MP4 (from createWebsiteTestimonialVideoUpload). Omit to keep the current one. */
  video?: { path: string; mimeType: string; sizeBytes: number } | null
}

const TESTIMONIAL_COLS = 'id, title, youtube_id, video_path, is_published, created_at'

/** Creates or updates a testimonial: a title plus EITHER a YouTube link OR an MP4. */
export async function saveWebsiteTestimonial(input: WebsiteTestimonialInput): Promise<Result<{ testimonial: WebsiteTestimonialRow }>> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }

  const db = createServiceClient()
  const res = await saveTestimonialInner(db, auth.user.id, input)
  // A video uploaded for this save but not kept on any testimonial would sit in storage forever: remove it
  const newPath = input.video?.path
  if (!res.success && isOurTestimonialPath(newPath)) {
    const { data: used } = await db.from('website_testimonials').select('id').eq('video_path', newPath).limit(1)
    if (!used || used.length === 0) await db.storage.from(WEBSITE_MEDIA_BUCKET).remove([newPath as string])
  }
  return res
}

async function saveTestimonialInner(db: any, userId: string, input: WebsiteTestimonialInput): Promise<Result<{ testimonial: WebsiteTestimonialRow }>> {
  const isEdit = !!input.id
  if (isEdit && !UUID_RE.test(String(input.id))) return { success: false, error: 'Invalid testimonial.' }

  const title = clean(input.title, 1000)
  if (!title) return { success: false, error: 'Testimonial title is required.' }
  if (title.length > WEBSITE_TESTIMONIAL_TITLE_MAX_CHARS) return { success: false, error: `Title can be up to ${WEBSITE_TESTIMONIAL_TITLE_MAX_CHARS} characters.` }

  let existingPath: string | null = null
  if (isEdit) {
    const { data: existing } = await db.from('website_testimonials').select('video_path').eq('id', input.id).maybeSingle()
    if (!existing) return { success: false, error: 'Testimonial not found.' }
    existingPath = existing.video_path
  }

  const fields: Record<string, any> = { title, updated_at: new Date().toISOString() }
  let removeOld = false

  if (input.source === 'youtube') {
    if (input.video) return { success: false, error: 'Choose either a YouTube link or an uploaded video, not both.' }
    const id = parseYouTubeId(String(input.youtubeUrl || ''))
    if (!id) return { success: false, error: 'Enter a valid YouTube video link.' }
    Object.assign(fields, { youtube_id: id, video_path: null, video_mime: null, video_size_bytes: null })
    removeOld = !!existingPath // switching to YouTube frees the uploaded file
  } else if (input.source === 'video') {
    const v = input.video
    if (v) {
      if (!isOurTestimonialPath(v.path) || String(v.mimeType || '').toLowerCase() !== WEBSITE_VIDEO_MIME || !/\.mp4$/i.test(v.path)) return { success: false, error: 'Only MP4 videos are allowed.' }
      const { data: taken } = await db.from('website_testimonials').select('id').eq('video_path', v.path).limit(1)
      if (taken && taken.length > 0 && taken[0].id !== input.id) return { success: false, error: 'Invalid video upload.' }
      const key = v.path.slice(TESTIMONIAL_PREFIX.length)
      const { data: found } = await db.storage.from(WEBSITE_MEDIA_BUCKET).list(TESTIMONIAL_PREFIX.slice(0, -1), { search: key, limit: 1 })
      if (!found?.some((o: any) => o.name === key)) return { success: false, error: 'The video upload was not found. Please try again.' }
      Object.assign(fields, { video_path: v.path, video_mime: WEBSITE_VIDEO_MIME, video_size_bytes: Number(v.sizeBytes) || null, youtube_id: null })
      removeOld = !!existingPath && existingPath !== v.path
    } else if (existingPath) {
      fields.youtube_id = null // keep the current MP4
    } else {
      return { success: false, error: 'Choose an MP4 video to upload.' }
    }
  } else {
    return { success: false, error: 'Choose a YouTube link or a video.' }
  }

  const write = isEdit
    ? db.from('website_testimonials').update(fields).eq('id', input.id).select(TESTIMONIAL_COLS).single()
    : db.from('website_testimonials').insert({ ...fields, created_by: userId }).select(TESTIMONIAL_COLS).single()
  const { data: row, error } = await write
  if (error || !row) return { success: false, error: error?.message || 'Could not save the testimonial.' }

  if (removeOld && existingPath) await db.storage.from(WEBSITE_MEDIA_BUCKET).remove([existingPath])
  revalidate()
  return { success: true, testimonial: toTestimonial(db, row) }
}

export async function setWebsiteTestimonialPublished(id: string, isPublished: boolean): Promise<Result> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: 'Invalid testimonial.' }
  const { error } = await createServiceClient().from('website_testimonials')
    .update({ is_published: !!isPublished, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidate()
  return { success: true }
}

export async function deleteWebsiteTestimonial(id: string): Promise<Result> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: 'Invalid testimonial.' }
  const db = createServiceClient()
  const { data: existing } = await db.from('website_testimonials').select('video_path').eq('id', id).maybeSingle()
  if (!existing) return { success: false, error: 'Testimonial not found.' }
  const { error } = await db.from('website_testimonials').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  if (existing.video_path) await db.storage.from(WEBSITE_MEDIA_BUCKET).remove([existing.video_path])
  revalidate()
  return { success: true }
}

// ---------------------------------------------------------------- More videos per project (Gallery page)

const isOurProjectVideoPath = (path: unknown, projectId: string) =>
  typeof path === 'string' && path.startsWith(`${PROJECT_VIDEO_PREFIX}${projectId}/`) && !path.includes('..') && !path.slice(`${PROJECT_VIDEO_PREFIX}${projectId}/`.length).includes('/')

/** Signed upload URL for one more MP4 on a project (same rules: MP4 only, 45 MB, storage not full). */
export async function createWebsiteProjectVideoUpload(input: { projectId: string; fileName: string; mimeType: string; sizeBytes: number }): Promise<Result<{ path: string; token: string }>> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(input.projectId)) return { success: false, error: 'Invalid project.' }
  const { data: proj } = await createServiceClient().from('website_projects').select('id').eq('id', input.projectId).maybeSingle()
  if (!proj) return { success: false, error: 'Project not found.' }
  return startVideoUpload(`${PROJECT_VIDEO_PREFIX}${input.projectId}/`, input)
}

export interface ExtraVideoInput {
  /** A YouTube link … */
  youtubeUrl?: string
  /** … or a freshly uploaded MP4 (from createWebsiteProjectVideoUpload) */
  path?: string
  mimeType?: string
  sizeBytes?: number
}

/** Adds extra videos (YouTube links and/or uploaded MP4s) to a project. Returns the project's full extra-video list. */
export async function addWebsiteProjectVideos(projectId: string, items: ExtraVideoInput[]): Promise<Result<{ videos: ExtraVideo[] }>> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(projectId)) return { success: false, error: 'Invalid project.' }
  const list = Array.isArray(items) ? items : []
  const db = createServiceClient()

  const fail = async (error: string): Promise<Result<{ videos: ExtraVideo[] }>> => {
    const paths = list.map(i => i?.path).filter((p): p is string => isOurProjectVideoPath(p, projectId))
    if (paths.length) await db.storage.from(WEBSITE_MEDIA_BUCKET).remove(paths)
    return { success: false, error }
  }

  if (list.length === 0) return { success: false, error: 'No videos to add.' }
  const rows: Record<string, any>[] = []
  const seenYt = new Set<string>()
  for (const i of list) {
    if (i.path) {
      if (i.youtubeUrl) return fail('Each video is either a YouTube link or an MP4, not both.')
      if (!isOurProjectVideoPath(i.path, projectId) || String(i.mimeType || '').toLowerCase() !== WEBSITE_VIDEO_MIME || !/\.mp4$/i.test(i.path)) return fail('Only MP4 videos are allowed.')
      rows.push({ video_path: i.path, video_mime: WEBSITE_VIDEO_MIME, video_size_bytes: Number(i.sizeBytes) || null, youtube_id: null })
    } else {
      const id = parseYouTubeId(String(i.youtubeUrl || ''))
      if (!id) return fail('Enter a valid YouTube video link.')
      if (seenYt.has(id)) continue // the same link twice in one go: keep one
      seenYt.add(id)
      rows.push({ youtube_id: id, video_path: null, video_mime: null, video_size_bytes: null })
    }
  }

  const { data: existing, error: exErr } = await db.from('website_project_videos').select('id, sort_order, youtube_id').eq('website_project_id', projectId)
  if (exErr) return fail(exErr.message)
  const have = new Set(((existing || []) as any[]).map(e => e.youtube_id).filter(Boolean))
  const fresh = rows.filter(r => !r.youtube_id || !have.has(r.youtube_id)) // a YouTube link already on this project is skipped
  if ((existing || []).length + fresh.length > WEBSITE_PROJECT_EXTRA_VIDEOS_MAX) return fail(`A project can have up to ${WEBSITE_PROJECT_EXTRA_VIDEOS_MAX} extra videos.`)

  // Every uploaded MP4 must really be in storage
  const mp4s = fresh.filter(r => r.video_path)
  if (mp4s.length > 0) {
    const { data: found } = await db.storage.from(WEBSITE_MEDIA_BUCKET).list(`${PROJECT_VIDEO_PREFIX}${projectId}`, { limit: 100 })
    const names = new Set((found || []).map((o: any) => o.name))
    if (mp4s.some(r => !names.has((r.video_path as string).split('/').pop() as string))) return fail('A video upload was not found. Please try again.')
  }

  if (fresh.length > 0) {
    const start = (existing || []).reduce((m: number, r: any) => Math.max(m, r.sort_order), -1) + 1
    const { error } = await db.from('website_project_videos').insert(fresh.map((r, n) => ({ ...r, website_project_id: projectId, sort_order: start + n })))
    if (error) return fail(error.message)
  }

  revalidate()
  const { data: all } = await db.from('website_project_videos').select('id, youtube_id, video_path, sort_order, created_at').eq('website_project_id', projectId)
  const videos = ((all || []) as any[]).sort((a, b) => a.sort_order - b.sort_order)
    .map(v => ({ id: v.id, youtube_id: v.youtube_id || null, video_url: websiteMediaUrl(db, v.video_path) }))
  return { success: true, videos }
}

export async function deleteWebsiteProjectVideo(id: string): Promise<Result> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: 'Invalid video.' }

  const db = createServiceClient()
  const { data: v } = await db.from('website_project_videos').select('video_path').eq('id', id).maybeSingle()
  if (!v) return { success: false, error: 'Video not found.' }
  const { error } = await db.from('website_project_videos').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  if (v.video_path) await db.storage.from(WEBSITE_MEDIA_BUCKET).remove([v.video_path])
  revalidate()
  return { success: true }
}
