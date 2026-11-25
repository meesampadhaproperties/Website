import { requireAccess } from '@/lib/auth/permissions'
import { getWebsiteProjectsWorkspace } from './actions'
import WebsiteProjectsClient from './WebsiteProjectsClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Website Projects | CRM',
  description: 'Projects and categories shown on the public website',
}

export default async function WebsiteProjectsPage() {
  // Same permission as the Projects page: the downloads come from its documents
  const { accessLevel } = await requireAccess('projects')
  const { categories, projects, crmProjects, error } = await getWebsiteProjectsWorkspace()

  return (
    <WebsiteProjectsClient
      initialCategories={categories}
      initialProjects={projects}
      crmProjects={crmProjects}
      loadError={error}
      canEdit={accessLevel === 'edit'}
    />
  )
}
