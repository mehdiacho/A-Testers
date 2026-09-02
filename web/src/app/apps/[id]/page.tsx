import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { openSlots } from '@a-testers/shared';
import { getAppById } from '@/lib/server-data';
import { ReservePanel } from '@/components/reserve-panel';

// Rendered per request — see the note in ../page.tsx about build-time credentials.
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const app = await getAppById(id);
  if (!app) return { title: 'App not found' };

  return {
    title: `${app.name} needs testers`,
    description: `${app.shortDescription} — join the closed test for ${app.name} (${app.packageName}) and earn a seat towards testers for your own app.`,
  };
}

export default async function AppPage({ params }: Props) {
  const { id } = await params;
  const app = await getAppById(id);

  // Draft and rejected listings are not public; the security rules deny them too, this
  // just avoids rendering a broken page for a stale link.
  if (!app || !['open', 'full', 'completed'].includes(app.status)) notFound();

  const slots = openSlots(app);

  return (
    <div className="space-y-6">
      <Link href="/apps" className="text-sm muted hover:text-[color:var(--text)]">
        ← All apps
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <article className="space-y-6">
          <header className="flex items-start gap-4">
            {app.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={app.iconUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
            ) : (
              <div
                className="grid size-16 shrink-0 place-items-center rounded-xl text-xl font-semibold muted"
                style={{ background: 'var(--surface-raised)' }}
                aria-hidden
              >
                {app.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{app.name}</h1>
              <p className="font-mono text-sm muted">{app.packageName}</p>
              <span className="chip mt-2 border capitalize muted" style={{ borderColor: 'var(--border)' }}>
                {app.category}
              </span>
            </div>
          </header>

          <p className="text-[15px] leading-relaxed">{app.shortDescription}</p>

          <section className="card p-5">
            <h2 className="text-sm font-medium">Testing progress</h2>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">{app.seatsFilled}</span>
              <span className="muted">of {app.seatsRequested} testers approved</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
              <div
                className="h-full rounded-full bg-brand-500 transition-all"
                style={{ width: `${Math.min(100, (app.seatsFilled / Math.max(1, app.seatsRequested)) * 100)}%` }}
              />
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-4 text-sm">
              <Stat label="Open slots" value={slots} />
              <Stat label="Pending review" value={app.seatsReserved} />
              <Stat label="Window" value={`${app.requiredDays} days`} />
            </dl>
          </section>

          <section>
            <h2 className="text-sm font-medium">What you will be asked to do</h2>
            <ol className="mt-3 space-y-2 text-sm muted">
              <li>1. Join the developer’s Google Group with your Play account.</li>
              <li>2. Open the closed-test opt-in link and install the app.</li>
              <li>3. Upload a screenshot as proof of install.</li>
              <li>
                4. Stay opted in and check in daily for {app.requiredDays} days — this is what Google
                actually measures.
              </li>
            </ol>
          </section>
        </article>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <ReservePanel app={app} />
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs muted">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}
