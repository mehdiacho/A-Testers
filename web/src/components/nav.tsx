'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

const LINKS = [
  { href: '/apps', label: 'Apps to test' },
  { href: '/dashboard', label: 'My testing' },
  { href: '/dashboard/listings', label: 'My apps' },
];

export function Nav() {
  const { user, profile, loading, signIn, signOut } = useAuth();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b backdrop-blur" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--surface) 85%, transparent)' }}>
      <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="font-semibold tracking-tight">
          A<span className="text-brand-500">·</span>Testers
        </Link>

        <div className="hidden items-center gap-1 sm:flex">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active ? 'text-[color:var(--text)] font-medium' : 'muted hover:text-[color:var(--text)]'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-3">
          {loading ? (
            <div className="h-8 w-24 animate-pulse rounded-lg" style={{ background: 'var(--border)' }} />
          ) : user ? (
            <>
              {/* The seat balance is the single number that governs everything a
                  developer can do, so it lives in the chrome rather than a settings page. */}
              <SeatBadge seats={profile?.seatBalance ?? null} held={profile?.seatsHeld ?? 0} />
              <button onClick={() => void signOut()} className="btn-ghost">
                Sign out
              </button>
            </>
          ) : (
            <button onClick={() => void signIn()} className="btn-primary">
              Sign in with Google
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}

function SeatBadge({ seats, held }: { seats: number | null; held: number }) {
  if (seats === null) {
    return <div className="h-7 w-16 animate-pulse rounded-full" style={{ background: 'var(--border)' }} />;
  }
  return (
    <Link
      href="/dashboard/seats"
      title={held > 0 ? `${seats} available, ${held} held by pending testers` : `${seats} seats available`}
      className={`chip border ${seats > 0 ? 'text-brand-500' : 'muted'}`}
      style={{ borderColor: 'var(--border)' }}
    >
      <span className="font-semibold tabular-nums">{seats}</span>
      <span>{seats === 1 ? 'seat' : 'seats'}</span>
      {held > 0 && <span className="muted tabular-nums">+{held} held</span>}
    </Link>
  );
}
