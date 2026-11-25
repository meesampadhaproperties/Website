import InboxDashboardClient from './InboxDashboardClient'
import { getInboxLeadsWithActivity, getInboxAnalytics, getInboxFilterOptions } from './actions'
import { requireAccess, getCachedAuthSession } from '@/lib/auth/permissions'
import { getLeadStatuses } from '../modules/actions'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Inbox | CRM',
  description: 'Incoming customer inquiries, form submissions, and messages',
}

export default async function InboxDashboardPage() {
  const { role: userRole } = await requireAccess('inbox')
  const { permissions } = await getCachedAuthSession()

  const [
    { data: initialLeads, count: totalCount },
    analytics,
    filterOptions,
    statusesRes
  ] = await Promise.all([
    getInboxLeadsWithActivity(1, 50),
    getInboxAnalytics(),
    getInboxFilterOptions(),
    // Needs 'leads' view; users without it still see read-only status badges
    getLeadStatuses().catch(() => ({ success: false, data: [] }))
  ])

  return (
    <InboxDashboardClient 
      initialLeads={initialLeads || []} 
      totalCount={totalCount || 0} 
      initialAnalytics={analytics}
      userRole={userRole} 
      canChangeStatus={permissions['leads'] === 'edit'}
      canMessage={(permissions['inbox'] || permissions['whatsapp']) === 'edit' || permissions['bulk_sender'] === 'edit'}
      projects={filterOptions.projects || []}
      forms={filterOptions.forms || []}
      statuses={statusesRes?.data || []}
    />
  )
}
