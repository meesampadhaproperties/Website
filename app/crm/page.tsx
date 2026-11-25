import { requireAccess, getCachedAuthSession } from '@/lib/auth/permissions'
import DashboardClient from './DashboardClient'

export const dynamic = 'force-dynamic'

/** Server-enforced access (previously a client-side redirect after an extra permissions round trip). */
export default async function DashboardPage() {
  await requireAccess('dashboard')
  const { permissions } = await getCachedAuthSession()
  // Changing follow ups needs 'edit' on Leads (enforced by the follow-up actions)
  return <DashboardClient canEditFollowUps={permissions['leads'] === 'edit'} />
}
