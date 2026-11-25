import { notFound } from 'next/navigation'
import { requireAccess } from '@/lib/auth/permissions'
import { getProjectData } from '../actions'
import ProjectDataClient from './ProjectDataClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Project Data | CRM',
}

export default async function ProjectDataPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccess('projects')
  const { id } = await params
  const { project, items, error } = await getProjectData(id)
  if (!project && !error) notFound()
  return <ProjectDataClient project={project} items={items} loadError={error} />
}
