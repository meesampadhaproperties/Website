'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { checkActionAccess } from '@/lib/auth/permissions'
import { getStorageLimitBytes } from '@/lib/site-config'
import { removeProjectDocumentFiles, documentCategory, DOCUMENT_NAME_MAX_CHARS, type DocumentCategory } from '@/lib/project-documents'

/**
 * Projects workspace: Areas → Projects → Documents (uploaded files or http links).
 * All DB/storage access uses the service role AFTER checkActionAccess('projects', ...);
 * the tables have RLS enabled with no policies, so clients can never hit them directly.
 */

const BUCKET = 'project-documents'
const MAX_FILE_BYTES = 50 * 1024 * 1024 // matches bucket file_size_limit (Supabase Free cap)
const SIGNED_URL_TTL_SECONDS = 60 * 60
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED_EXACT_MIME = new Set([
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip', 'application/x-zip-compressed',
])

export interface ProjectArea { id: string; name: string }
export interface ProjectDocument {
  id: string
  project_id: string
  name: string
  doc_type: 'file' | 'link'
  url: string | null
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}
export interface WorkspaceProject {
  id: string
  name: string
  client_name: string
  area_id: string | null
  documents: ProjectDocument[]
}

// Flat shape (tsconfig is non-strict, so discriminated unions do not narrow): check `success` first.
type Result<T = {}> = { success: boolean; error?: string } & Partial<T>

function isAllowedMime(mime: string): boolean {
  return /^(image|video|audio)\//.test(mime) || ALLOWED_EXACT_MIME.has(mime)
}

function cleanName(v: unknown, max: number): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Projects page rows only (Meta clients live in the same table with kind = 'meta'). */
async function isWorkspaceProject(db: any, id: string): Promise<boolean> {
  const { data } = await db.from('projects').select('id').eq('id', id).eq('kind', 'workspace').maybeSingle()
  return !!data
}

function revalidate() {
  revalidatePath('/crm/projects')
  // Website Projects use these documents as downloads (REQ-109)
  revalidatePath('/crm/website-projects')
  revalidatePath('/projects')
}

export async function getProjectsWorkspace(): Promise<{ areas: ProjectArea[]; projects: WorkspaceProject[]; error: string | null }> {
  const auth = await checkActionAccess('projects', 'view')
  if (!auth.authorized) return { areas: [], projects: [], error: auth.error }

  try {
    const db = createServiceClient()
    const [areasRes, projectsRes, docsRes] = await Promise.all([
      db.from('project_areas').select('id, name').order('name', { ascending: true }),
      db.from('projects').select('id, name, client_name, area_id').eq('kind', 'workspace').order('name', { ascending: true }),
      db.from('project_documents')
        .select('id, project_id, name, doc_type, url, mime_type, size_bytes, created_at')
        .order('created_at', { ascending: false }),
    ])
    const err = areasRes.error || projectsRes.error || docsRes.error
    if (err) return { areas: [], projects: [], error: err.message }

    const docsByProject = new Map<string, ProjectDocument[]>()
    for (const d of (docsRes.data || []) as ProjectDocument[]) {
      const list = docsByProject.get(d.project_id) || []
      list.push(d)
      docsByProject.set(d.project_id, list)
    }

    return {
      areas: (areasRes.data || []) as ProjectArea[],
      projects: (projectsRes.data || []).map((p: any) => ({ ...p, documents: docsByProject.get(p.id) || [] })),
      error: null,
    }
  } catch (e: any) {
    return { areas: [], projects: [], error: e.message || 'Failed to load projects' }
  }
}

export async function createArea(name: string): Promise<Result<{ area: ProjectArea }>> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }

  const clean = cleanName(name, 100)
  if (!clean) return { success: false, error: 'Area name is required.' }

  const { data, error } = await createServiceClient()
    .from('project_areas').insert({ name: clean }).select('id, name').single()
  if (error) {
    return { success: false, error: error.code === '23505' ? `Area "${clean}" already exists.` : error.message }
  }
  revalidate()
  return { success: true, area: data as ProjectArea }
}

export async function renameArea(id: string, name: string): Promise<Result<{ area: ProjectArea }>> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: 'Invalid area.' }

  const clean = cleanName(name, 100)
  if (!clean) return { success: false, error: 'Area name is required.' }

  const { data, error } = await createServiceClient()
    .from('project_areas').update({ name: clean }).eq('id', id).select('id, name').single()
  if (error) {
    return { success: false, error: error.code === '23505' ? `Area "${clean}" already exists.` : error.message }
  }
  revalidate()
  return { success: true, area: data as ProjectArea }
}

