import { createServiceClient } from '@/lib/supabase/server'
import { COMPANY_NAME, META_GRAPH_BASE_URL, SITE_CONTACT, getConfiguredSiteUrl } from '@/lib/site-config'
import { findLeadsByPhone } from '@/lib/lead-phone'
import { canonicalPhoneNumber } from '@/lib/phone-input'
import { mergeEnquiryProjects } from '@/lib/lead-fields'
import { PROJECT_DOCUMENTS_BUCKET } from '@/lib/project-documents'
import { videoOpenUrl } from '@/lib/video-link'
import { websiteMediaUrl } from '@/lib/website-projects'
import {
  MAX_DOCUMENTS, MAX_MESSAGE_AGE_SECONDS, clip, documentFileName, parseIncoming, projectRows, projectText, routeAction,
  type WaIncoming,
} from '@/lib/whatsapp-bot-core'

/**
 * WhatsApp bot (server only). Receives customer messages from the Meta webhook, saves the person as a CRM lead
 * (source: WhatsApp) and replies from the one business number. Rule-based, English, no staff takeover.
 * Switched on with WHATSAPP_BOT_ENABLED=true (plus WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in Vercel).
 */

export function whatsappBotEnabled(): boolean {
  return String(process.env.WHATSAPP_BOT_ENABLED || '').trim().toLowerCase() === 'true' && !!process.env.WHATSAPP_ACCESS_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID
}

const siteUrl = () => getConfiguredSiteUrl() || 'https://meesampadha.com'

// ---------------------------------------------------------------- sending

async function send(to: string, payload: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${META_GRAPH_BASE_URL}/${encodeURIComponent(process.env.WHATSAPP_PHONE_NUMBER_ID as string)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.error('[WhatsApp bot] send failed:', res.status, data?.error?.message || '')
      return false
    }
    return true
  } catch (e) {
    console.error('[WhatsApp bot] send error:', e instanceof Error ? e.message : e)
    return false
  }
}

const sendText = (to: string, body: string) => send(to, { type: 'text', text: { body: body.slice(0, 4000), preview_url: false } })

const sendButtons = (to: string, body: string, buttons: { id: string; title: string }[]) =>
  send(to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: clip(body, 1000) },
      action: { buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: clip(b.title, 20) } })) },
    },
  })

const sendList = (to: string, body: string, rows: { id: string; title: string; description?: string }[]) =>
  send(to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: clip(body, 1000) },
      action: { button: 'View projects', sections: [{ title: 'Projects', rows }] },
    },
  })

const sendDocument = (to: string, link: string, filename: string, caption: string) =>
  send(to, { type: 'document', document: { link, filename, caption: clip(caption, 200) } })

// ---------------------------------------------------------------- replies

const MENU_BUTTONS = [{ id: 'explore', title: 'Explore projects' }, { id: 'contact', title: 'Contact us' }]

async function replyWelcome(to: string) {
  await sendButtons(to, `Welcome to ${COMPANY_NAME}! 🏡\n\nPlease select an option.`, MENU_BUTTONS)
}

async function replyContact(to: string) {
  // A blank line between each item so it is easy to read on a phone
  await sendText(to, [
    `*${COMPANY_NAME}*`,
    `📞 ${SITE_CONTACT.phone}`,
    `✉️ ${SITE_CONTACT.emails[0]}`,
    `🌐 ${siteUrl()}`,
  ].join('\n\n'))
  await sendButtons(to, 'Anything else?', [{ id: 'explore', title: 'Explore projects' }, { id: 'menu', title: 'Main menu' }])
}

async function loadProjectList(db: any) {
  const { data } = await db.from('website_projects').select('id, title, location').eq('is_published', true).order('created_at', { ascending: false })
  return (data || []) as { id: string; title: string; location: string | null }[]
}

