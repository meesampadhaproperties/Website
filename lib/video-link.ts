import { parseYouTubeId, youtubeThumbUrl, youtubeWatchUrl } from './youtube'

/**
 * Video links from any site (YouTube, Instagram, Facebook, Vimeo, a direct .mp4 link, or any other page).
 * Pure: safe on client and server.
 *
 * What we STORE (the existing "youtube_id" columns hold this "key"):
 *  - YouTube: the 11-character video id, exactly as before.
 *  - Anything else: the cleaned https link (no #fragment, no tracking parameters).
 */

export const VIDEO_LINK_MAX = 500
const YT_ID = /^[A-Za-z0-9_-]{11}$/
const TRACKING = /^(utm_.+|igsh|igshid|fbclid|gclid|si|feature)$/i

export type VideoKind = 'youtube' | 'instagram' | 'facebook' | 'vimeo' | 'file' | 'link'

export const isYouTubeKey = (key: string | null | undefined) => YT_ID.test(String(key || ''))

/** The key to save for a pasted link, or null when it is not a usable link. */
export function parseVideoKey(input: string | null | undefined): string | null {
  let raw = String(input ?? '').trim()
  if (!raw || raw.length > 1000 || /\s/.test(raw)) return null
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`
  let u: URL
  try { u = new URL(raw) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (u.username || u.password) return null
  const host = u.hostname.toLowerCase()
  // A real website name: has a dot, is not an IP address or "localhost"
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || host.endsWith('.local')) return null

  const yt = parseYouTubeId(raw)
  if (yt) return yt
  if (/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(host)) return null // a YouTube page that is not one video (channel, playlist...)

  u.protocol = 'https:'
  u.hash = ''
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k)
  const out = u.toString()
  return out.length <= VIDEO_LINK_MAX ? out : null
}

export function videoKind(key: string): VideoKind {
  if (isYouTubeKey(key)) return 'youtube'
  let u: URL
  try { u = new URL(key) } catch { return 'link' }
  const host = u.hostname.toLowerCase().replace(/^(www|m|web)\./, '')
  if (host === 'instagram.com' || host === 'instagr.am') return 'instagram'
  if (host === 'facebook.com' || host === 'fb.watch' || host === 'fb.com') return 'facebook'
  if (host === 'vimeo.com' || host === 'player.vimeo.com') return 'vimeo'
  if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return 'file'
  return 'link'
}

/** Short name shown on the placeholder tile: "Instagram", "Facebook", or the site's name. */
export function videoLabel(key: string): string {
  const kind = videoKind(key)
  if (kind === 'youtube') return 'YouTube'
  if (kind === 'instagram') return 'Instagram'
  if (kind === 'facebook') return 'Facebook'
  if (kind === 'vimeo') return 'Vimeo'
  if (kind === 'file') return 'Video'
  try { return new URL(key).hostname.replace(/^www\./, '') } catch { return 'Video link' }
}

/** Where "Watch" opens: YouTube's watch page, or the link itself. */
export const videoOpenUrl = (key: string) => (isYouTubeKey(key) ? youtubeWatchUrl(key) : key)

/** A picture for the video, only where the site gives a predictable one (YouTube). Others show a labelled tile. */
export const videoThumbUrl = (key: string): string | null => (isYouTubeKey(key) ? youtubeThumbUrl(key) : null)

/** A player we can put in a page (Instagram, Facebook, Vimeo), or null (play the file / open the link instead). */
export function videoEmbedUrl(key: string, autoplay = true): string | null {
  const kind = videoKind(key)
  let u: URL
  try { u = new URL(key) } catch { return null }
  if (kind === 'instagram') {
    const parts = u.pathname.split('/').filter(Boolean)
    const i = parts.findIndex((p) => ['reel', 'reels', 'p', 'tv'].includes(p))
    const code = i >= 0 ? parts[i + 1] : ''
    if (!code || !/^[A-Za-z0-9_-]+$/.test(code)) return null
    return `https://www.instagram.com/${parts[i] === 'reels' ? 'reel' : parts[i]}/${code}/embed`
  }
  if (kind === 'facebook') {
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(key)}&show_text=false${autoplay ? '&autoplay=true' : ''}`
  }
  if (kind === 'vimeo') {
    const id = u.pathname.split('/').filter(Boolean).reverse().find((p) => /^\d+$/.test(p))
    return id ? `https://player.vimeo.com/video/${id}${autoplay ? '?autoplay=1' : ''}` : null
  }
  return null
}
