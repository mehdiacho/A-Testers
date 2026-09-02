import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_CATEGORIES, type AppCategory } from '@a-testers/shared';
import { listOpenApps } from '@/lib/server-data';
import { AppCard } from '@/components/app-card';

export const metadata: Metadata = {
  title: 'Apps looking for testers',
  description:
    'Browse Android apps currently running Google Play closed tests and looking for testers. Test one, earn a seat for your own app.',
};

// The catalogue is the platform's front door, so it is server-rendered for search
// engines — but rendered per request rather than prerendered, because the build machine
// has no Firestore credentials. Once the project exists, this can move to ISR
// (`export const revalidate = 60`) to keep crawls off the database.
export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ category?: string }>;
}

export default async function AppsPage({ searchParams }: Props) {
  const { category: raw } = await searchParams;
  const category = APP_CATEGORIES.includes(raw as AppCategory) ? (raw as AppCategory) : undefined;

  const { apps, totalListed } = await listOpenApps(category);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Apps looking for testers</h1>
        <p className="mt-1 text-sm muted">
          {apps.length} accepting testers right now
          {totalListed > apps.length && <> · {totalListed} listed all-time</>}. Every app you test and
          get approved for earns you one seat.
        </p>
      </header>

      <CategoryFilter active={category} />

      {apps.length === 0 ? (
        <EmptyState category={category} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <li key={app.id}>
              <AppCard app={app} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoryFilter({ active }: { active?: AppCategory }) {
  const base = 'chip border capitalize transition-colors';
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Filter by category">
      <Link
        href="/apps"
        className={`${base} ${active ? 'muted' : 'border-brand-500 text-brand-500'}`}
        style={active ? { borderColor: 'var(--border)' } : undefined}
      >
        All
      </Link>
      {APP_CATEGORIES.map((c) => {
        const on = active === c;
        return (
          <Link
            key={c}
            href={`/apps?category=${c}`}
            className={`${base} ${on ? 'border-brand-500 text-brand-500' : 'muted'}`}
            style={on ? undefined : { borderColor: 'var(--border)' }}
          >
            {c}
          </Link>
        );
      })}
    </nav>
  );
}

function EmptyState({ category }: { category?: AppCategory }) {
  return (
    <div className="card p-10 text-center">
      <p className="font-medium">
        {category ? `No ${category} apps are accepting testers right now.` : 'No apps are accepting testers right now.'}
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm muted">
        Listings fill quickly. Check back shortly, or list your own app — developers who list are the
        ones who keep the exchange stocked.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        {category && (
          <Link href="/apps" className="btn-secondary">
            Show all categories
          </Link>
        )}
        <Link href="/dashboard/listings" className="btn-primary">
          List my app
        </Link>
      </div>
    </div>
  );
}
