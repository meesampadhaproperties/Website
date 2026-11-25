export const PROJECT_DOCUMENTS_BUCKET = 'project-documents'

/** Document names are also the website's download button labels (REQ-109): short enough for one line on a phone. */
export const DOCUMENT_NAME_MAX_CHARS = 30

/**
 * Removes every stored file belonging to a project's documents.
 * Call BEFORE deleting the project row (the DB rows cascade, storage objects do not).
 * Server-only helper (not a server action): callers must authorize first.
 */
export async function removeProjectDocumentFiles(db: any, projectId: string): Promise<void> {
  const { data: docs } = await db.from('project_documents').select('storage_path').eq('project_id', projectId)
  const paths = (docs || []).map((d: any) => d.storage_path).filter(Boolean)
  if (paths.length > 0) await db.storage.from(PROJECT_DOCUMENTS_BUCKET).remove(paths)
}

export type DocumentCategory = 'image' | 'video' | 'document' | 'link'

/** How a project document is grouped on the "View data" page. Pure: safe on client and server. */
export function documentCategory(doc: { doc_type: string; mime_type: string | null }): DocumentCategory {
  if (doc.doc_type === 'link') return 'link'
  const mime = (doc.mime_type || '').toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return 'document'
}
