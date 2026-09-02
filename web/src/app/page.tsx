import Link from 'next/link';

const STEPS = [
  {
    n: 1,
    title: 'Test other people’s apps',
    body: 'Pick an app from the catalogue, join its Google Group, install the closed test and send proof. Each approval earns you one seat.',
  },
  {
    n: 2,
    title: 'List your own app',
    body: 'Add your closed-test link and Google Group. Every tester who joins your track costs one of the seats you earned.',
  },
  {
    n: 3,
    title: 'Hold the 14-day window',
    body: 'Your testers check in daily, so you can see who is still opted in on day 6 — not discover the gap on day 14.',
  },
  {
    n: 4,
    title: 'Apply for production',
    body: 'Once 12 testers have stayed opted in for 14 continuous days, Play Console unlocks production access.',
  },
];

export default function Home() {
  return (
    <div className="space-y-20 py-8">
      <section className="max-w-2xl">
        <p className="chip border text-brand-500" style={{ borderColor: 'var(--border)' }}>
          One seat in, one seat out
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          Get the 12 testers Google asks for.
        </h1>
        <p className="mt-4 text-lg muted">
          Google Play makes every new personal developer account keep 12 testers opted in for 14
          continuous days before it will grant production access. A-Testers is how solo developers
          find each other — you test someone else’s app, they test yours.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/apps" className="btn-primary">
            Browse apps to test
          </Link>
          <Link href="/dashboard/listings" className="btn-secondary">
            List my app
          </Link>
        </div>
        <p className="mt-4 text-sm muted">
          Free, and always will be. The exchange is the payment.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n} className="card p-5">
              <span className="chip bg-brand-600/10 text-brand-500 font-semibold">{s.n}</span>
              <h3 className="mt-3 font-medium">{s.title}</h3>
              <p className="mt-2 text-sm muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="card p-6">
        <h2 className="text-xl font-semibold tracking-tight">Why not just use a group chat?</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-3">
          <div>
            <h3 className="font-medium">Reciprocity is enforced</h3>
            <p className="mt-1.5 text-sm muted">
              You cannot receive a tester without having been one. Seats are held the moment someone
              reserves a slot, so nobody promises testing they never deliver.
            </p>
          </div>
          <div>
            <h3 className="font-medium">Drop-outs surface early</h3>
            <p className="mt-1.5 text-sm muted">
              Google now checks that testers actually used your app. Daily check-ins show you who has
              gone quiet while there is still time to replace them.
            </p>
          </div>
          <div>
            <h3 className="font-medium">Abandoned slots free themselves</h3>
            <p className="mt-1.5 text-sm muted">
              A reservation that goes nowhere expires automatically and returns the seat, instead of
              parking on your listing forever.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
