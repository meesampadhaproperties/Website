/**
 * How WhatsApp entries in a lead's history are shown in the CRM's "WhatsApp Activity" chat view.
 * Pure: safe on client and server.
 *
 *   whatsapp_in       what the customer sent or tapped (saved by the bot)
 *   whatsapp_out      what the bot replied            (saved by the bot)
 *   whatsapp_message  older bot entries (one summary line per customer message)
 *   "incoming whatsapp" / "outgoing whatsapp"  entries from the previous bot (text in `details`)
 */

export const WHATSAPP_ACTIVITY_TYPES = ['whatsapp_in', 'whatsapp_out', 'whatsapp_message'] as const

export interface ActivityLike {
  activity_type?: string | null
  description?: string | null
  details?: string | null
}

export type WhatsAppBubble =
  | { side: 'customer'; text: string }
  | { side: 'bot'; text: string }
  | { side: 'chip'; text: string }

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/** Text of an entry from the previous bot, which stored "Message: …" lines in `details`. */
function legacyText(details: string): string {
  const line = details.split('\n').find((l) => l.startsWith('Message: '))
  const msg = line ? line.slice('Message: '.length).trim().replace(/^"(.*)"$/, '$1') : ''
  return msg && msg !== '(no text content)' ? msg : details.trim() || '(no text)'
}

/** Which side of the chat an entry goes on, and its text. Anything that is not a WhatsApp message becomes a small grey note. */
export function whatsappBubble(a: ActivityLike): WhatsAppBubble {
  const type = String(a.activity_type || '').trim().toLowerCase()
  const text = String(a.description ?? a.details ?? '').trim()

  if (type === 'whatsapp_in') return { side: 'customer', text: text || '(message)' }
  if (type === 'whatsapp_out') return { side: 'bot', text: text || '(reply)' }
  if (type === 'whatsapp_message') {
    // Older entries: "WhatsApp bot: sent: hi" / "WhatsApp bot: looked at the projects list"
    const t = text.replace(/^WhatsApp bot:\s*/i, '')
    return { side: 'customer', text: t.replace(/^sent:\s*/i, '') || '(message)' }
  }
  if (type.includes('incoming whatsapp')) return { side: 'customer', text: legacyText(String(a.details ?? a.description ?? '')) }
  if (type.includes('outgoing whatsapp')) return { side: 'bot', text: text || '(reply)' }

  const label = type === 'bot started' ? 'Bot Started Conversation' : titleCase(String(a.activity_type || 'Activity'))
  return { side: 'chip', text: text && !text.includes('Provider timestamp') ? `${label}: ${text}` : label }
}
