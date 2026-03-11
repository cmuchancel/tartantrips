-- Proposed database hardening steps for TartanTrips.
-- This repo does not currently contain Supabase migrations, so these are
-- recommendations to apply in a controlled migration workflow.
--
-- Follow-up concrete artifacts now live in:
-- - docs/backend-transaction-normalized-schema.sql
-- - docs/backend-match-transition-rpc.sql

-- 1. Prevent duplicate notification rows for the same pair.
create unique index if not exists match_notifications_trip_pair_key
  on public.match_notifications (trip_id, matched_trip_id);

-- 2. Add a supporting index for reverse lookups by matched pair.
create index if not exists match_notifications_matched_trip_idx
  on public.match_notifications (matched_trip_id, trip_id);

-- 3. Consider moving match state out of six parallel columns into a normalized
-- match table. If the slot-column design must remain, add a check constraint
-- to keep statuses inside the supported enum.
--
-- alter table public.trips
-- add constraint trips_match_status_values_check check (
--   match_status_0 is null or match_status_0 in ('request_sent', 'request_received', 'matched', 'partner_approval_needed')
-- );
--
-- Repeat for match_status_1 through match_status_5, or replace the slot model.

-- 4. Durable notification processing needs a server-owned queue.
--
-- create table if not exists public.notification_jobs (...);

-- 5. The strongest fix for partial multi-trip writes is a transaction-backed
-- stored procedure or RPC that performs request/accept/deny/remove atomically.
-- That should eventually replace route-level compensating rollback and target
-- the normalized ride_pools / ride_pool_members / pool_join_requests /
-- pool_join_approvals schema.
