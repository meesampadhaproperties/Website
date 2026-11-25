/** @type {import('next').NextConfig} */

// Security headers for every route (REQ-88 #5).
// CSP is limited to directives that cannot break Next.js inline runtime scripts:
// it blocks clickjacking, plugin/object embeds, <base> hijacking and off-site form posts.
const securityHeaders = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const supabaseHost = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').hostname; } catch { return ''; }
})();

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Previously hostname '**' (open image proxy). Only the project's Supabase storage is allowed.
    remotePatterns: supabaseHost ? [{ protocol: 'https', hostname: supabaseHost }] : [],
  },
  // Typing /crm at the end of any website URL (e.g. /services/crm) opens the CRM.
  async redirects() {
    return [
      { source: '/:path+/crm', destination: '/crm', permanent: false },
      // The Gallery page was replaced by Projects.
      { source: '/gallery', destination: '/projects', permanent: true },
      { source: '/services', destination: '/projects', permanent: true },
    ];
  },
  async headers() {
    // The CRM is hidden from the public: no links to it, and search engines are told not to index it.
    const noIndex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/crm/:path*', headers: noIndex },
      { source: '/crm', headers: noIndex },
      { source: '/connect/:path*', headers: noIndex },
      { source: '/api/:path*', headers: noIndex },
    ];
  },
};

export default nextConfig;
