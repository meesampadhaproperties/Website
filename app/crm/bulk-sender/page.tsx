import { requireAccess, getCachedAuthSession } from '@/lib/auth/permissions'
import { getBulkLeads, getBulkSenderOptions } from './actions'
import BulkSenderClient from './BulkSenderClient'

export const dynamic = 'force-dynamic'
// Bulk sends (up to 200 leads) can take longer than a normal request
export const maxDuration = 60

export const metadata = {
  title: 'Bulk Sender | CRM',
  description: 'Send email, SMS or WhatsApp messages to one or many leads',
}

export default async function BulkSenderPage() {
  await requireAccess('bulk_sender')
  const { permissions, role } = await getCachedAuthSession()
  const [options, first] = await Promise.all([getBulkSenderOptions(), getBulkLeads({}, 1, 50)])
  return (
    <BulkSenderClient
      options={options}
      initialLeads={first.data}
      initialCount={first.count}
      canSend={permissions['bulk_sender'] === 'edit'}
      canDelete={permissions['bulk_sender'] === 'edit' && role === 'Super Admin'}
    />
  )
}
