import React from 'react'
import { getProjectsWithFormCounts } from './actions'
import { ProjectsClient } from './ProjectsClient'
import { requireAccess } from '@/lib/auth/permissions'

export const dynamic = 'force-dynamic'

export default async function MetaPage() {
  const { accessLevel } = await requireAccess('meta')
  const { data: projects } = await getProjectsWithFormCounts()

  return <ProjectsClient initialProjects={projects || []} canEdit={accessLevel === 'edit'} />
}
