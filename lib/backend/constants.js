export const MATCH_SLOT_COUNT = 6;

export const matchEmailFields = Array.from(
  { length: MATCH_SLOT_COUNT },
  (_, index) => `match_email_${index}`
);

export const matchStatusFields = Array.from(
  { length: MATCH_SLOT_COUNT },
  (_, index) => `match_status_${index}`
);

export const MATCH_ACTIONS = [
  "request",
  "withdraw",
  "accept",
  "deny",
  "remove"
];

export const MATCH_STATUSES = [
  "request_sent",
  "request_received",
  "matched",
  "partner_approval_needed"
];

export const TRIP_STATUSES = [
  "Unmatched (looking for matches)",
  "Matched and still looking",
  "Matched and satisfied"
];

export const MATCHED_TRIP_STATUSES = [
  "Matched and still looking",
  "Matched and satisfied"
];

export const TRIP_DIRECTIONS = [
  "Arriving to Pittsburgh",
  "Departing Pittsburgh"
];

export const ALLOWED_PARTNER_SEX_VALUES = [
  "Any",
  "Male only",
  "Female only",
  "Non-binary only"
];

export const TRIP_MATCH_FIELDS = [
  "id",
  "user_email",
  "direction",
  "flight_date",
  ...matchEmailFields,
  ...matchStatusFields
];

export const TRIP_STATUS_SYNC_FIELDS = [
  "id",
  "user_email",
  ...matchEmailFields,
  ...matchStatusFields
];

export const TRIP_NOTIFICATION_FIELDS = [
  "id",
  "user_email",
  "direction",
  "flight_date",
  "flight_time",
  "allowed_partner_sex",
  "window_start",
  "window_end",
  "created_at",
  "baseline_match_check_at",
  ...matchEmailFields,
  ...matchStatusFields
];

export const PROFILE_FIELDS = ["email", "name", "sex"];

export const TRIP_MUTATION_FIELDS = [
  "id",
  "user_email",
  "direction",
  "flight_date",
  "flight_time",
  "allowed_partner_sex",
  "trip_status",
  "landed_status",
  "meetup_status",
  "willing_to_wait_until_time",
  "min_hours_before",
  "max_hours_before",
  "window_start",
  "window_end",
  "created_at",
  "baseline_match_check_at",
  ...matchEmailFields,
  ...matchStatusFields
];

export const NOTIFICATION_JOB_FIELDS = [
  "id",
  "job_key",
  "job_type",
  "trip_id",
  "status",
  "attempt_count",
  "last_error",
  "available_at",
  "locked_at",
  "processed_at",
  "created_at",
  "updated_at"
];

export const DEFAULT_RESEND_FROM = "TartanTrips <onboarding@resend.dev>";
