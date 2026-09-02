'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import {
  computeRetention,
  type AppDoc,
  type PlatformConfig,
  type ReservationDoc,
  type UserDoc,
} from '@a-testers/shared';
import { db } from '@/lib/firebase';
import { tsToIso, timeAgo } from '@/lib/firestore-utils';

/**
 * The 14-day retention board.
 *
 * This is the view the reference platform does not have. Google requires N testers opted
 * in for D *continuous* days and, since 2026, checks that they actually used the app — so
 * the failure that matters is a tester going quiet on day 3 and the developer finding out
 * on day 14, when the clock has already reset. Everything here is arranged around
 * surfacing that while there is still time to replace them.
 */
export function RetentionBoard({
  app,
  reservations,
  config,
}: {
  app: AppDoc;
  reservations: ReservationDoc[];
  config: PlatformConfig;
}) {
  const approved = useMemo(() => reservations.filter((r) => r.status === 'approved'), [reservations]);
  const testers = useTesterProfiles(approved.map((r) => r.testerUid));

  // Recompute on a timer as well as on data change: "hours since last check-in" drifts
  // past the 48h threshold on its own, with no Firestore event to trigger a re-render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const retention = useMemo(
    () =>
      computeRetention({
        app: { testingStartsAt: tsToIso(app.testingStartsAt), requiredDays: app.requiredDays },
        approved: approved.map((r) => ({ lastCheckinAt: tsToIso(r.lastCheckinAt) })),
        config,
        now: new Date(now),
      }),
    [app.testingStartsAt, app.requiredDays, approved, config, now],
  );

  if (!app.testingStartsAt) {
    return (
      <section className="card p-6">
        <h2 className="font-medium">The 14-day window has not started</h2>
        <p className="mt-2 max-w-lg text-sm muted">
          The clock starts when you approve your first tester. Until then this listing is still
          recruiting — {app.seatsRequested - app.seatsFilled} more{' '}
          {app.seatsRequested - app.seatsFilled === 1 ? 'tester' : 'testers'} to go.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="card p-6">
        <Verdict retention={retention} approvedCount={approved.length} />

        <div className="mt-5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">
              Day <span className="tabular-nums">{Math.min(retention.dayOfWindow, retention.totalDays)}</span> of{' '}
              <span className="tabular-nums">{retention.totalDays}</span>
            </span>
            <span className="muted tabular-nums">
              {retention.activeTesters} of {retention.requiredTesters} testers active
            </span>
          </div>
          <WindowBar retention={retention} />
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Approved" value={approved.length} />
          <Stat label="Active" value={retention.activeTesters} tone="good" />
          <Stat label="Gone quiet" value={retention.atRiskTesters} tone={retention.atRiskTesters > 0 ? 'warn' : undefined} />
          <Stat
            label="Short by"
            value={Math.max(0, retention.requiredTesters - retention.activeTesters)}
            tone={retention.activeTesters < retention.requiredTesters ? 'warn' : 'good'}
          />
        </dl>
      </div>

      {approved.length > 0 && (
        <TesterTable approved={approved} testers={testers} totalDays={retention.totalDays} now={now} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function Verdict({
  retention,
  approvedCount,
}: {
  retention: ReturnType<typeof computeRetention>;
  approvedCount: number;
}) {
  const short = retention.requiredTesters - retention.activeTesters;

  if (retention.eligibleForProduction) {
    return (
      <div>
        <h2 className="text-lg font-medium text-brand-500">Ready to apply for production</h2>
        <p className="mt-1 text-sm muted">
          {retention.totalDays} continuous days with {retention.activeTesters} active testers. Open
          Play Console and request production access.
        </p>
      </div>
    );
  }

  if (short > 0) {
    return (
      <div>
        <h2 className="text-lg font-medium text-warn-400">
          {approvedCount < retention.requiredTesters
            ? `You need ${short} more ${short === 1 ? 'tester' : 'testers'}`
            : `${retention.atRiskTesters} ${retention.atRiskTesters === 1 ? 'tester has' : 'testers have'} gone quiet`}
        </h2>
        <p className="mt-1 max-w-lg text-sm muted">
          {approvedCount < retention.requiredTesters
            ? 'Google counts testers who stay opted in for the whole window. Recruit the remaining slots before the clock matters.'
            : 'Google checks that testers actually used your app. Anyone silent for more than 48 hours puts the window at risk — message them, or open more slots to replace them.'}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-medium text-brand-500">On track</h2>
      <p className="mt-1 text-sm muted">
        {retention.activeTesters} testers are active with {retention.totalDays - retention.dayOfWindow}{' '}
        {retention.totalDays - retention.dayOfWindow === 1 ? 'day' : 'days'} left in the window.
      </p>
    </div>
  );
}

function WindowBar({ retention }: { retention: ReturnType<typeof computeRetention> }) {
  const pct = Math.min(100, (retention.dayOfWindow / Math.max(1, retention.totalDays)) * 100);
  const healthy = retention.activeTesters >= retention.requiredTesters;

  return (
    <div className="mt-2">
      <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
        <div
          className={`h-full rounded-full transition-all ${healthy ? 'bg-brand-500' : 'bg-warn-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* The bar tracks elapsed days, but the colour tracks tester health — a full bar
          with too few active testers means the window has to start over. */}
      {!healthy && retention.windowComplete && (
        <p className="mt-2 text-xs text-warn-400">
          The window elapsed without enough active testers, so Google’s counter has reset. Get back
          to {retention.requiredTesters} active testers to start a fresh {retention.totalDays} days.
        </p>
      )}
    </div>
  );
}

function TesterTable({
  approved,
  testers,
  totalDays,
  now,
}: {
  approved: ReservationDoc[];
  testers: Record<string, UserDoc>;
  totalDays: number;
  now: number;
}) {
  const rows = useMemo(() => {
    const staleCutoff = now - 48 * 3600 * 1000;
    return approved
      .map((r) => {
        const lastIso = tsToIso(r.lastCheckinAt);
        const lastMs = lastIso ? new Date(lastIso).getTime() : 0;
        return {
          reservation: r,
          daysCheckedIn: Object.keys(r.checkins ?? {}).length,
          lastMs,
          atRisk: lastMs < staleCutoff,
        };
      })
      // At-risk testers first: this table exists to make them impossible to miss.
      .sort((a, b) => Number(b.atRisk) - Number(a.atRisk) || a.lastMs - b.lastMs);
  }, [approved, now]);

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs muted">
            <th className="px-4 py-3 font-medium">Tester</th>
            <th className="px-4 py-3 font-medium">Days in</th>
            <th className="px-4 py-3 font-medium">Streak</th>
            <th className="px-4 py-3 font-medium">Last check-in</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ reservation: r, daysCheckedIn, atRisk }) => (
            <tr key={r.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
              <td className="px-4 py-3">
                {testers[r.testerUid]?.displayName ?? (
                  <span className="font-mono text-xs muted">{r.testerUid.slice(0, 10)}</span>
                )}
              </td>
              <td className="px-4 py-3 tabular-nums">
                {daysCheckedIn}
                <span className="muted"> / {totalDays}</span>
              </td>
              <td className="px-4 py-3 tabular-nums muted">{r.checkinStreak ?? 0}</td>
              <td className="px-4 py-3 muted">{timeAgo(r.lastCheckinAt, now)}</td>
              <td className="px-4 py-3">
                <span className={`chip border ${atRisk ? 'text-warn-400' : 'text-brand-500'}`} style={{ borderColor: 'var(--border)' }}>
                  {atRisk ? 'Gone quiet' : 'Active'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'warn' }) {
  const color = tone === 'good' ? 'text-brand-500' : tone === 'warn' ? 'text-warn-400' : '';
  return (
    <div>
      <dt className="text-xs muted">{label}</dt>
      <dd className={`mt-0.5 text-xl font-semibold tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Fetch the display names for a set of testers. Read once rather than subscribed —
 * a name changing mid-window is not worth a live listener per tester.
 */
function useTesterProfiles(uids: string[]): Record<string, UserDoc> {
  const [profiles, setProfiles] = useState<Record<string, UserDoc>>({});
  const key = uids.slice().sort().join(',');

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) return;

    let cancelled = false;
    (async () => {
      const found: Record<string, UserDoc> = {};
      // `in` takes at most 30 values per query.
      for (let i = 0; i < ids.length; i += 30) {
        const batch = ids.slice(i, i + 30);
        const snap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', batch)));
        for (const d of snap.docs) found[d.id] = { uid: d.id, ...d.data() } as UserDoc;
      }
      if (!cancelled) setProfiles(found);
    })().catch(() => {
      // A missing profile just falls back to the truncated uid in the table.
    });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return profiles;
}