async function replyProjectList(to: string, page: number) {
  const db = createServiceClient()
  const projects = await loadProjectList(db)
  if (projects.length === 0) {
    await sendText(to, `Our projects are being updated. Please call us on ${SITE_CONTACT.phone} and we will help you right away.`)
    await sendButtons(to, 'Anything else?', [{ id: 'contact', title: 'Contact us' }, { id: 'menu', title: 'Main menu' }])
    return
  }
  const { rows } = projectRows(projects, page)
  await sendList(to, 'Choose a project to see its details and documents.', rows)
}

const FOLLOW_UP_BUTTONS = [{ id: 'explore', title: 'More projects' }, { id: 'contact', title: 'Contact us' }, { id: 'menu', title: 'Main menu' }]

/** Sends the project summary and its documents. Returns the project's title (for the lead history), or null if not found. */
async function replyProject(to: string, projectId: string): Promise<{ title: string; crmProjectId: string | null } | null> {
  const db = createServiceClient()
  const { data: p } = await db.from('website_projects')
    .select('id, title, location, tags, points, map_url, youtube_id, video_path, crm_project_id, website_project_documents(sort_order, project_documents(id, name, doc_type, url, storage_path, mime_type))')
    .eq('id', projectId).eq('is_published', true).maybeSingle()
  if (!p) {
    await sendText(to, 'Sorry, that project is no longer available.')
    await replyProjectList(to, 1)
    return null
  }

  // The project's video: a link (YouTube, Instagram, ...) or an uploaded MP4 in the public website-media bucket
  const videoKey = (p as any).youtube_id as string | null
  const videoUrl = videoKey ? videoOpenUrl(videoKey) : websiteMediaUrl(db, (p as any).video_path || null)
  await sendText(to, projectText({
    title: p.title, location: p.location, tags: p.tags, points: p.points, mapUrl: p.map_url, videoUrl,
  }))

  const docs = (((p as any).website_project_documents || []) as any[])
    .filter((l) => l.project_documents)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((l) => l.project_documents as { id: string; name: string; doc_type: string; url: string | null; storage_path: string | null })
  const shown = docs.slice(0, MAX_DOCUMENTS)

  if (shown.length === 0) {
    await sendText(to, `The brochure and documents for this project are coming soon. Call us on ${SITE_CONTACT.phone} for details.`)
  }
  for (const d of shown) {
    if (d.doc_type === 'link' && d.url && /^https?:\/\//i.test(d.url)) {
      await sendText(to, `${clip(d.name, 80)}: ${d.url}`)
      continue
    }
    let sent = false
    if (d.storage_path) {
      // A short-lived link: WhatsApp fetches the file right away
      const { data } = await db.storage.from(PROJECT_DOCUMENTS_BUCKET).createSignedUrl(d.storage_path, 600)
      if (data?.signedUrl) sent = await sendDocument(to, data.signedUrl, documentFileName(d.name, d.storage_path), d.name)
    }
    // If WhatsApp could not take the file, send the website link instead
    if (!sent) await sendText(to, `${clip(d.name, 80)}: ${siteUrl()}/api/website-projects/download/${d.id}`)
  }
  if (docs.length > shown.length) await sendText(to, `More documents for this project are on our website: ${siteUrl()}/projects`)

  await sendButtons(to, 'What would you like to do next?', FOLLOW_UP_BUTTONS)
  return { title: p.title, crmProjectId: (p as any).crm_project_id || null }
}

// ---------------------------------------------------------------- CRM lead

