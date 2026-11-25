import ModulesClient from './ModulesClient'
import { requireAccess } from '@/lib/auth/permissions'
import { getReportRecipients, getWaRecipients, getLeadStatuses, getLeadSources } from './actions'
import { getRoles, listAdminUsers } from '../users/actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Modules & Feature Controls | CRM',
  description: 'Manage notification recipients, lead pipeline statuses, lead sources, and access permissions',
}

export default async function ModulesPage() {
  await requireAccess('modules')

  // Run all 6 database queries in parallel with Promise.all to cut roundtrip latency
  const [
    recipientsRes,
    waRecipientsRes,
    leadStatusesRes,
    leadSourcesRes,
    rolesRes,
    usersRes
  ] = await Promise.all([
    getReportRecipients(),
    getWaRecipients(),
    getLeadStatuses(),
    getLeadSources(),
    getRoles(),
    listAdminUsers()
  ])

  return (
    <ModulesClient 
      initialRecipients={recipientsRes.data || []} 
      initialWaRecipients={waRecipientsRes.data || []}
      roles={rolesRes.data || []}
      users={usersRes.users || []}
      initialLeadStatuses={leadStatusesRes.data || []}
      initialLeadSources={leadSourcesRes.data || []}
    />
  )
}
