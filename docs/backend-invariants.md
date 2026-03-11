# Backend Invariants

These are the core invariants the backend now enforces in code and tests.

## Match Slot Integrity

- A trip must not contain the same email in more than one match slot.
- Match slot status values must stay inside the known set:
  - `request_sent`
  - `request_received`
  - `matched`
  - `partner_approval_needed`
- Clearing a relationship must clear the reciprocal relationship.

## Reciprocity

- `request_sent` on one side implies `request_received` on the other side.
- `matched` on one side implies `matched` on the other side.
- Partner-approval flows must not finalize the requester/candidate pair until pending partner approvals are cleared.

## Authorization

- `request`, `withdraw`, `accept`, and `deny` require ownership of `tripId`.
- `remove` requires ownership of either side of the relationship.
- `trip-status-sync` requires ownership of the source trip.

## Compatibility

- New requests are only allowed when trips share direction and flight date.
- Notification compatibility requires:
  - same direction
  - same flight date
  - overlapping windows
  - mutual sex/gender preference compatibility
  - no existing recorded relationship between the two trips

## Failure Handling

- Malformed JSON becomes a controlled `400`.
- Missing auth becomes a controlled `401`.
- Invalid auth becomes a controlled `401`.
- Missing trips or missing reciprocal slots become controlled `404`s.
- Multi-trip mutations use compensating rollback on later write failure.

## Sync and Notifications

- Trip-status sync only propagates to truly reciprocal matched trips.
- Notification dedupe rows are inserted only after a successful send.
- Notification runs skip already-connected trip pairs.
- Notification runs are serialized per source trip within a single process.