/** Saves the person as a lead (one lead per phone number) and writes what they did in the lead's history. */
async function recordInCrm(db: any, m: WaIncoming, summary: string, project?: { title: string; crmProjectId: string | null } | null) {
  const phone = canonicalPhoneNumber(m.from)
  const now = new Date().toISOString()
  const [existing] = await findLeadsByPhone(db, phone, 'id, name, enquiry_count, last_enquiry_at, enquiry_projects', 1)

  let leadId: string | undefined = existing?.id
  let crmProject: { id: string; name: string } | null = null
  if (project?.crmProjectId) {
    const { data } = await db.from('projects').select('id, name').eq('id', project.crmProjectId).maybeSingle()
    if (data) crmProject = data
  }

  if (!leadId) {
    const { data, error } = await db.from('leads').insert({
      name: m.name || `WhatsApp ${phone.slice(-4)}`,
      phone, email: null, source_page: 'whatsapp', status: 'new',
      message: m.text || null,
      enquiry_count: 1, last_enquiry_at: now,
      enquiry_projects: project ? mergeEnquiryProjects([], project.title, true) : [],
      ...(crmProject ? { project: crmProject.name, project_id: crmProject.id } : {}),
    }).select('id').single()
    if (error || !data) throw new Error(error?.message || 'Could not save the WhatsApp lead')
    leadId = data.id
    // Two messages from a new number can arrive at the same moment and both create a lead.
    // The oldest lead wins: a newer duplicate removes itself and uses the oldest one.
    const all = await findLeadsByPhone(db, phone, 'id, created_at')
    if (all[0] && all[0].id !== leadId) {
      await db.from('leads').delete().eq('id', leadId)
      leadId = all[0].id
    }
  } else {
    // A new conversation (12 hours after the last one) counts as another enquiry; messages in the same chat do not
    const last = existing.last_enquiry_at ? new Date(existing.last_enquiry_at).getTime() : 0
    const newChat = Date.now() - last > 12 * 60 * 60 * 1000
    await db.from('leads').update({
      updated_at: now,
      ...(newChat ? { enquiry_count: (Number(existing.enquiry_count) || 1) + 1, last_enquiry_at: now } : {}),
      ...(project ? { enquiry_projects: mergeEnquiryProjects(existing.enquiry_projects, project.title, true) } : {}),
      ...(crmProject ? { project: crmProject.name, project_id: crmProject.id } : {}),
    }).eq('id', leadId)
  }

  await db.from('lead_activities').insert({
    lead_id: leadId, activity_type: 'whatsapp_message', description: `WhatsApp bot: ${summary}`,
    metadata: { wa_message_id: m.id, from: m.from },
  })
}

// ---------------------------------------------------------------- entry point

async function handleMessage(m: WaIncoming) {
  const db = createServiceClient()

  // Meta can deliver the same message twice: handle each only once
  const { data: seen } = await db.from('lead_activities').select('id').eq('metadata->>wa_message_id', m.id).limit(1)
  if (seen && seen.length > 0) return
  if (m.timestamp && Date.now() / 1000 - m.timestamp > MAX_MESSAGE_AGE_SECONDS) return

  const action = routeAction(m)
  let summary: string
  let project: { title: string; crmProjectId: string | null } | null = null

  switch (action.kind) {
    case 'explore':
      summary = 'looked at the projects list'
      await replyProjectList(m.from, action.page)
      break
    case 'project':
      project = await replyProject(m.from, action.id)
      summary = project ? `opened the project "${project.title}" and received its documents` : 'asked for a project that is no longer available'
      break
    case 'contact':
      summary = 'asked for contact details'
      await replyContact(m.from)
      break
    default:
      summary = m.text ? `sent: ${clip(m.text, 300)}` : m.actionTitle ? `chose "${m.actionTitle}"` : `sent a ${m.type || 'message'}`
      await replyWelcome(m.from)
  }

  await recordInCrm(db, m, summary, project)
}

/** Handles a WhatsApp webhook payload. Never throws: one bad message must not block the others. */
export async function handleWhatsAppWebhook(body: unknown): Promise<void> {
  if (!whatsappBotEnabled()) return
  for (const m of parseIncoming(body)) {
    try {
      await handleMessage(m)
    } catch (e) {
      console.error('[WhatsApp bot] message failed:', e instanceof Error ? e.message : e)
    }
  }
}
