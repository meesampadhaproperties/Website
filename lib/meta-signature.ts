import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifies Meta's X-Hub-Signature-256 header: "sha256=" + HMAC-SHA256(rawBody, META_APP_SECRET).
 * Must be computed over the exact raw request bytes, before JSON parsing.
 */
export function isValidMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=') || !appSecret) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const received = signatureHeader.slice('sha256='.length);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(received, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
