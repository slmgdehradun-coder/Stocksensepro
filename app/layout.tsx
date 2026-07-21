import type {Metadata} from 'next';
import { Space_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import './globals.css'; // Global styles
import { AuthProvider } from '@/lib/auth';

// Scoped to a new --font-display / --font-data token pair (see globals.css @theme) rather
// than overriding Tailwind's default font-sans/font-mono, so pages that don't opt in keep
// rendering exactly as before.
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk', display: 'swap' });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-ibm-plex-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'StockSense Pro - AI Stock Analysis',
  description: 'Advanced stock market technical analysis with AI predictions',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className={`bg-ink text-fg antialiased ${spaceGrotesk.variable} ${ibmPlexMono.variable}`}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
