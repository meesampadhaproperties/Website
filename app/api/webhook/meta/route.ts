import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchLeadData, fetchFormQuestions } from '@/lib/meta';
import { ingestMetaLead } from '@/lib/meta-ingest';
import { isValidMetaSignature } from '@/lib/meta-signature';

/**
 * Meta Webhook Receiver (Real-Time Facebook & Instagram Lead Ads)
 */

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  // No hardcoded fallback: an unset verify token must never be guessable
  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!expectedToken) {
    console.error('[Meta Webhook] META_WEBHOOK_VERIFY_TOKEN is not configured. Rejecting handshake.');
    return new Response('Webhook not configured', { status: 503 });
  }

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('[Meta Webhook] Verification handshake successful!');
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  console.warn('[Meta Webhook] Verification handshake failed. Token mismatch.');
  return new Response('Forbidden', { status: 403 });
}

export async function POST(request: Request) {
  try {
    // 0. Authenticate the sender: only Meta knows META_APP_SECRET
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
      console.error('[Meta Webhook] META_APP_SECRET is not configured. Rejecting event.');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
    }

    const rawBody = await request.text();
    if (!isValidMetaSignature(rawBody, request.headers.get('x-hub-signature-256'), appSecret)) {
      console.warn('[Meta Webhook] Invalid or missing X-Hub-Signature-256. Rejecting event.');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const body = JSON.parse(rawBody);

    if (body.object !== 'page') {
      return NextResponse.json({ status: 'ignored', reason: 'Not a page event' }, { status: 200 });
    }

    const supabaseAdmin = createServiceClient();
    const entries = body.entry || [];

    for (const entry of entries) {
      const pageId = entry.id;
      const changes = entry.changes || [];

      for (const change of changes) {
        if (change.field === 'leadgen') {
          const leadgenId = change.value?.leadgen_id;
          const formId = change.value?.form_id;

          if (!leadgenId) continue;

          console.log(`[Meta Webhook] New lead event received: Lead ID ${leadgenId}, Form ID ${formId}, Page ID ${pageId}`);

          // 1. Look up project by page_id
          const { data: integration } = await supabaseAdmin
            .from('project_integrations')
            .select('project_id, page_name, access_token, projects(name)')
            .eq('page_id', pageId)
            .maybeSingle();

          if (!integration || !integration.access_token) {
            console.warn(`[Meta Webhook] No project integration found for Facebook Page ID ${pageId}`);
            continue;
          }

          const projectName = (integration.projects as any)?.name || integration.page_name || 'Meta Leads';

          // 2. Real question labels/types for this form, then the lead's answers from Meta
          const questions = await fetchFormQuestions(formId, integration.access_token);
          const leadRes = await fetchLeadData(leadgenId, integration.access_token, questions);
          if (!leadRes.success || !leadRes.lead) {
            console.error(`[Meta Webhook] Failed to fetch lead data from Meta: ${leadRes.error}`);
            continue;
          }

          // 3. Save (dedupe by lead id; repeat customers get the submission appended to their history)
          const result = await ingestMetaLead(supabaseAdmin, {
            lead: leadRes.lead,
            formId: formId || leadRes.lead.formId,
            projectId: integration.project_id,
            projectName,
            origin: 'lead',
            questions,
            note: 'real-time webhook',
          });
          if (result.outcome === 'skipped') {
            console.log(`[Meta Webhook] Lead ${leadgenId}: skipped (form is switched off in the CRM)`);
            continue;
          }
          if (result.outcome === 'failed') {
            console.error(`[Meta Webhook] Database insert error: ${result.error}`);
            continue;
          }
          console.log(`[Meta Webhook] Lead ${leadgenId}: ${result.outcome}`);

          // 6. Update form lead counter
          if (formId) {
            await supabaseAdmin
              .from('meta_forms')
              .update({
                last_lead_at: new Date().toISOString()
              })
              .eq('form_id', formId);
          }
        }
      }
    }

    return NextResponse.json({ status: 'success' }, { status: 200 });
  } catch (err: any) {
    console.error('[Meta Webhook] Error processing event:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
