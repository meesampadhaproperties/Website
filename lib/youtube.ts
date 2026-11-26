/**
 * YouTube link helpers (REQ-110 reviews). Pure: safe on client and server.
 * We only ever STORE the 11-character video id and rebuild every URL from it, so a saved review
 * can never point at anything but a YouTube video.
 */

const ID_RE = /^[A-Za-z0-9_-]{11}$/
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be', 'www.youtu.be'])

/** Video id from a watch / share / shorts / live / embed link, or null if it isn't a single YouTube video. */
export function parseYouTubeId(input: string | null | undefined): string | null {
  let raw = String(input ?? '').trim()
  if (!raw || raw.length > 300) return null
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`
  let u: URL
  try { u = new URL(raw) } catch { return null }
  const host = u.hostname.toLowerCase()
  if (!HOSTS.has(host) || (u.protocol !== 'https:' && u.protocol !== 'http:')) return null

  let id: string | null = null
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    id = u.pathname.split('/')[1] || null
  } else {
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0] === 'watch') id = u.searchParams.get('v')
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0])) id = parts[1] || null
  }
  return id && ID_RE.test(id) ? id : null
}

export const youtubeThumbUrl = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
export const youtubeWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`
export const youtubeEmbedUrl = (id: string, autoplay = false) =>
  `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1${autoplay ? '&autoplay=1' : ''}`
