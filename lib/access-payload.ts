import type { AccessLevel } from '@/lib/auth/permissions'

/**
 * Builds the rows saved by Access Control. 'whatsapp' is a legacy alias of 'inbox':
 * it is ALWAYS written from the current Inbox value (never from a stale stored row),
 * otherwise turning Inbox off could be undone by an old whatsapp row.
 */
export function buildPermissionPayload(permissions: Record<string, AccessLevel>): { module_name: string; access_level: AccessLevel }[] {
  const rows = Object.entries(permissions)
    .filter(([module_name]) => module_name !== 'whatsapp')
    .map(([module_name, access_level]) => ({ module_name, access_level }))
  if (permissions['inbox']) rows.push({ module_name: 'whatsapp', access_level: permissions['inbox'] })
  return rows
}
