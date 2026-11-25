import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { PROJECT_DOCUMENTS_BUCKET } from '@/lib/project-documents'

/**
 * Public document viewer for the website /projects page (REQ-109). Opened in a new tab.
 * Only documents attached to a PUBLISHED website project are served; every other CRM document stays private.
 *  - PDF / images / video / audio / text → short-lived signed URL shown inline (the browser's own viewer)
 *  - Word / Excel / PowerPoint          → Google Docs Viewer (browsers can't show Office files)
 *  - Links (e.g. Google Drive)           → the saved http(s) URL
 *  - Anything else (ZIP) or ?download=1  → forced download
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SIGNED_URL_TTL_SECONDS = 60 * 10
const INLINE_RE = /^(application\/pdf|image\/|video\/|audio\/|text\/plain)/
const OFFICE_RE = /^(application\/(msword|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.)|text\/csv)/

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return new NextResponse('Not found', { status: 404 })

  const db = createServiceClient()
  const { data: links } = await db
    .from('website_project_documents')
    .select('document_id, website_projects!inner(is_published)')
    .eq('document_id', id)
    .eq('website_projects.is_published', true)
    .limit(1)
  if (!links || links.length === 0) return new NextResponse('Not found', { status: 404 })

  const { data: doc } = await db.from('project_documents').select('name, doc_type, url, storage_path, mime_type').eq('id', id).maybeSingle()
  if (!doc) return new NextResponse('Not found', { status: 404 })

  if (doc.doc_type === 'link') {
    if (!doc.url || !/^https?:\/\//i.test(doc.url)) return new NextResponse('Not found', { status: 404 })
    return NextResponse.redirect(doc.url, 302)
  }

  if (!doc.storage_path) return new NextResponse('Not found', { status: 404 })
  const mime = String(doc.mime_type || '').toLowerCase()
  const wantsDownload = new URL(req.url).searchParams.get('download') === '1'
  const mode: 'inline' | 'office' | 'download' =
    wantsDownload ? 'download' : INLINE_RE.test(mime) ? 'inline' : OFFICE_RE.test(mime) ? 'office' : 'download'

  const ext = (doc.storage_path.match(/\.[a-z0-9]{1,8}$/i)?.[0] || '').toLowerCase()
  const fileName = `${String(doc.name).replace(/[^\w .()-]+/g, '').trim() || 'document'}${ext}`
  const { data, error } = await db.storage.from(PROJECT_DOCUMENTS_BUCKET)
    .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS, mode === 'download' ? { download: fileName } : undefined)
  if (error || !data) return new NextResponse('File unavailable', { status: 404 })

  const target = mode === 'office'
    ? `https://docs.google.com/viewer?url=${encodeURIComponent(data.signedUrl)}`
    : data.signedUrl
  const res = NextResponse.redirect(target, 302)
  res.headers.set('Cache-Control', 'no-store')
  return res
}
