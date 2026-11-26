/** Website Projects (REQ-109) limits. Pure constants: safe on client and server. */
export const WEBSITE_MEDIA_BUCKET = 'website-media'
export const WEBSITE_MAX_POINTS = 6
/** Characters per point: ~2 lines in the website's two-column points list (desktop and mobile). */
export const WEBSITE_POINT_MAX_CHARS = 60
export const WEBSITE_MAX_DOWNLOADS = 5
/** Field limits, sized to how each field displays on the website card. */
export const WEBSITE_TITLE_MAX_CHARS = 60     // big heading: ~2 lines
export const WEBSITE_LOCATION_MAX_CHARS = 60  // one line under the title
export const WEBSITE_MAX_TAGS = 4
export const WEBSITE_TAG_MAX_CHARS = 20       // small badges
export const WEBSITE_MAP_URL_MAX_CHARS = 500  // Google Maps share links can be long

/** Splits the comma-separated tags field into trimmed, non-empty tags. */
export function splitTags(raw: string): string[] {
  return String(raw || '').split(',').map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean)
}
export const WEBSITE_MAX_VIDEO_BYTES = 45 * 1024 * 1024 // under the Supabase Free plan's 50 MB per-upload cap
export const WEBSITE_VIDEO_MIME = 'video/mp4' // MP4 only
/** Downloads on the website: PDF files only, up to 25 MB each. */
export const WEBSITE_DOC_MIME = 'application/pdf'
export const WEBSITE_MAX_DOC_BYTES = 25 * 1024 * 1024

/** True when a CRM document may be attached as a website download (an uploaded PDF, max 25 MB). */
export function isWebsiteDownloadable(d: { doc_type: string; mime_type: string | null; size_bytes: number | null }): boolean {
  return d.doc_type === 'file' && String(d.mime_type || '').toLowerCase() === WEBSITE_DOC_MIME && (d.size_bytes ?? 0) <= WEBSITE_MAX_DOC_BYTES
}

/** Gallery pictures (REQ-110): a public bucket, JPEG/PNG/WebP, shrunk in the browser before upload. */
export const WEBSITE_GALLERY_BUCKET = 'website-gallery'
export const WEBSITE_GALLERY_MAX_IMAGES = 20           // per website project
export const WEBSITE_GALLERY_MAX_BYTES = 5 * 1024 * 1024 // after shrinking; matches the bucket limit
export const WEBSITE_GALLERY_SOURCE_MAX_BYTES = 25 * 1024 * 1024 // a phone photo before shrinking
export const WEBSITE_GALLERY_MIMES = ['image/jpeg', 'image/png', 'image/webp']
/** Extra videos per website project (the main one is separate). They show on the Gallery page. */
export const WEBSITE_PROJECT_EXTRA_VIDEOS_MAX = 10
/** Testimonial title (home page). */
export const WEBSITE_TESTIMONIAL_TITLE_MAX_CHARS = 70
/** Review title shown above the YouTube video. */
export const WEBSITE_REVIEW_TITLE_MAX_CHARS = 70
