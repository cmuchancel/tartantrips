-- Normalized relational schema for TartanTrips ride-share state.
-- This is the target schema for replacing slot columns on public.trips.
-- Apply through a proper Supabase migration once validated in staging.

create extension if not exists pgcrypto;

create table if not exists public.ride_pools (
  id uuid primary key default gen_random_uuid(),
  direction text not null,
  flight_date date not null,
  status text not null default 'active',
  created_by_trip_id uuid not null references public.trips (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ride_pools_status_check check (status in ('active', 'completed', 'cancelled'))
);

create index if not exists ride_pools_direction_date_idx
  on public.ride_pools (direction, flight_date, status);

create table if not exists public.ride_pool_members (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.ride_pools (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  membership_status text not null default 'active',
  joined_at timestamptz not null default timezone('utc', now()),
  left_at timestamptz null,
  constraint ride_pool_members_status_check check (membership_status in ('active', 'removed'))
);

create unique index if not exists ride_pool_members_active_trip_key
  on public.ride_pool_members (pool_id, trip_id)
  where membership_status = 'active';

create index if not exists ride_pool_members_trip_lookup_idx
  on public.ride_pool_members (trip_id, membership_status);

create table if not exists public.pool_join_requests (
  id uuid primary key default gen_random_uuid(),
  requester_trip_id uuid not null references public.trips (id) on delete cascade,
  target_trip_id uuid null references public.trips (id) on delete cascade,
  target_pool_id uuid null references public.ride_pools (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz null,
  completed_at timestamptz null,
  constraint pool_join_requests_status_check check (
    status in ('pending', 'withdrawn', 'accepted', 'denied', 'cancelled', 'completed')
  ),
  constraint pool_join_requests_target_check check (
    ((target_trip_id is not null)::int + (target_pool_id is not null)::int) = 1
  )
);

create unique index if not exists pool_join_requests_unique_pending_target_idx
  on public.pool_join_requests (
    requester_trip_id,
    coalesce(target_trip_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(target_pool_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'pending';

create index if not exists pool_join_requests_target_pool_idx
  on public.pool_join_requests (target_pool_id, status);

create table if not exists public.pool_join_approvals (
  id uuid primary key default gen_random_uuid(),
  join_request_id uuid not null references public.pool_join_requests (id) on delete cascade,
  approver_trip_id uuid not null references public.trips (id) on delete cascade,
  decision text not null default 'pending',
  decided_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint pool_join_approvals_decision_check check (
    decision in ('pending', 'approved', 'denied')
  )
);

create unique index if not exists pool_join_approvals_unique_approver_idx
  on public.pool_join_approvals (join_request_id, approver_trip_id);

create table if not exists public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null,
  job_type text not null,
  trip_id uuid null references public.trips (id) on delete cascade,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  last_error text null,
  available_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz null,
  processed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint notification_jobs_status_check check (
    status in ('pending', 'processing', 'sent', 'failed', 'cancelled')
  )
);

create unique index if not exists notification_jobs_job_key_idx
  on public.notification_jobs (job_key);

create index if not exists notification_jobs_ready_idx
  on public.notification_jobs (job_type, status, available_at);

create unique index if not exists match_notifications_trip_pair_key
  on public.match_notifications (trip_id, matched_trip_id);

create index if not exists match_notifications_matched_trip_idx
  on public.match_notifications (matched_trip_id, trip_id);

-- Staged migration plan:
-- 1. Backfill active two-person relationships into ride_pools + ride_pool_members.
-- 2. Backfill pending slot-based requests into pool_join_requests + pool_join_approvals.
-- 3. Switch match_transition RPC to write only the normalized tables.
-- 4. Keep slot columns as a compatibility projection until all clients read pools directly.
-- 5. Remove match_email_* and match_status_* after the compatibility adapter is retired.