export async function deleteArea(id: string): Promise<Result> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: 'Invalid area.' }

  // Projects in this area become "Unassigned" (FK is ON DELETE SET NULL)
  const { error } = await createServiceClient().from('project_areas').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidate()
  return { success: true }
}

export async function createWorkspaceProject(input: { name: string; clientName?: string; areaId?: string | null }): Promise<Result<{ project: WorkspaceProject }>> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }

  const name = cleanName(input.name, 150)
  if (!name) return { success: false, error: 'Project name is required.' }
  const areaId = input.areaId && UUID_RE.test(input.areaId) ? input.areaId : null

  const { data, error } = await createServiceClient()
    .from('projects')
    .insert({ kind: 'workspace', name, client_name: cleanName(input.clientName, 150), area_id: areaId })
    .select('id, name, client_name, area_id')
    .single()
  if (error) return { success: false, error: error.message }

  revalidate()
  return { success: true, project: { ...(data as any), documents: [] } }
}

export async function updateWorkspaceProject(id: string, input: { name: string; clientName?: string }): Promise<Result> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: 'Invalid project.' }

  const name = cleanName(input.name, 150)
  if (!name) return { success: false, error: 'Project name is required.' }

  const { error } = await createServiceClient()
    .from('projects')
    .update({ name, client_name: cleanName(input.clientName, 150), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('kind', 'workspace')
  if (error) return { success: false, error: error.message }
  revalidate()
  return { success: true }
}

/**
 * Deletes a workspace project, its documents and their stored files.
 * Only kind = 'workspace' rows: Meta clients (and their integrations/forms) can never be deleted from here.
 */
export async function deleteWorkspaceProject(id: string): Promise<Result> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: 'Invalid project.' }

  const db = createServiceClient()
  // Never touch a Meta client from the Projects page
  if (!(await isWorkspaceProject(db, id))) return { success: false, error: 'Project not found.' }
  await removeProjectDocumentFiles(db, id)
  const { error } = await db.from('projects').delete().eq('id', id).eq('kind', 'workspace')
  if (error) return { success: false, error: error.message }
  revalidate()
  revalidatePath('/crm/leads')
  return { success: true }
}

export async function setProjectArea(projectId: string, areaId: string | null): Promise<Result> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(projectId) || (areaId && !UUID_RE.test(areaId))) return { success: false, error: 'Invalid project or area.' }

  const { error } = await createServiceClient().from('projects').update({ area_id: areaId || null }).eq('id', projectId).eq('kind', 'workspace')
  if (error) return { success: false, error: error.message }
  revalidate()
  return { success: true }
}

export async function createLinkDocument(input: { projectId: string; name: string; url: string }): Promise<Result<{ document: ProjectDocument }>> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }

  const name = cleanName(input.name, 1000)
  if (!name) return { success: false, error: 'Document name is required.' }
  if (name.length > DOCUMENT_NAME_MAX_CHARS) return { success: false, error: `Document name can be up to ${DOCUMENT_NAME_MAX_CHARS} characters.` }
  if (!UUID_RE.test(input.projectId)) return { success: false, error: 'Invalid project.' }
  if (!(await isWorkspaceProject(createServiceClient(), input.projectId))) return { success: false, error: 'Project not found.' }

  let parsed: URL
  try {
    parsed = new URL(String(input.url || '').trim())
  } catch {
    return { success: false, error: 'Enter a valid link starting with http:// or https://' }
  }
  // Only http(s): blocks javascript:, data:, file: etc. (stored XSS via link clicks)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { success: false, error: 'Only http:// or https:// links are allowed.' }
  }

  const { data, error } = await createServiceClient()
    .from('project_documents')
    .insert({ project_id: input.projectId, name, doc_type: 'link', url: parsed.toString(), created_by: auth.user.id })
    .select('id, project_id, name, doc_type, url, mime_type, size_bytes, created_at')
    .single()
  if (error) return { success: false, error: error.message }
  revalidate()
  return { success: true, document: data as ProjectDocument }
}

/**
 * Step 1 of a file upload: validates the file and returns a one-time signed upload URL.
 * The browser uploads directly to Supabase Storage (bypasses the ~4.5MB serverless body limit).
 */
