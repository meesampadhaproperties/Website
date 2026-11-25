import { META_GRAPH_VERSION } from '@/lib/site-config'

/** Facebook Login scopes (shared by server + the client connect page).
 * pages_manage_metadata is required to subscribe the page to the leadgen webhook. */
export const META_OAUTH_SCOPES = 'pages_show_list,pages_read_engagement,pages_manage_ads,pages_manage_metadata,leads_retrieval,business_management'

/** The Facebook Login dialog URL (one builder for server and client). */
export function buildMetaOAuthDialogUrl(appId: string, redirectUri: string, state: string): string {
  return `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(META_OAUTH_SCOPES)}&response_type=code&auth_type=rerequest`
}
