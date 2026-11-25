import { headers } from 'next/headers'
import { resolveSiteUrl } from '@/lib/site-config'

/** Site URL for server actions / server components (falls back to the current request's host). */
export async function getRequestSiteUrl(): Promise<string> {
  let host: string | null = null
  let proto: string | null = null
  try {
    const h = await headers()
    host = h.get('x-forwarded-host') || h.get('host')
    proto = h.get('x-forwarded-proto')
  } catch {
    // Outside a request (scripts/tests): configured URL or dev fallback only
  }
  return resolveSiteUrl(host, proto)
}
