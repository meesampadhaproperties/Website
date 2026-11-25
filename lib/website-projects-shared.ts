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
export const WEBSITE_MAX_VIDEO_BYTES = 50 * 1024 * 1024 // matches the bucket file_size_limit
