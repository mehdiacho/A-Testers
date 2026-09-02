import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AuthProvider } from '@/lib/auth-context';
import { Nav } from '@/components/nav';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'A-Testers — find testers for Google Play closed testing',
    template: '%s · A-Testers',
  },
  description:
    'A community exchange for Google Play closed testing. Test other developers’ apps to earn seats, then spend them to get the 12 testers your own app needs.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}>
        <AuthProvider>
          <Nav />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 py-10 text-xs muted">
            A-Testers is not affiliated with Google. “Google Play” is a trademark of Google LLC.
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
