import { NextResponse } from 'next/server';
import { exchangeCodeForPermanentPageTokens } from '@/lib/meta';
import { verifyClientConnectToken } from '@/app/crm/meta/actions';
import { saveMetaConnection, storePendingMetaPages } from '@/lib/meta-connect';
import { resolveSiteUrl } from '@/lib/site-config';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateToken = url.searchParams.get('state'); // The client_connect_token
  const error = url.searchParams.get('error_description') || url.searchParams.get('error');

  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  const origin = resolveSiteUrl(host, request.headers.get('x-forwarded-proto'));

  if (error || !code || !stateToken) {
    const errorMsg = error || 'Authorization was cancelled or failed.';
    return NextResponse.redirect(`${origin}/connect/meta?token=${encodeURIComponent(stateToken || '')}&error=${encodeURIComponent(errorMsg)}`);
  }

  // 1. Verify that the connect token is valid
  const tokenCheck = await verifyClientConnectToken(stateToken);
  if (!tokenCheck.valid) {
    return NextResponse.redirect(`${origin}/connect/meta?token=${encodeURIComponent(stateToken)}&error=${encodeURIComponent(tokenCheck.error || 'Invalid invitation token')}`);
  }

  // 2. Exchange code for permanent Page Access Tokens (2-step exchange)
  const redirectUri = `${origin}/api/auth/meta/callback`;
  const exchangeRes = await exchangeCodeForPermanentPageTokens(code, redirectUri);

  if (!exchangeRes.success || !exchangeRes.pages || exchangeRes.pages.length === 0) {
    const errMsg = exchangeRes.error || 'No Facebook Pages found associated with your account. You must be an Admin of the business page to connect.';
    return NextResponse.redirect(`${origin}/connect/meta?token=${encodeURIComponent(stateToken)}&error=${encodeURIComponent(errMsg)}`);
  }

  const pages = exchangeRes.pages;

  // Case A: Multiple Pages Found -> Return to /connect/meta so Alice can select the right one on the branded UI!
  if (pages.length > 1) {
    // If one of the pages matches tokenCheck.projectName closely, find it
    const expectedName = (tokenCheck.projectName || '').toLowerCase().trim();
    const exactMatch = pages.find(p => p.name.toLowerCase().trim() === expectedName || expectedName.includes(p.name.toLowerCase().trim()));

    if (exactMatch) {
      // Auto-connect the exact matching page
      await saveMetaConnection({
        token: stateToken,
        pageId: exactMatch.id,
        pageName: exactMatch.name,
        accessToken: exactMatch.access_token
      });
      return NextResponse.redirect(`${origin}/connect/meta?token=${encodeURIComponent(stateToken)}&status=success&pageName=${encodeURIComponent(exactMatch.name)}`);
    }

    // Otherwise, redirect to the page selector step with pages encoded
    // Keep page tokens SERVER-SIDE; the browser only receives the invite token and later page ids/names
    const stored = await storePendingMetaPages(stateToken, pages.map(p => ({
      id: p.id,
      name: p.name,
      followers: p.followers_count,
      category: p.category,
      access_token: p.access_token
    })));
    if (!stored) {
      return NextResponse.redirect(`${origin}/connect/meta?token=${encodeURIComponent(stateToken)}&error=${encodeURIComponent('Could not save page selection. Please try again.')}`);
    }

    return NextResponse.redirect(`${origin}/connect/meta?token=${encodeURIComponent(stateToken)}&step=select_page`);
  }

  // Case B: Exactly 1 Page Found -> Auto-connect immediately!
  const singlePage = pages[0];
  const saveRes = await saveMetaConnection({
    token: stateToken,
    pageId: singlePage.id,
    pageName: singlePage.name,
    accessToken: singlePage.access_token
  });

  if (!saveRes.success) {
    return NextResponse.redirect(`${origin}/connect/meta?token=${encodeURIComponent(stateToken)}&error=${encodeURIComponent(saveRes.error || 'Failed to save integration')}`);
  }

  return NextResponse.redirect(`${origin}/connect/meta?token=${encodeURIComponent(stateToken)}&status=success&pageName=${encodeURIComponent(singlePage.name)}`);
}
