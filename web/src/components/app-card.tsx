import Link from 'next/link';
import { openSlots, type AppDoc } from '@a-testers/shared';

export function AppCard({ app }: { app: AppDoc }) {
  const slots = openSlots(app);

  return (
    <Link href={`/apps/${app.id}`} className="card block p-4 transition-colors hover:border-brand-500">
      <div className="flex items-start gap-3">
        <AppIcon app={app} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium">{app.name}</h3>
          <p className="truncate font-mono text-xs muted">{app.packageName}</p>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 text-sm muted">{app.shortDescription}</p>

      <div className="mt-4 flex items-center justify-between">
        <span className="chip border capitalize muted" style={{ borderColor: 'var(--border)' }}>
          {app.category}
        </span>
        <SlotCount slots={slots} filled={app.seatsFilled} requested={app.seatsRequested} />
      </div>
    </Link>
  );
}

function AppIcon({ app }: { app: AppDoc }) {
  if (app.iconUrl) {
    // Icons come from our own Storage bucket; next/image would need remotePatterns
    // configured per project, so a plain img keeps deployment portable.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={app.iconUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover" />;
  }
  return (
    <div
      className="grid size-10 shrink-0 place-items-center rounded-lg text-sm font-semibold muted"
      style={{ background: 'var(--surface)' }}
      aria-hidden
    >
      {app.name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function SlotCount({ slots, filled, requested }: { slots: number; filled: number; requested: number }) {
  if (slots === 0) {
    return <span className="chip muted">Full</span>;
  }
  return (
    <span className="text-xs">
      <span className="font-semibold text-brand-500 tabular-nums">{slots}</span>
      <span className="muted"> {slots === 1 ? 'slot' : 'slots'} left</span>
      <span className="muted tabular-nums"> · {filled}/{requested}</span>
    </span>
  );
}
