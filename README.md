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
npm run emulators
```

The emulator UI is at http://localhost:4000.

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

- [x] Domain model, seat economy and guards (`packages/shared`) — unit tested
- [x] Firestore + Storage security rules, composite indexes
- [x] Callable functions: reserve, withdraw, submit proof, review, check-in, listings
- [x] Scheduled sweeps: reservation expiry, reputation recompute
- [ ] Web app (Next.js)
- [ ] Android app (Kotlin + Compose)
- [ ] Attested install verification via Play Integrity