export async function createDocumentUpload(input: { projectId: string; fileName: string; mimeType: string; sizeBytes: number }): Promise<Result<{ path: string; token: string }>> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(input.projectId)) return { success: false, error: 'Invalid project.' }
  if (!(await isWorkspaceProject(createServiceClient(), input.projectId))) return { success: false, error: 'Project not found.' }

  const mime = String(input.mimeType || '').toLowerCase()
  if (!isAllowedMime(mime)) return { success: false, error: 'This file type is not supported. Use images, videos, audio, PDF, Office documents, text/CSV or ZIP.' }
  if (!(input.sizeBytes > 0) || input.sizeBytes > MAX_FILE_BYTES) return { success: false, error: 'Files must be between 1 byte and 50 MB.' }

  // Refuse uploads that would exceed the plan's storage limit
  const usedBytes = await currentStorageBytes()
  if (usedBytes !== null && usedBytes + input.sizeBytes > getStorageLimitBytes()) {
    return { success: false, error: 'Storage is full. Delete some files or upgrade the storage plan, then try again.' }
  }

  const safeName = String(input.fileName || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120) || 'file'
  const path = `${input.projectId}/${randomUUID()}-${safeName}`

  const { data, error } = await createServiceClient().storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) return { success: false, error: error?.message || 'Could not start upload.' }
  return { success: true, path: data.path, token: data.token }
}

/** Step 2 of a file upload: verifies the object exists, then records the document. */
export async function finalizeDocumentUpload(input: { projectId: string; name: string; path: string; mimeType: string; sizeBytes: number }): Promise<Result<{ document: ProjectDocument }>> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }

  const name = cleanName(input.name, 1000)
  if (!name) return { success: false, error: 'Document name is required.' }
  if (name.length > DOCUMENT_NAME_MAX_CHARS) return { success: false, error: `Document name can be up to ${DOCUMENT_NAME_MAX_CHARS} characters.` }
  if (!UUID_RE.test(input.projectId) || !String(input.path).startsWith(`${input.projectId}/`) || input.path.includes('..')) {
    return { success: false, error: 'Invalid upload path.' }
  }
  if (!(await isWorkspaceProject(createServiceClient(), input.projectId))) return { success: false, error: 'Project not found.' }

  const db = createServiceClient()
  const folder = input.projectId
  const fileKey = input.path.slice(folder.length + 1)
  const { data: found, error: listErr } = await db.storage.from(BUCKET).list(folder, { search: fileKey, limit: 1 })
  const stored = found?.find(o => o.name === fileKey)
  if (listErr || !stored) return { success: false, error: 'Upload was not found. Please try again.' }

  // Trust what storage actually holds, not what the browser claimed when the upload was requested
  const realSize = Number((stored.metadata as any)?.size ?? 0)
  const realMime = String((stored.metadata as any)?.mimetype || '').toLowerCase().split(';')[0].trim()
  const usedBytes = await currentStorageBytes() // already includes this object
  if (!(realSize > 0) || realSize > MAX_FILE_BYTES || !isAllowedMime(realMime)
    || (usedBytes !== null && usedBytes > getStorageLimitBytes())) {
    await db.storage.from(BUCKET).remove([input.path])
    return { success: false, error: 'This file was rejected: unsupported type, too large, or storage is full.' }
  }

  const { data, error } = await db
    .from('project_documents')
    .insert({
      project_id: input.projectId, name, doc_type: 'file', storage_path: input.path,
      mime_type: realMime || null,
      size_bytes: realSize || null, created_by: auth.user.id,
    })
    .select('id, project_id, name, doc_type, url, mime_type, size_bytes, created_at')
    .single()
  if (error) {
    await db.storage.from(BUCKET).remove([input.path])
    return { success: false, error: error.message }
  }
  revalidate()
  return { success: true, document: data as ProjectDocument }
}

/** Returns a URL to open a document: the link itself, or a short-lived signed URL for files. */
export async function getDocumentOpenUrl(id: string): Promise<Result<{ url: string }>> {
  const auth = await checkActionAccess('projects', 'view')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: 'Invalid document.' }

  const db = createServiceClient()
  const { data: doc, error } = await db.from('project_documents').select('doc_type, url, storage_path').eq('id', id).maybeSingle()
  if (error || !doc) return { success: false, error: error?.message || 'Document not found.' }
  if (doc.doc_type === 'link' && doc.url) return { success: true, url: doc.url }

  const { data, error: signErr } = await db.storage.from(BUCKET).createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS)
  if (signErr || !data) return { success: false, error: signErr?.message || 'Could not open file.' }
  return { success: true, url: data.signedUrl }
}

