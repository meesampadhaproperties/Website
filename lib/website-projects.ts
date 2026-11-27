import { createServiceClient } from '@/lib/supabase/server'

/**
 * Website Projects (REQ-109): shared constants + the PUBLIC read used by the /projects page.
 * Server-only (uses the service role). Returns only fields that are safe to show visitors.
 */

import { WEBSITE_MEDIA_BUCKET, WEBSITE_GALLERY_BUCKET } from '@/lib/website-projects-shared'
import { videoThumbUrl } from '@/lib/video-link'
export * from '@/lib/website-projects-shared'

export interface PublicWebsiteDownload { id: string; name: string }
export interface PublicWebsiteProject {
  id: string
  title: string
  location: string
  tags: string[]
  points: string[]
  video_url: string | null
  youtube_id: string | null
  map_url: string | null
  downloads: PublicWebsiteDownload[]
  /** What the Gallery page holds for this project (drives the "Explore Project Gallery" button) */
  gallery_photos: number
  gallery_videos: number
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
        .select('id, category_id, title, location, tags, points, video_path, youtube_id, map_url, created_at, website_project_documents(sort_order, project_documents(id, name)), website_gallery_images(id), website_project_videos(id)')
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
        video_url: websiteMediaUrl(db, p.video_path), youtube_id: p.youtube_id || null, map_url: p.map_url || null, downloads,
        gallery_photos: (p.website_gallery_images || []).length,
        gallery_videos: (p.video_path || p.youtube_id ? 1 : 0) + (p.website_project_videos || []).length,
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

/** Public URL of a picture in the website-gallery bucket (the bucket is public). */
export function websiteGalleryUrl(db: any, path: string | null): string | null {
  if (!path) return null
  return db.storage.from(WEBSITE_GALLERY_BUCKET).getPublicUrl(path).data?.publicUrl || null
}

export interface PublicGalleryImage { id: string; url: string; thumb_url: string }
export interface PublicGalleryVideo { id: string; youtube_id: string | null; video_url: string | null }
export interface PublicGalleryProject {
  id: string
  title: string
  images: PublicGalleryImage[]
  /** All the project's videos: the main one first, then the extra ones. Each is an uploaded MP4 or a YouTube link. */
  videos: PublicGalleryVideo[]
}

/** Pictures and videos of PUBLISHED website projects, grouped by project (category priority, then newest project first). */
export async function getPublishedGallery(): Promise<PublicGalleryProject[]> {
  try {
    const db = createServiceClient()
    const [catRes, projRes] = await Promise.all([
      db.from('website_project_categories').select('id, priority').order('priority', { ascending: true }),
      db.from('website_projects')
        .select('id, title, category_id, created_at, video_path, youtube_id, website_gallery_images(id, storage_path, thumb_path, sort_order, created_at), website_project_videos(id, youtube_id, video_path, sort_order, created_at)')
        .eq('is_published', true)
        .order('created_at', { ascending: false }),
    ])
    const err = catRes.error || projRes.error
    if (err) throw new Error(err.message)
    const rank = new Map(((catRes.data || []) as any[]).map((c, i) => [c.id, i]))
    return ((projRes.data || []) as any[])
      .map(p => ({
        id: p.id as string,
        title: p.title as string,
        rank: rank.get(p.category_id) ?? 9999,
        images: ((p.website_gallery_images || []) as any[])
          .sort((a, b) => a.sort_order - b.sort_order || String(a.created_at).localeCompare(String(b.created_at)))
          .map(i => { const url = websiteGalleryUrl(db, i.storage_path) as string; return { id: i.id as string, url, thumb_url: (websiteGalleryUrl(db, i.thumb_path) || url) as string } })
          .filter(i => !!i.url),
        videos: [
          ...((p.video_path || p.youtube_id) ? [{ id: `main-${p.id}`, youtube_id: (p.youtube_id as string | null) || null, video_url: websiteMediaUrl(db, p.video_path) }] : []),
          ...((p.website_project_videos || []) as any[])
            .sort((a, b) => a.sort_order - b.sort_order || String(a.created_at).localeCompare(String(b.created_at)))
            .map(v => ({ id: v.id as string, youtube_id: (v.youtube_id as string | null) || null, video_url: websiteMediaUrl(db, v.video_path) })),
        ].filter(v => !!v.youtube_id || !!v.video_url) as PublicGalleryVideo[],
      }))
      .filter(p => p.images.length > 0 || p.videos.length > 0)
      .sort((a, b) => a.rank - b.rank)
      .map(({ rank, ...p }) => p)
  } catch (e) {
    if (process.env.NEXT_PHASE === 'phase-production-build') return []
    throw e
  }
}

export interface PublicReview { id: string; title: string; youtube_id: string; thumb_url: string }

/** Published YouTube reviews, newest first. */
export async function getPublishedReviews(): Promise<PublicReview[]> {
  try {
    const { data, error } = await createServiceClient()
      .from('website_reviews').select('id, title, youtube_id').eq('is_published', true).order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return ((data || []) as any[]).map(r => ({ id: r.id, title: r.title, youtube_id: r.youtube_id, thumb_url: videoThumbUrl(r.youtube_id) || '' }))
  } catch (e) {
    if (process.env.NEXT_PHASE === 'phase-production-build') return []
    throw e
  }
}

export interface PublicTestimonial { id: string; title: string; youtube_id: string | null; video_url: string | null }

/** Published testimonials for the home page, oldest first so the first one added stays first. */
export async function getPublishedTestimonials(): Promise<PublicTestimonial[]> {
  try {
    const db = createServiceClient()
    const { data, error } = await db.from('website_testimonials')
      .select('id, title, youtube_id, video_path').eq('is_published', true).order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    return ((data || []) as any[]).map(t => ({ id: t.id, title: t.title, youtube_id: t.youtube_id || null, video_url: websiteMediaUrl(db, t.video_path) }))
      .filter(t => !!t.youtube_id || !!t.video_url)
  } catch (e) {
    // Never break the home page: at build time, and on a database hiccup at runtime, just show no testimonials
    return []
  }
}
