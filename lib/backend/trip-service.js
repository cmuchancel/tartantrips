import { TRIP_MUTATION_FIELDS, matchEmailFields } from "./constants";
import { HttpError } from "./errors";
import { enqueueOrProcessTripNotifications } from "./notification-jobs-service";
import { buildRollbackPatch, getMatchEntries } from "./match-utils";
import {
  buildNormalizedTripPayload,
  buildTripStatusPatch,
  getTripMutationKind
} from "./trip-validation";
import { executeTripStatusSync } from "./trip-status-sync-service";

const MATCH_AFFECTING_FIELDS = [
  "direction",
  "flight_date",
  "flight_time",
  "allowed_partner_sex",
  "willing_to_wait_until_time",
  "min_hours_before",
  "max_hours_before",
  "window_start",
  "window_end"
];

function hasAnyMatchEntries(trip) {
  return matchEmailFields.some((field) => Boolean(trip[field]));
}

function changedMatchAffectingFields(existingTrip, nextTrip) {
  return MATCH_AFFECTING_FIELDS.some((field) => existingTrip[field] !== nextTrip[field]);
}

async function enforceDuplicateTripRule(repo, requesterEmail, direction, flightDate, excludeTripId = null) {
  const trips = await repo.getTripsByOwner(requesterEmail, ["id", "direction", "flight_date"]);
  const duplicate = trips.find((trip) => {
    if (excludeTripId && trip.id === excludeTripId) {
      return false;
    }

    return trip.direction === direction && trip.flight_date === flightDate;
  });

  if (duplicate) {
    throw new HttpError(
      409,
      "You already have a trip for this direction and date. Please edit the existing trip instead."
    );
  }
}

export async function createTrip({
  repo,
  emailClient,
  resendFrom,
  requesterEmail,
  input,
  now = () => new Date().toISOString()
}) {
  const payload = buildNormalizedTripPayload(input, requesterEmail);
  await enforceDuplicateTripRule(repo, requesterEmail, payload.direction, payload.flight_date);

  const trip = await repo.createTrip(payload, ["id"]);

  if (!trip?.id) {
    throw new HttpError(500, "Trip insert failed");
  }

  const notificationResult = await enqueueOrProcessTripNotifications({
    repo,
    emailClient,
    resendFrom,
    tripId: trip.id,
    now
  });

  return {
    ok: true,
    tripId: trip.id,
    notification: notificationResult
  };
}

export async function updateTripDetails({
  repo,
  emailClient,
  resendFrom,
  tripId,
  requesterEmail,
  input,
  now = () => new Date().toISOString()
}) {
  const existingTrip = await repo.getTripById(tripId, TRIP_MUTATION_FIELDS);
  if (!existingTrip) {
    throw new HttpError(404, "Trip not found");
  }

  if (existingTrip.user_email !== requesterEmail) {
    throw new HttpError(403, "Not authorized");
  }

  const payload = buildNormalizedTripPayload(
    {
      ...existingTrip,
      ...input,
      trip_status: existingTrip.trip_status || input.trip_status
    },
    requesterEmail
  );

  await enforceDuplicateTripRule(
    repo,
    requesterEmail,
    payload.direction,
    payload.flight_date,
    existingTrip.id
  );

  if (hasAnyMatchEntries(existingTrip) && changedMatchAffectingFields(existingTrip, payload)) {
    throw new HttpError(409, "Remove existing matches before changing trip details.");
  }

  await repo.updateTrip(existingTrip.id, payload);

  const notificationResult = await enqueueOrProcessTripNotifications({
    repo,
    emailClient,
    resendFrom,
    tripId: existingTrip.id,
    now
  });

  return {
    ok: true,
    tripId: existingTrip.id,
    notification: notificationResult
  };
}

export async function updateTripState({
  repo,
  tripId,
  requesterEmail,
  input
}) {
  const updates = buildTripStatusPatch(input);

  if (typeof updates.trip_status === "string") {
    return executeTripStatusSync({
      repo,
      requesterEmail,
      tripId,
      tripStatus: updates.trip_status
    }).then(async (result) => {
      const extraUpdates = { ...updates };
      delete extraUpdates.trip_status;

      if (Object.keys(extraUpdates).length > 0) {
        const existingTrip = await repo.getTripById(tripId, TRIP_MUTATION_FIELDS);
        if (!existingTrip) {
          throw new HttpError(404, "Trip not found");
        }
        if (existingTrip.user_email !== requesterEmail) {
          throw new HttpError(403, "Not authorized");
        }
        await repo.updateTrip(tripId, extraUpdates);
      }

      return result;
    });
  }

  const existingTrip = await repo.getTripById(tripId, TRIP_MUTATION_FIELDS);
  if (!existingTrip) {
    throw new HttpError(404, "Trip not found");
  }

  if (existingTrip.user_email !== requesterEmail) {
    throw new HttpError(403, "Not authorized");
  }

  await repo.updateTrip(existingTrip.id, updates);
  return { ok: true, updated: 1 };
}

export async function deleteTrip({
  repo,
  tripId,
  requesterEmail
}) {
  const trip = await repo.getTripById(tripId, TRIP_MUTATION_FIELDS);
  if (!trip) {
    throw new HttpError(404, "Trip not found");
  }

  if (trip.user_email !== requesterEmail) {
    throw new HttpError(403, "Not authorized");
  }

  const relatedEmails = getMatchEntries(trip)
    .map((entry) => entry.email)
    .filter(Boolean);

  const relatedTrips = relatedEmails.length > 0
    ? (await repo.getTripsByUserEmails(relatedEmails, TRIP_MUTATION_FIELDS)).filter((candidate) => {
        return candidate.direction === trip.direction && candidate.flight_date === trip.flight_date;
      })
    : [];

  const applied = [];

  try {
    for (const relatedTrip of relatedTrips) {
      const slotIndex = getMatchEntries(relatedTrip).find((entry) => entry.email === trip.user_email)?.slot;
      if (slotIndex === undefined) {
        continue;
      }

      const patch = {
        [`match_email_${slotIndex}`]: null,
        [`match_status_${slotIndex}`]: null
      };

      await repo.updateTrip(relatedTrip.id, patch);
      applied.push({ relatedTrip, patch });
    }

    await repo.deleteTrip(trip.id);
  } catch (error) {
    for (const { relatedTrip, patch } of [...applied].reverse()) {
      try {
        await repo.updateTrip(relatedTrip.id, buildRollbackPatch(relatedTrip, Object.keys(patch)));
      } catch (rollbackError) {
        throw new HttpError(500, "Failed to delete trip and cleanup rollback may be incomplete");
      }
    }

    throw new HttpError(500, error.message || "Failed to delete trip");
  }

  return { ok: true };
}

export function getTripRouteMutationKind(body) {
  return getTripMutationKind(body);
}
