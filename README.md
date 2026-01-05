# TartanTrips

TartanTrips matches CMU students who want to share rides to/from Pittsburgh International Airport.

## Feature Highlights

- CMU-only magic link login with automatic session routing and auth callback handling.
- Profile management with required safety fields (name, major, grad year, sex/gender, phone) plus avatar upload via Supabase Storage.
- Trip planning for arrivals or departures, with time-window logic tailored to each direction.
- Duplicate trip protection so you only keep one trip per direction/date unless editing.
- Match discovery based on same direction/date, overlapping time windows, and mutual sex/gender preferences.
- Match workflows: request, withdraw, accept, deny, and remove with a 6-person rideshare cap.
- Trip status tracking (unmatched/matched) plus arrival-only landed and meetup status updates.
- Status sync for confirmed matches so trip status stays aligned across matched riders.
- Messaging helpers: pre-written email template, copy-to-clipboard, and Gmail deep link.
- “Landed at PIT” flow for last-minute arrivals to set a waiting window and see nearby candidates.
- Match notification emails via Resend with de-duplication in `match_notifications`.

## Main Screens

- Home: pick arrival/departure or jump to “Landed at PIT” flow.
- Plan a Trip: capture trip details and compute matching windows.
- My Trips: edit/delete trips, manage statuses, and review potential matches.
- Profile: update personal info and avatar, sign out.
- Landed at PIT: submit a wait window and view people already landed or landing soon.

## Matching Logic (Summary)

- Matches require the same direction and flight date.
- Time windows must overlap.
- Both users must allow each other based on the selected sex/gender filter.
- Candidates are sorted by closest flight time.

## Server Routes

- `app/api/match-requests/route.js`: handles match requests and status transitions.
- `app/api/trip-status-sync/route.js`: syncs trip status across confirmed matches.
- `app/api/match-notifications/route.js`: sends new match email notifications (Resend).
