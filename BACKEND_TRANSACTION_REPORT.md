# Backend Transaction Campaign Report

## Scope

This pass targeted the remaining backend structural gaps after the first hardening round:

- direct client trip writes that still bypassed the backend
- best-effort client-triggered notifications with no durable retry path
- match transitions that still relied on JavaScript-side multi-write rollback
- the absence of a concrete normalized pool/request/approval schema artifact

## What Changed

- Added backend-owned trip write routes:
  - `POST /api/trips`
  - `PATCH /api/trips/[tripId]`
  - `DELETE /api/trips/[tripId]`
  - `POST /api/notification-jobs/process`
- Added shared trip mutation logic in `lib/backend/trip-service.js` and request validation in `lib/backend/trip-validation.js`.
- Moved web mutation flows in `app/plan/page.tsx`, `app/trips/page.tsx`, and `app/pit-unmatched/page.tsx` off direct `trips` table writes and onto backend routes.
- Moved iOS trip save/delete in `ios/TartanTrips/Services/TartanTripsService.swift` onto the same backend route surface and removed the swallowed fire-and-forget notification trigger from `ios/TartanTrips/Core/AppState.swift`.
- Added durable notification job enqueueing and processing in `lib/backend/notification-jobs-service.js`.
- Changed match requests to use the RPC-first boundary in `lib/backend/match-transition-service.js` and `lib/backend/match-requests-route.js`, with a safe fallback only when the RPC is actually absent.
- Added concrete SQL artifacts for the normalized target schema and the transactional `match_transition` RPC:
  - `docs/backend-transaction-normalized-schema.sql`
  - `docs/backend-match-transition-rpc.sql`

## Notification Durability

- Trip create/update now enqueue notification work on the server.
- Notification work is persisted with `pending`, `processing`, `sent`, and `failed` states.
- Failed sends now remain retryable instead of being marked sent accidentally.
- Retry scheduling uses backoff and can be processed by `POST /api/notification-jobs/process`.
- The intended deployment model is a cron or scheduled job calling that route with `NOTIFICATION_JOB_SECRET`.

## Normalized Schema Direction

The new SQL artifacts define the target relational model:

- `ride_pools`
- `ride_pool_members`
- `pool_join_requests`
- `pool_join_approvals`
- `notification_jobs`

That model preserves the product concepts the app needs:

- direct requests between unmatched trips
- approval-driven pool expansion
- multi-person pools
- denials and withdrawals
- member removal

The live app still reads the legacy slot columns today, so the normalized schema is not yet the runtime source of truth. The route and repository layer are now wired to prefer the RPC boundary first, and the SQL artifacts provide the concrete next migration step.

## Verification

Latest local verification on this tree:

- `npm run test`: passed, 302 tests
- `npm run lint`: passed
- `npm run build`: passed

## Residual Risks

- The normalized schema and `match_transition` RPC are committed as concrete artifacts, but they still need to be applied in Supabase before the RPC becomes the live production path.
- Web and iOS reads still use the legacy trip schema, so the slot columns remain a compatibility surface for now.
- Notification retries need a deployment scheduler calling `POST /api/notification-jobs/process`.
