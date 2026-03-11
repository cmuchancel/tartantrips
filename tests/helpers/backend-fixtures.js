import { matchEmailFields, matchStatusFields } from "../../lib/backend/constants";

let tripCounter = 0;
let profileCounter = 0;

export function resetFixtureCounters() {
  tripCounter = 0;
  profileCounter = 0;
}

export function makeTrip(overrides = {}) {
  tripCounter += 1;
  const id = overrides.id || `trip-${tripCounter}`;
  const email = overrides.user_email || `user${tripCounter}@andrew.cmu.edu`;
  const base = {
    id,
    user_email: email,
    direction: "Arriving to Pittsburgh",
    flight_date: "2026-03-11",
    flight_time: "13:00",
    allowed_partner_sex: "Any",
    trip_status: "Unmatched (looking for matches)",
    landed_status: null,
    meetup_status: null,
    willing_to_wait_until_time: null,
    min_hours_before: null,
    max_hours_before: null,
    window_start: "2026-03-11T12:00:00.000Z",
    window_end: "2026-03-11T14:00:00.000Z",
    created_at: `2026-03-10T12:${String(tripCounter).padStart(2, "0")}:00.000Z`,
    baseline_match_check_at: null
  };

  matchEmailFields.forEach((field) => {
    base[field] = null;
  });

  matchStatusFields.forEach((field) => {
    base[field] = null;
  });

  return {
    ...base,
    ...overrides
  };
}

export function makeProfile(overrides = {}) {
  profileCounter += 1;
  const email = overrides.email || `profile${profileCounter}@andrew.cmu.edu`;

  return {
    email,
    name: overrides.name || `Profile ${profileCounter}`,
    sex: overrides.sex || "Female",
    ...overrides
  };
}

export function setMatch(trip, slot, email, status) {
  return {
    ...trip,
    [`match_email_${slot}`]: email,
    [`match_status_${slot}`]: status
  };
}

export function pairTrips(
  trip,
  matchTrip,
  statusOnTrip,
  statusOnMatchTrip,
  slotOnTrip = 0,
  slotOnMatchTrip = 0
) {
  return [
    setMatch(trip, slotOnTrip, matchTrip.user_email, statusOnTrip),
    setMatch(matchTrip, slotOnMatchTrip, trip.user_email, statusOnMatchTrip)
  ];
}