export async function renameDocument(id: string, name: string): Promise<Result> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: 'Invalid document.' }

  const clean = cleanName(name, 1000)
  if (!clean) return { success: false, error: 'Document name is required.' }
  if (clean.length > DOCUMENT_NAME_MAX_CHARS) return { success: false, error: `Document name can be up to ${DOCUMENT_NAME_MAX_CHARS} characters.` }

  const { error } = await createServiceClient().from('project_documents').update({ name: clean }).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidate()
  return { success: true }
}

export async function deleteDocument(id: string): Promise<Result> {
  const auth = await checkActionAccess('projects', 'edit')
  if (!auth.authorized) return { success: false, error: auth.error }
  if (!UUID_RE.test(id)) return { success: false, error: 'Invalid document.' }

  const db = createServiceClient()
  const { data: doc } = await db.from('project_documents').select('storage_path').eq('id', id).maybeSingle()
  const { error } = await db.from('project_documents').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  if (doc?.storage_path) await db.storage.from(BUCKET).remove([doc.storage_path])
  revalidate()
  return { success: true }
}

export interface ProjectDataItem extends ProjectDocument {
  category: DocumentCategory
  /** Signed preview URL (1 hour) for images and videos; null for documents/links. */
  preview_url: string | null
}

/** Everything for the per-project "View data" page: project info + all items, with previews. */
export async function getProjectData(projectId: string): Promise<{
  project: { id: string; name: string; client_name: string; area_name: string | null } | null
  items: ProjectDataItem[]
  error: string | null
}> {
  const auth = await checkActionAccess('projects', 'view')
  if (!auth.authorized) return { project: null, items: [], error: auth.error }
  if (!UUID_RE.test(projectId)) return { project: null, items: [], error: null }

  const db = createServiceClient()
  const [projRes, docsRes] = await Promise.all([
    db.from('projects').select('id, name, client_name, area_id, project_areas(name)').eq('id', projectId).eq('kind', 'workspace').maybeSingle(),
    db.from('project_documents')
      .select('id, project_id, name, doc_type, url, storage_path, mime_type, size_bytes, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
  ])
  if (projRes.error) return { project: null, items: [], error: projRes.error.message }
  if (!projRes.data) return { project: null, items: [], error: null }
  if (docsRes.error) return { project: null, items: [], error: docsRes.error.message }

  const docs = (docsRes.data || []) as (ProjectDocument & { storage_path: string | null })[]
  const previewPaths = docs
    .filter(d => d.storage_path && ['image', 'video'].includes(documentCategory(d)))
    .map(d => d.storage_path as string)
  const signed = new Map<string, string>()
  if (previewPaths.length > 0) {
    const { data } = await db.storage.from(BUCKET).createSignedUrls(previewPaths, SIGNED_URL_TTL_SECONDS)
    for (const row of data || []) if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl)
  }

  const p: any = projRes.data
  return {
    project: { id: p.id, name: p.name, client_name: p.client_name || '', area_name: p.project_areas?.name || null },
    items: docs.map(({ storage_path, ...d }) => ({
      ...d,
      category: documentCategory(d),
      preview_url: storage_path ? signed.get(storage_path) || null : null,
    })),
    error: null,
  }
}

/** Total bytes stored across all buckets (null if it can't be read). Server-only helper. */
async function currentStorageBytes(): Promise<number | null> {
  const { data, error } = await createServiceClient().rpc('crm_storage_usage')
  if (error || !data) return null
  return (data as { total_bytes: number | string }[]).reduce((sum, r) => sum + Number(r.total_bytes || 0), 0)
}

/** Live storage indicator: used vs. the plan limit (all files: project documents + logos). */
export async function getStorageUsage(): Promise<{ success: boolean; usedBytes?: number; limitBytes?: number; fileCount?: number; error?: string }> {
  const auth = await checkActionAccess('projects', 'view')
  if (!auth.authorized) return { success: false, error: auth.error }
  const { data, error } = await createServiceClient().rpc('crm_storage_usage')
  if (error) return { success: false, error: error.message }
  const rows = (data || []) as { file_count: number | string; total_bytes: number | string }[]
  return {
    success: true,
    usedBytes: rows.reduce((s, r) => s + Number(r.total_bytes || 0), 0),
    fileCount: rows.reduce((s, r) => s + Number(r.file_count || 0), 0),
    limitBytes: getStorageLimitBytes(),
  }
}
