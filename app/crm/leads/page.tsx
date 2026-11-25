import { getLeads } from './actions'
import { getLeadStatuses, getLeadSources } from '../modules/actions'
import LeadsClient from './LeadsClient'
import { requireAccess } from '@/lib/auth/permissions'

export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  const { role: userRole, accessLevel } = await requireAccess('leads')

  // Run independent database queries in parallel with Promise.all to cut latency
  const [
    leadsRes,
    statusesRes,
    sourcesRes
  ] = await Promise.all([
    getLeads(1, 100),
    getLeadStatuses(),
    getLeadSources()
  ])

  const initialLeads = leadsRes.data || []
  const totalCount = leadsRes.count || 0
  const leadStatuses = statusesRes.data || []
  const leadSources = sourcesRes.data || []

  return (
    <div className="w-full">
      <LeadsClient 
        initialLeads={initialLeads} 
        totalCount={totalCount} 
        userRole={userRole} 
        canEdit={accessLevel === 'edit'}
        initialStatuses={leadStatuses}
        initialSources={leadSources}
      />
    </div>
  )
}
