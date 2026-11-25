import ReportsClient from './ReportsClient'
import { requireAccess } from '@/lib/auth/permissions'
import { getLeadsReport } from './actions'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Reports | CRM',
  description: 'Lead status KPIs, trends, sources and projects',
}

export default async function ReportsPage() {
  await requireAccess('reports')
  const { data, error } = await getLeadsReport('all')
  return <ReportsClient initialReport={data} initialError={error} />
}
