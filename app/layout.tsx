import { COMPANY_NAME } from '@/lib/site-config'
import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'sonner';
import { BrandThemeApplier } from '@/app/crm/settings/brand-settings/BrandThemeApplier';
import { BRAND_PRELOAD_SCRIPT } from '@/lib/branding';
import { THEME_PRELOAD_SCRIPT } from '@/lib/theme';

export const metadata: Metadata = {
  title: COMPANY_NAME,
  description: 'Official website',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BRAND_PRELOAD_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_PRELOAD_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-[#f7f8fa] text-[#0f1d33] antialiased">
        <BrandThemeApplier />
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
