-- Transactional RPC for normalized TartanTrips match transitions.
-- This function is intended to become the write authority for:
-- request / withdraw / accept / deny / remove

create or replace function public.match_transition(
  p_action text,
  p_trip_id uuid,
  p_matched_trip_id uuid,
  p_requester_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips%rowtype;
  v_matched_trip public.trips%rowtype;
  v_trip_pool_id uuid;
  v_matched_pool_id uuid;
  v_join_request_id uuid;
  v_active_pool_id uuid;
  v_pending_approval_count integer;
  v_denied_approval_count integer;
  v_pool_member_count integer;
begin
  if p_action not in ('request', 'withdraw', 'accept', 'deny', 'remove') then
    raise exception 'Unsupported action';
  end if;

  if p_trip_id = p_matched_trip_id then
    raise exception 'A trip cannot match with itself';
  end if;

  select *
  into v_trip
  from public.trips
  where id = p_trip_id
  for update;

  if not found then
    raise exception 'Trip not found';
  end if;

  select *
  into v_matched_trip
  from public.trips
  where id = p_matched_trip_id
  for update;

  if not found then
    raise exception 'Matched trip not found';
  end if;

  if p_action = 'remove' then
    if v_trip.user_email <> p_requester_email and v_matched_trip.user_email <> p_requester_email then
      raise exception 'Not authorized';
    end if;
  elsif v_trip.user_email <> p_requester_email then
    raise exception 'Not authorized';
  end if;

  select rpm.pool_id
  into v_trip_pool_id
  from public.ride_pool_members rpm
  join public.ride_pools rp on rp.id = rpm.pool_id and rp.status = 'active'
  where rpm.trip_id = p_trip_id and rpm.membership_status = 'active'
  limit 1
  for update;

  select rpm.pool_id
  into v_matched_pool_id
  from public.ride_pool_members rpm
  join public.ride_pools rp on rp.id = rpm.pool_id and rp.status = 'active'
  where rpm.trip_id = p_matched_trip_id and rpm.membership_status = 'active'
  limit 1
  for update;

  if p_action = 'request' then
    if v_trip_pool_id is null and v_matched_pool_id is null then
      insert into public.pool_join_requests (
        requester_trip_id,
        target_trip_id,
        status
      )
      values (
        p_trip_id,
        p_matched_trip_id,
        'pending'
      )
      on conflict do nothing
      returning id into v_join_request_id;

      if v_join_request_id is null then
        select id
        into v_join_request_id
        from public.pool_join_requests
        where requester_trip_id = p_trip_id
          and target_trip_id = p_matched_trip_id
          and status = 'pending'
        limit 1
        for update;
      end if;

      return jsonb_build_object('ok', true, 'requestId', v_join_request_id, 'mode', 'trip_request');
    end if;

    v_active_pool_id := coalesce(v_trip_pool_id, v_matched_pool_id);

    insert into public.pool_join_requests (
      requester_trip_id,
      target_pool_id,
      status
    )
    values (
      case when v_trip_pool_id is null then p_trip_id else p_matched_trip_id end,
      v_active_pool_id,
      'pending'
    )
    on conflict do nothing
    returning id into v_join_request_id;

    if v_join_request_id is null then
      select id
      into v_join_request_id
      from public.pool_join_requests
      where requester_trip_id = case when v_trip_pool_id is null then p_trip_id else p_matched_trip_id end
        and target_pool_id = v_active_pool_id
        and status = 'pending'
      limit 1
      for update;
    end if;

    insert into public.pool_join_approvals (join_request_id, approver_trip_id, decision)
    select v_join_request_id, rpm.trip_id, 'pending'
    from public.ride_pool_members rpm
    where rpm.pool_id = v_active_pool_id
      and rpm.membership_status = 'active'
    on conflict (join_request_id, approver_trip_id) do nothing;

    return jsonb_build_object('ok', true, 'requestId', v_join_request_id, 'mode', 'pool_request');
  end if;

  if p_action = 'withdraw' then
    update public.pool_join_requests
    set status = 'withdrawn',
        resolved_at = timezone('utc', now())
    where requester_trip_id = p_trip_id
      and (
        target_trip_id = p_matched_trip_id
        or target_pool_id = v_matched_pool_id
      )
      and status = 'pending'
    returning id into v_join_request_id;

    if v_join_request_id is null then
      raise exception 'Join request not found';
    end if;

    return jsonb_build_object('ok', true, 'requestId', v_join_request_id, 'status', 'withdrawn');
  end if;

  if p_action = 'accept' then
    select id
    into v_join_request_id
    from public.pool_join_requests
    where status = 'pending'
      and (
        (target_trip_id = p_trip_id and requester_trip_id = p_matched_trip_id)
        or (target_pool_id = v_trip_pool_id and requester_trip_id = p_matched_trip_id)
      )
    order by created_at asc
    limit 1
    for update;

    if v_join_request_id is null then
      raise exception 'Join request not found';
    end if;

    if v_trip_pool_id is null then
      insert into public.ride_pools (direction, flight_date, status, created_by_trip_id)
      values (v_trip.direction, v_trip.flight_date::date, 'active', p_trip_id)
      returning id into v_active_pool_id;

      insert into public.ride_pool_members (pool_id, trip_id, membership_status)
      values
        (v_active_pool_id, p_trip_id, 'active'),
        (v_active_pool_id, p_matched_trip_id, 'active')
      on conflict do nothing;

      update public.pool_join_requests
      set status = 'completed',
          resolved_at = timezone('utc', now()),
          completed_at = timezone('utc', now())
      where id = v_join_request_id;

      return jsonb_build_object('ok', true, 'poolId', v_active_pool_id, 'status', 'completed');
    end if;

    update public.pool_join_approvals
    set decision = 'approved',
        decided_at = timezone('utc', now())
    where join_request_id = v_join_request_id
      and approver_trip_id = p_trip_id;

    select count(*)
    into v_pending_approval_count
    from public.pool_join_approvals
    where join_request_id = v_join_request_id
      and decision = 'pending';

    select count(*)
    into v_denied_approval_count
    from public.pool_join_approvals
    where join_request_id = v_join_request_id
      and decision = 'denied';

    if v_denied_approval_count > 0 then
      raise exception 'Join request has already been denied';
    end if;

    if v_pending_approval_count = 0 then
      select count(*)
      into v_pool_member_count
      from public.ride_pool_members
      where pool_id = v_trip_pool_id
        and membership_status = 'active';

      if v_pool_member_count >= 6 then
        raise exception 'Rideshare services only allow up to 6 riders. That’s the maximum.';
      end if;

      insert into public.ride_pool_members (pool_id, trip_id, membership_status)
      values (v_trip_pool_id, p_matched_trip_id, 'active')
      on conflict do nothing;

      update public.pool_join_requests
      set status = 'completed',
          resolved_at = timezone('utc', now()),
          completed_at = timezone('utc', now())
      where id = v_join_request_id;
    end if;

    return jsonb_build_object('ok', true, 'requestId', v_join_request_id, 'pendingApprovals', v_pending_approval_count);
  end if;

  if p_action = 'deny' then
    select id
    into v_join_request_id
    from public.pool_join_requests
    where status = 'pending'
      and (
        (target_trip_id = p_trip_id and requester_trip_id = p_matched_trip_id)
        or (target_pool_id = v_trip_pool_id and requester_trip_id = p_matched_trip_id)
      )
    order by created_at asc
    limit 1
    for update;

    if v_join_request_id is null then
      raise exception 'Join request not found';
    end if;

    update public.pool_join_approvals
    set decision = 'denied',
        decided_at = timezone('utc', now())
    where join_request_id = v_join_request_id
      and approver_trip_id = p_trip_id;

    update public.pool_join_requests
    set status = 'denied',
        resolved_at = timezone('utc', now())
    where id = v_join_request_id;

    return jsonb_build_object('ok', true, 'requestId', v_join_request_id, 'status', 'denied');
  end if;

  if p_action = 'remove' then
    v_active_pool_id := coalesce(v_trip_pool_id, v_matched_pool_id);

    if v_active_pool_id is null then
      raise exception 'Active pool membership not found';
    end if;

    update public.ride_pool_members
    set membership_status = 'removed',
        left_at = timezone('utc', now())
    where pool_id = v_active_pool_id
      and trip_id in (p_trip_id, p_matched_trip_id)
      and membership_status = 'active';

    update public.pool_join_requests
    set status = 'cancelled',
        resolved_at = timezone('utc', now())
    where status = 'pending'
      and (
        requester_trip_id in (p_trip_id, p_matched_trip_id)
        or target_pool_id = v_active_pool_id
      );

    return jsonb_build_object('ok', true, 'poolId', v_active_pool_id, 'status', 'removed');
  end if;

  raise exception 'Unsupported action';
end;
$$;
