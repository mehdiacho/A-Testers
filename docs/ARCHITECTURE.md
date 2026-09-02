# A-Testers — Architecture

Community-driven Google Play closed-testing exchange. Testers earn **seats** by testing
other people's apps; developers spend seats to have their own app tested.

## Why this exists

Google Play requires personal developer accounts created after 2023-11-13 to keep
**12 testers opted in continuously for 14 days** before production access is granted.
Since 2026 Google additionally checks that those testers *genuinely used* the app.
Solo developers have no way to find 12 real testers, so a reciprocal exchange forms.

> Note on the "14 testers" figure: Google's actual rule is **12 testers / 14 days**.
> Both numbers are config, not constants — see `config/platform` below. Defaults are
> `requiredTesters = 12`, `requiredDays = 14`.

## Stack

| Layer | Choice |
| --- | --- |
| Data | Cloud Firestore |
| Auth | Firebase Auth (Google provider primary — testers need a Google account anyway) |
| Server logic | Cloud Functions for Firebase, TypeScript, 2nd gen |
| Files | Cloud Storage (proof screenshots, app icons) |
| Web | Next.js (App Router) + TypeScript on Firebase App Hosting |
| Android | Kotlin + Jetpack Compose |
| Shared | `packages/shared` — types, enums and pure economy logic used by web + functions |

## The seat economy

Seats flow **from the developer to the tester**, one at a time.

```
tester reserves a slot on app A ──► 1 seat HELD from A's owner
                                    owner.seatBalance -= 1, owner.seatsHeld += 1
tester installs, submits proof
owner approves ──────────────────► held seat SPENT
                                    owner.seatsHeld -= 1
                                    tester.seatBalance += 1
owner rejects / reservation expires ─► seat RELEASED back to owner
                                    owner.seatsHeld -= 1, owner.seatBalance += 1
```

### Invariants

These must hold at all times. Every one is enforced inside a Firestore transaction in a
Cloud Function; **no client can write any of these fields.**

1. `user.seatBalance >= 0`
2. `user.seatsHeld >= 0`
3. A hold is refused when `seatBalance < 1`, so the balance can never go negative.
4. The sum of all `ledger` deltas for a user equals `user.seatBalance`, and
   `user.seatsHeld` equals the number of active reservations against that user's apps.
   Holds make this non-obvious, so to be explicit: a hold writes delta `-1`, a release
   writes `+1`, and an approval writes `0` — the seat left the balance when it was held,
   and approval only makes that permanent. The delta-0 entry is still recorded, as the
   audit trail of a seat leaving the system.
5. At most one **active** reservation per `(appId, testerUid)` pair — enforced by the
   deterministic document id `reservationId = {appId}__{testerUid}`.
6. `app.seatsFilled + app.seatsReserved <= app.seatsRequested`
7. A user may never reserve a slot on their own app.

### Bootstrapping

A brand-new user has `seatBalance = 0`, so they cannot open an app for testing until they
have tested someone else's. That is the point of the exchange, not a bug. Two escape
hatches exist for cold-start:

- `signupGrantSeats` (default `0`) — a starter grant if we ever need one.
- Admin ledger adjustments, for seeding the very first apps on the platform.

A developer does **not** need all 12 seats up front. They need `>= 1` available seat for
each *incoming* reservation. Set `requireFullSeatsUpfront = true` to switch to the
stricter "pay for every slot when you list" model.

## Collections

### `users/{uid}`

Public profile plus economy state. Client-writable only for the profile fields marked
below; everything else is function-only.

| Field | Type | Notes |
| --- | --- | --- |
| `displayName`, `photoURL` | string | client-writable |
| `seatBalance` | number | available seats — function-only |
| `seatsHeld` | number | held against pending reservations — function-only |
| `stats` | map | `appsTested`, `appsPublished`, `proofsApproved`, `proofsRejected` |
| `reputation` | number | 0–100, derived; drives trust gates |
| `strikes`, `banned` | number / bool | moderation |
| `createdAt`, `updatedAt` | timestamp | |

`users/{uid}/private/contact` — subdocument holding `email` and `playEmail` (the Google
account used to join test groups). Readable only by the owner and by admins.

### `apps/{appId}`

| Field | Type | Notes |
| --- | --- | --- |
| `ownerUid` | string | immutable after create |
| `name`, `packageName`, `shortDescription`, `category`, `iconUrl` | | `packageName` unique |
| `playTestUrl` | string | closed-test opt-in link |
| `googleGroupUrl` | string | group testers must join |
| `status` | enum | `draft`, `pending_review`, `open`, `paused`, `full`, `completed`, `rejected` |
| `seatsRequested` | number | default 12 |
| `seatsReserved`, `seatsFilled` | number | function-only |
| `testingStartsAt`, `requiredDays` | | 14-day window tracking |
| `createdAt`, `updatedAt` | timestamp | |

