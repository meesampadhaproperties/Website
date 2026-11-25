import { requireAccess } from '@/lib/auth/permissions'
import { getProjectsWorkspace } from './actions'
import ProjectsWorkspaceClient from './ProjectsWorkspaceClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Projects | CRM',
  description: 'Areas, projects and project documents',
}

export default async function ProjectsPage() {
  const { accessLevel } = await requireAccess('projects')
  const { areas, projects, error } = await getProjectsWorkspace()

  return (
    <ProjectsWorkspaceClient
      initialAreas={areas}
      initialProjects={projects}
      loadError={error}
      canEdit={accessLevel === 'edit'}
    />
  )
}
