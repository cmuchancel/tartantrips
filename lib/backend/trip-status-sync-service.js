import { TRIP_STATUSES, TRIP_STATUS_SYNC_FIELDS } from "./constants";
import { HttpError } from "./errors";
import { withKeyedLock } from "./locks";
import {
  assertTripIntegrity,
  assertTripStatusesKnown,
  getMatchedPartners,
  hasStatusWithEmail
} from "./match-utils";
import { requireNonEmptyString } from "./request";
import { commitTripUpdates } from "./service-utils";

const lockKey = (tripId) => `trip-status-sync:${tripId}`;

export async function executeTripStatusSync({
  repo,
  requesterEmail,
  tripId,
  tripStatus
}) {
  const normalizedTripId = requireNonEmptyString(tripId, "tripId");
  const normalizedTripStatus = requireNonEmptyString(tripStatus, "trip_status");

  if (!TRIP_STATUSES.includes(normalizedTripStatus)) {
    throw new HttpError(400, "Invalid trip_status");
  }

  return withKeyedLock(lockKey(normalizedTripId), async () => {
    const trip = await repo.getTripById(normalizedTripId, TRIP_STATUS_SYNC_FIELDS);
    if (!trip) {
      throw new HttpError(404, "Trip not found");
    }

    assertTripIntegrity(trip, "Trip");
    assertTripStatusesKnown(trip);

    if (trip.user_email !== requesterEmail) {
      throw new HttpError(403, "Not authorized");
    }

    const matchedEmails = [...new Set(getMatchedPartners(trip))];
    const candidateTrips = matchedEmails.length > 0
      ? await repo.getTripsByUserEmails(matchedEmails, TRIP_STATUS_SYNC_FIELDS)
      : [];

    candidateTrips.forEach((candidateTrip) => {
      assertTripIntegrity(candidateTrip, "Matched trip");
      assertTripStatusesKnown(candidateTrip);
    });

    const matchedTrips = candidateTrips.filter((candidateTrip) => {
      return (
        candidateTrip.id !== trip.id &&
        hasStatusWithEmail(candidateTrip, trip.user_email, "matched")
      );
    });

    const updates = [
      { id: trip.id, updates: { trip_status: normalizedTripStatus } },
      ...matchedTrips.map((matchedTrip) => ({
        id: matchedTrip.id,
        updates: { trip_status: normalizedTripStatus }
      }))
    ];

    await commitTripUpdates(repo, [trip, ...matchedTrips], updates);

    return {
      ok: true,
      updated: updates.length
    };
  });
}

