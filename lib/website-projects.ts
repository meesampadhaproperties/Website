import { createServiceClient } from '@/lib/supabase/server'

/**
 * Website Projects (REQ-109): shared constants + the PUBLIC read used by the /projects page.
 * Server-only (uses the service role). Returns only fields that are safe to show visitors.
 */

import { WEBSITE_MEDIA_BUCKET } from '@/lib/website-projects-shared'
export * from '@/lib/website-projects-shared'

export interface PublicWebsiteDownload { id: string; name: string }
export interface PublicWebsiteProject {
  id: string
  title: string
  location: string
  tags: string[]
  points: string[]
  video_url: string | null
  map_url: string | null
  downloads: PublicWebsiteDownload[]
}
export interface PublicWebsiteCategory { id: string; name: string; projects: PublicWebsiteProject[] }

/** Public URL of a file in the website-media bucket (the bucket is public). */
export function websiteMediaUrl(db: any, path: string | null): string | null {
  if (!path) return null
  return db.storage.from(WEBSITE_MEDIA_BUCKET).getPublicUrl(path).data?.publicUrl || null
}

/** Published projects grouped by category, categories in priority order (1 first). Empty categories are left out. */
export async function getPublishedWebsiteProjects(): Promise<PublicWebsiteCategory[]> {
  try {
    const db = createServiceClient()
    const [catRes, projRes] = await Promise.all([
      db.from('website_project_categories').select('id, name, priority').order('priority', { ascending: true }).order('name', { ascending: true }),
      db.from('website_projects')
        .select('id, category_id, title, location, tags, points, video_path, map_url, created_at, website_project_documents(sort_order, project_documents(id, name))')
        .eq('is_published', true)
        .order('created_at', { ascending: false }),
    ])
    const err = catRes.error || projRes.error
    if (err) throw new Error(err.message)

    const byCategory = new Map<string, PublicWebsiteProject[]>()
    for (const p of (projRes.data || []) as any[]) {
      const downloads = ((p.website_project_documents || []) as any[])
        .filter(l => l.project_documents)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(l => ({ id: l.project_documents.id, name: l.project_documents.name }))
      const list = byCategory.get(p.category_id) || []
      list.push({
        id: p.id, title: p.title, location: p.location || '', tags: p.tags || [], points: p.points || [],
        video_url: websiteMediaUrl(db, p.video_path), map_url: p.map_url || null, downloads,
      })
      byCategory.set(p.category_id, list)
    }

    return ((catRes.data || []) as any[])
      .map(c => ({ id: c.id, name: c.name, projects: byCategory.get(c.id) || [] }))
      .filter(c => c.projects.length > 0)
  } catch (e) {
    // At build time, render the page without projects (the DB may be unreachable from the builder).
    // At runtime, throw: Next keeps serving the last good page instead of caching an empty one.
    if (process.env.NEXT_PHASE === 'phase-production-build') return []
    throw e
  }
}
