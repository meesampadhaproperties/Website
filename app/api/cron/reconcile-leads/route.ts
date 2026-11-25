import { NextResponse } from 'next/server';
import { checkCronAuth } from '@/lib/cron-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchHistoricalLeads, fetchFormQuestions } from '@/lib/meta';
import { ingestMetaLead } from '@/lib/meta-ingest';

/**
 * Automated Lead Reconciliation Cron Job (Fail-Safe for Webhooks)
 * Runs once per day on Vercel Hobby tier (or on-demand) to verify that no leads
 * were missed during webhook network timeouts or server restarts.
 */
export async function GET(request: Request) {
  try {
    // Fail closed; header-only secret; constant-time compare
    const cronAuth = checkCronAuth(request);
    if (!cronAuth.ok) return NextResponse.json({ error: cronAuth.error }, { status: cronAuth.status });

    const supabaseAdmin = createServiceClient();

    // 1. Fetch all connected Meta integrations across all projects
    const { data: integrations, error: intErr } = await supabaseAdmin
      .from('project_integrations')
      .select('project_id, page_name, access_token, projects(name)')
      .eq('is_connected', true);

    if (intErr || !integrations || integrations.length === 0) {
      return NextResponse.json({
        status: 'completed',
        message: 'No active integrations found to reconcile.',
        projectsCount: 0
      });
    }

    let totalChecked = 0;
    let totalRecovered = 0;
    const projectSummaries = [];

    // 2. Iterate through all projects in a single unified sweep
    for (const integration of integrations) {
      if (!integration.access_token) continue;

      const projectId = integration.project_id;
      const projectName = (integration.projects as any)?.name || integration.page_name || 'Project';

      // Fetch active forms for this project
      const { data: forms } = await supabaseAdmin
        .from('meta_forms')
        .select('form_id')
        .eq('project_id', projectId);

      const formIds = (forms || []).map(f => f.form_id);
      if (formIds.length === 0) continue;

      let projRecovered = 0;
      let projChecked = 0;

      for (const fid of formIds) {
        // Check rolling 3-day window to catch any recent webhook gaps
        const questions = await fetchFormQuestions(fid, integration.access_token);
        const pullRes = await fetchHistoricalLeads(fid, integration.access_token, 100, 3, questions);
        if (!pullRes.success || !pullRes.leads) continue;

        projChecked += pullRes.leads.length;

        for (const lead of pullRes.leads) {
          const result = await ingestMetaLead(supabaseAdmin, {
            lead, formId: fid, projectId, projectName, origin: 'reconciled', questions,
            note: 'recovered by daily reconciliation',
          });
          if (result.outcome === 'inserted' || result.outcome === 'appended') projRecovered += 1;
        }
      }

      totalChecked += projChecked;
      totalRecovered += projRecovered;

      projectSummaries.push({
        project: projectName,
        checked: projChecked,
        recovered: projRecovered
      });
    }

    return NextResponse.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      projectsReconciled: integrations.length,
      totalLeadsChecked: totalChecked,
      newLeadsRecovered: totalRecovered,
      details: projectSummaries
    });
  } catch (err: any) {
    console.error('[Reconciliation Cron Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
