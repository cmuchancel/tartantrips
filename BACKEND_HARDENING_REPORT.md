# Backend Hardening Report

## Scope

This hardening pass focused on the three Next.js backend routes:

- `app/api/match-requests/route.js`
- `app/api/trip-status-sync/route.js`
- `app/api/match-notifications/route.js`

## What Changed

- Extracted backend behavior into shared modules under `lib/backend/`.
- Replaced large route handlers with thin wrappers that only:
  - validate configuration
  - parse/authenticate requests
  - delegate to service logic
  - return consistent JSON errors
- Added shared constants, request parsing, locking, rollback, and match utility helpers.
- Added keyed in-process locks for match actions, trip-status sync, and notification runs to reduce same-process race conditions.
- Added rollback logic for multi-trip updates so paired writes do not silently diverge on the first downstream failure.
- Hardened malformed JSON handling and required-field validation.
- Added enum validation for supported match actions and trip statuses.
- Added duplicate-slot integrity checks and conflict detection for corrupted match state.
- Added notification filtering for already-connected trips and deterministic candidate ordering.
- Simplified notification reverse-send logic and kept dedupe inserts after successful sends only.

## Verification

Latest local verification results:

- `npm run test`: 283/283 tests passed
- `npm run test:coverage`: 283/283 tests passed
- `npm run lint`: passed
- `npm run build`: passed

Coverage summary from the latest local run:

- Statements: 86.37%
- Branches: 91.35%
- Functions: 85.48%
- Lines: 86.37%

## Test Suite Shape

The backend test suite now covers:

- malformed bodies and auth failures
- authorization boundaries
- request/withdraw/accept/deny/remove flows
- partner approval branching
- rollback on partial update failures
- trip-status propagation
- notification compatibility and dedupe behavior
- concurrency guards
- generated invariant/property-style tests
- route export smoke tests

## Bugs and Risks Addressed

- uncaught `request.json()` failures
- partial paired-trip writes without compensation
- duplicate slot corruption going undetected
- unsupported actions/statuses accepted too loosely
- bare `Bearer` headers being treated like tokens
- notification logic re-notifying already connected trips
- notification reverse-send logic duplicated in two separate branches
- same-process race exposure on duplicate requests and notification runs

## Residual Risks

- Supabase writes are still not true database transactions. Rollback is compensating logic, not atomic commit.
- Keyed locks only protect a single server process. They do not replace database-level locking across multiple instances.
- `lib/backend/supabase-repo.js` has low automated coverage because the suite uses fake repositories instead of live Supabase calls.
- There are still no database-enforced uniqueness/consistency guarantees for match slots or notification dedupe rows.

## Recommended Next Steps

- Move the multi-trip state transitions into a database transaction or Supabase RPC.
- Add a unique constraint on `match_notifications (trip_id, matched_trip_id)`.
- Add a staging smoke suite that exercises the real Supabase repository and Resend adapter.
- Add structured server logging and alerting around 5xx responses.
- Consider schema changes that replace six parallel slot columns with a normalized match table.