### `reservations/{appId}__{testerUid}`

The central join object. The deterministic id gives us invariant 5 for free.

| Field | Type | Notes |
| --- | --- | --- |
| `appId`, `ownerUid`, `testerUid` | string | denormalised for rules and queries |
| `status` | enum | `reserved`, `proof_submitted`, `approved`, `rejected`, `expired`, `withdrawn` |
| `reservedAt`, `expiresAt` | timestamp | auto-expire after `reservationTtlHours` (default 72) |
| `proofUrl`, `proofNote`, `proofSubmittedAt` | | screenshot evidence |
| `verifiedInstall` | map / null | Android: what PackageManager saw. See below. |
| `reviewedAt`, `rejectionReason` | | |
| `checkins` | map<dateISO, bool> | 14-day retention tracking |
| `lastCheckinAt`, `checkinStreak` | | |

`verifiedInstall` is written by `parseVerifiedInstall` (`functions/src/economy/install.ts`)
from the payload the Android client sends with a proof or a check-in. Every field in that
payload is a *claim by the device* — a rooted phone can tell PackageManager anything — so
the server keeps the claim inside a known shape and overrides the two fields that must not
be forgeable: `integrityVerdict` stays `UNEVALUATED` until a Play Integrity token is
validated server-side, and `checkedAt` comes from the server clock so a device cannot
backdate an install or stretch a retention window. Evidence naming a different package
than the listing is discarded outright. It corroborates the developer's review; it never
replaces it, and no seat moves on the strength of it.

`ownerUid` is denormalised onto every reservation because security rules are not filters:
a `list` is allowed only when the query itself proves every match is readable. So any
client query over `reservations` must constrain `ownerUid` or `testerUid` to the caller,
even when another filter — `appId`, say — already implies it. Both the review queue and
the retention board are shaped by that.

### `ledger/{autoId}` — append-only

Every seat movement. Never updated or deleted; the source of truth for disputes.

`uid, delta, reason, refId, balanceAfter, createdAt`

`reason` is one of `earn_approval`, `hold_reservation`, `spend_approval`,
`release_rejected`, `release_expired`, `signup_grant`, `admin_adjust`,
`penalty_uninstall`.

### `config/platform` — singleton, admin-writable

`requiredTesters`, `requiredDays`, `reservationTtlHours`, `signupGrantSeats`,
`requireFullSeatsUpfront`, `maxOpenReservationsPerTester`, `minReputationToList`.

### `packageIndex/{packageName}` — uniqueness ticket, function-only

`{ appId, ownerUid, createdAt }`. Created in the same transaction as the app document.
A `where('packageName', '==', …)` query would let two concurrent creates both pass their
check; claiming a document id cannot. Never readable or writable by a client.

### `reports/{autoId}` — abuse reports, admin-only read

## Callable functions (the only way seats move)

| Function | Caller | Effect |
| --- | --- | --- |
| `reserveSlot({appId})` | tester | holds 1 seat from the owner, creates the reservation |
| `withdrawReservation({appId})` | tester | releases the hold |
| `submitProof({appId, proofUrl, note})` | tester | `reserved` → `proof_submitted` |
| `reviewProof({appId, testerUid, approve, reason})` | app owner | spends or releases the held seat |
| `createApp` / `updateApp` / `setAppStatus` | owner | listing lifecycle |
| `recordCheckin({appId})` | tester (Android) | 14-day retention ping |
| `verifyInstall({appId, integrityToken})` | tester (Android) | attested install check |
| `adminAdjustSeats` | admin | seeding and dispute resolution |

Scheduled: `expireStaleReservations` (hourly), `recomputeReputation` (daily),
`closeCompletedTests` (daily).

## Planned improvements over the reference platform

Phase 1 ships parity. These are the reasons the project exists:

1. **Attested install verification.** The Android app reads `PackageManager` to confirm
   `packageName` is actually installed and wraps the result in a Play Integrity token, so
   `verifiedInstall` is trustworthy in a way a screenshot never is.
2. **Live 14-day retention board.** Google now checks *active usage*. Daily check-ins per
   reservation let a developer see "day 6/14 — 12/12 still opted in" instead of finding out
   on day 14 that three testers uninstalled on day 3.
3. **Auto-approval.** Verified install plus N check-ins approves the seat with no developer
   action, removing the manual-review bottleneck that stalls the reference platform.
4. **Uninstall penalties and reputation.** A tester who drops out inside the 14-day window
   loses the seat and takes a reputation hit, which is what actually makes the window hold.
