# A-Testers

A community-driven exchange for Google Play closed testing. Test other developers' apps to
earn **seats**; spend those seats to get your own app tested.

Google requires personal developer accounts to keep 12 testers opted in for 14 continuous
days before granting production access — and since 2026 it also checks that those testers
actually used the app. This platform is how solo developers find each other.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the data model, the seat economy and
its invariants.

## Layout

```
packages/shared/   domain types, seat-economy guards, validation (pure, no I/O)
functions/         Cloud Functions — the only code that may move a seat
web/               Next.js app (public catalogue + dashboards)
android/           Kotlin + Compose client
docs/              architecture and design notes
firestore.rules    every economically meaningful field is function-only
```

`packages/shared` is compiled *into* the functions build (see `functions/tsconfig.json`),
so a deploy carries no workspace symlinks.

## Getting started

```bash
npm install
```

Point the repo at a Firebase project (creates `.firebaserc`):

```bash
firebase use --add
```

Build and run the tests:

```bash
npm run build && npm test
```

Run everything locally against the emulators:

```bash
firebase emulators:start --project demo-a-testers
```

The emulator UI is at http://localhost:4000. Then, in another terminal:

```bash
npm run dev:web
```

Copy `web/.env.example` to `web/.env.local` first. For emulator-only work the checked-in
defaults are enough — `demo-` project ids never reach real Firebase infrastructure.

With the emulators running, exercise the whole seat lifecycle end to end:

```bash
npm run e2e
```

That drives the real callables over HTTP — reserve, proof, approve, reject, withdraw,
check in — and asserts the balances, held counters and ledger all reconcile at each step.

To look at the retention board with realistic data, sign in to the web app, then seed a
listing part-way through its 14-day window — two of its testers already gone quiet:

```bash
node scripts/seed-retention.mjs <your-uid>
```

Your uid is in the Auth emulator UI. Start the emulators with the same project id as
`web/.env.local` for this (`--project a-testers-app`), otherwise the app and the seed
script write to different emulator namespaces.

> If the functions emulator reports "Cannot determine backend specification. Timeout",
> raise the discovery window: `FUNCTIONS_DISCOVERY_TIMEOUT=120`. ESM function bundles are
> slow to introspect on Windows.

## How the seat economy works

Seats move from the developer to the tester, one at a time:

| Step | Effect |
| --- | --- |
| Tester reserves a slot | 1 seat is **held** from the app owner |
| Tester installs and submits proof | nothing moves |
| Owner approves | the held seat is **spent** and credited to the tester |
| Owner rejects, or the reservation expires | the seat is **released** back to the owner |

A new account starts with 0 seats, so it has to test before it can be tested. That is the
whole mechanism, not a bug — see "Bootstrapping" in the architecture doc for the cold-start
escape hatches.

Every transition runs inside a Firestore transaction in a Cloud Function and writes a
matching `ledger` entry. Clients cannot write seat balances, reservation status or the
ledger at all; `firestore.rules` denies it outright.

## Status

- [x] Domain model, seat economy and guards (`packages/shared`) — 20 unit tests
- [x] Firestore + Storage security rules, composite indexes
- [x] Callable functions: reserve, withdraw, submit proof, review, check-in, listings
- [x] Scheduled sweeps: reservation expiry, reputation recompute
- [x] End-to-end economy test against the emulators — 38 assertions
- [x] Web app: public catalogue, app pages, tester flow, review queue, seat ledger
- [x] Retention board — the live "day 6/14, 12/12 still opted in" view for developers
- [ ] Android app (Kotlin + Compose)
- [ ] Attested install verification via Play Integrity
- [ ] Email notifications when proof lands or a tester goes quiet
