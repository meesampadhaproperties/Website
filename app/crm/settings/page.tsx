import { requireAccess } from '@/lib/auth/permissions'
import SettingsClient from './SettingsClient'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const { role } = await requireAccess('settings')
  return <SettingsClient isSuperAdmin={role === 'Super Admin'} />
}
