import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppProviders } from '@providers/AppProviders';
import { appMetadataBase, appOrigin, internalPortalRobots } from '@shared/lib/site-config';
import { MotionLayout } from '@shared/components/MotionLayout';
import { assetPath } from '@shared/lib/asset-path';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const viewport: Viewport = {
  themeColor: '#020617',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: appMetadataBase,
  title: {
    default: 'GMS Enterprise Portal',
    template: '%s | GMS Enterprise Portal',
  },
  description: 'Enterprise Guest Management System for secure facility access and visitor coordination.',
  keywords: ['guest management', 'security', 'facility access', 'visitor tracking'],
  authors: [{ name: 'Example Corp GMS Team' }],
  robots: internalPortalRobots,
  manifest: assetPath('/manifest.json'),
  icons: {
    icon: [
      { url: assetPath('/icons/icon-192.png'), sizes: '192x192', type: 'image/png' },
      { url: assetPath('/icons/icon-512.png'), sizes: '512x512', type: 'image/png' },
    ],
    apple: assetPath('/icons/apple-touch-icon.png'),
    shortcut: assetPath('/icons/favicon.png'),
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: appOrigin,
    siteName: 'GMS Enterprise Portal',
    title: 'GMS Enterprise Portal',
    description: 'Enterprise Guest Management System for secure facility access and visitor coordination.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased selection:bg-brand-primary/30 bg-surface-background text-content-base`} suppressHydrationWarning>
        <AppProviders>
          <MotionLayout>
            {children}
          </MotionLayout>
        </AppProviders>
      </body>
    </html>
  );
}
