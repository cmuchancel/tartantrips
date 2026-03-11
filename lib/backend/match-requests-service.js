import { MATCH_ACTIONS, TRIP_MATCH_FIELDS, matchStatusFields } from "./constants";
import { HttpError } from "./errors";
import { withKeyedLock } from "./locks";
import {
  areTripsCompatibleForRequest,
  assertTripIntegrity,
  assertTripStatusesKnown,
  buildSlotPatch,
  clearSlotPatch,
  getEmptySlot,
  getMatchedPartners,
  getSlotForEmail,
  hasStatusWithEmail
} from "./match-utils";
import { requireNonEmptyString } from "./request";
import { commitTripUpdates } from "./service-utils";

const pairLockKey = (tripId, matchedTripId) => {
  return ["match-request", tripId, matchedTripId].sort().join(":");
};

function authorizeAction(action, ownsTrip, ownsMatchTrip) {
  if (action === "remove") {
    if (!ownsTrip && !ownsMatchTrip) {
      throw new HttpError(403, "Not authorized");
    }
    return;
  }

  if (!ownsTrip) {
    throw new HttpError(403, "Not authorized");
  }
}

function getPartnerTripsInContext(trips, direction, flightDate, excludedIds = []) {
  const excluded = new Set(excludedIds);
  return trips.filter((trip) => {
    return (
      trip.direction === direction &&
      trip.flight_date === flightDate &&
      !excluded.has(trip.id)
    );
  });
}

function assertStatusForInboundAction(action, status) {
  if (action === "accept" && status === "request_sent") {
    throw new HttpError(409, "Use withdraw instead of accept for an outbound request");
  }

  if (action === "deny" && status === "request_sent") {
    throw new HttpError(409, "Use withdraw instead of deny for an outbound request");
  }
}

async function loadPair(repo, tripId, matchedTripId) {
  const trips = await repo.getTripsByIds([tripId, matchedTripId], TRIP_MATCH_FIELDS);
  if (!trips || trips.length !== 2) {
    throw new HttpError(404, "Trips not found");
  }

  const trip = trips.find((row) => row.id === tripId);
  const matchTrip = trips.find((row) => row.id === matchedTripId);

  if (!trip || !matchTrip) {
    throw new HttpError(404, "Trips not found");
  }

  assertTripIntegrity(trip, "Trip");
  assertTripIntegrity(matchTrip, "Matched trip");
  assertTripStatusesKnown(trip);
  assertTripStatusesKnown(matchTrip);

  return { trips, trip, matchTrip };
}

async function runRequestAction(repo, trip, matchTrip) {
  if (!areTripsCompatibleForRequest(trip, matchTrip)) {
    throw new HttpError(400, "Trips are not compatible for matching");
  }

  const requesterSlot = getSlotForEmail(trip, matchTrip.user_email);
  const matchSlot = getSlotForEmail(matchTrip, trip.user_email);
  const requesterStatus = requesterSlot === -1 ? null : trip[matchStatusFields[requesterSlot]];
  const matchStatus = matchSlot === -1 ? null : matchTrip[matchStatusFields[matchSlot]];

  if (requesterSlot !== -1 && matchSlot !== -1) {
    if (requesterStatus === "matched" && matchStatus === "matched") {
      return { ok: true };
    }

    if (requesterStatus === "partner_approval_needed" && matchStatus === "partner_approval_needed") {
      return { ok: true };
    }

    if (requesterStatus === "request_sent" && matchStatus === "request_received") {
      return { ok: true };
    }
  }

  if (requesterStatus === "matched" || matchStatus === "matched") {
    throw new HttpError(409, "Match state conflict");
  }

  const slotA = requesterSlot === -1 ? getEmptySlot(trip) : requesterSlot;
  const slotB = matchSlot === -1 ? getEmptySlot(matchTrip) : matchSlot;

  if (slotA === -1 || slotB === -1) {
    throw new HttpError(400, "No available match slots");
  }

  await commitTripUpdates(repo, [trip, matchTrip], [
    { id: trip.id, updates: buildSlotPatch(slotA, matchTrip.user_email, "request_sent") },
    { id: matchTrip.id, updates: buildSlotPatch(slotB, trip.user_email, "request_received") }
  ]);

  return { ok: true };
}

async function runWithdrawAction(repo, trip, matchTrip) {
  const requesterSlot = getSlotForEmail(trip, matchTrip.user_email);
  const matchSlot = getSlotForEmail(matchTrip, trip.user_email);

  if (requesterSlot === -1 || matchSlot === -1) {
    throw new HttpError(404, "Match not found");
  }

  const matchedPartners = getMatchedPartners(trip).filter((email) => email !== matchTrip.user_email);
  const partnerTrips = matchedPartners.length > 0
    ? getPartnerTripsInContext(
        await repo.getTripsByUserEmails(matchedPartners, TRIP_MATCH_FIELDS),
        trip.direction,
        trip.flight_date,
        [trip.id]
      )
    : [];

  partnerTrips.forEach((partnerTrip) => {
    assertTripIntegrity(partnerTrip, "Partner trip");
    assertTripStatusesKnown(partnerTrip);
  });

  const updates = [
    { id: trip.id, updates: clearSlotPatch(requesterSlot) },
    { id: matchTrip.id, updates: clearSlotPatch(matchSlot) }
  ];

  partnerTrips.forEach((partnerTrip) => {
    const partnerSlot = getSlotForEmail(partnerTrip, matchTrip.user_email);
    if (
      partnerSlot !== -1 &&
      partnerTrip[matchStatusFields[partnerSlot]] === "partner_approval_needed"
    ) {
      updates.push({ id: partnerTrip.id, updates: clearSlotPatch(partnerSlot) });
    }
  });

  await commitTripUpdates(repo, [trip, matchTrip, ...partnerTrips], updates);
  return { ok: true };
}

async function runAcceptAction(repo, trip, matchTrip) {
  const requesterSlot = getSlotForEmail(trip, matchTrip.user_email);
  if (requesterSlot === -1) {
    throw new HttpError(404, "Match not found");
  }

  const currentStatus = trip[matchStatusFields[requesterSlot]];
  assertStatusForInboundAction("accept", currentStatus);

  if (
    currentStatus === "partner_approval_needed" &&
    !hasStatusWithEmail(matchTrip, trip.user_email, "partner_approval_needed")
  ) {
    const sameContextTrips = await repo.getTripsByDirectionAndFlightDate(
      trip.direction,
      trip.flight_date,
      TRIP_MATCH_FIELDS
    );

    sameContextTrips.forEach((contextTrip) => {
      assertTripIntegrity(contextTrip, "Trip");
      assertTripStatusesKnown(contextTrip);
    });

    const requesterTrip = sameContextTrips.find((candidate) => {
      return (
        candidate.id !== trip.id &&
        hasStatusWithEmail(candidate, trip.user_email, "matched") &&
        hasStatusWithEmail(candidate, matchTrip.user_email, "partner_approval_needed")
      );
    });

    if (!requesterTrip) {
      await commitTripUpdates(repo, [trip], [
        { id: trip.id, updates: clearSlotPatch(requesterSlot) }
      ]);
      return { ok: true };
    }

    const requesterPartners = getMatchedPartners(requesterTrip);
    const partnerTrips = requesterPartners.length > 0
      ? getPartnerTripsInContext(
          await repo.getTripsByUserEmails(requesterPartners, TRIP_MATCH_FIELDS),
          requesterTrip.direction,
          requesterTrip.flight_date
        )
      : [];

    const updates = [
      { id: trip.id, updates: clearSlotPatch(requesterSlot) }
    ];

    const predictedPartnerTrips = partnerTrips.map((partnerTrip) => {
      if (partnerTrip.id !== trip.id) {
        return partnerTrip;
      }

      return {
        ...partnerTrip,
        ...clearSlotPatch(requesterSlot)
      };
    });

    const pendingApprovals = predictedPartnerTrips.filter((partnerTrip) => {
      const partnerSlot = getSlotForEmail(partnerTrip, matchTrip.user_email);
      return (
        partnerSlot !== -1 &&
        partnerTrip[matchStatusFields[partnerSlot]] === "partner_approval_needed"
      );
    });

    if (pendingApprovals.length === 0) {
      const requesterSlotWithCandidate = getSlotForEmail(requesterTrip, matchTrip.user_email);
      const candidateSlotWithRequester = getSlotForEmail(matchTrip, requesterTrip.user_email);

      if (requesterSlotWithCandidate !== -1 && candidateSlotWithRequester !== -1) {
        updates.push({
          id: requesterTrip.id,
          updates: {
            [matchStatusFields[requesterSlotWithCandidate]]: "matched"
          }
        });
        updates.push({
          id: matchTrip.id,
          updates: {
            [matchStatusFields[candidateSlotWithRequester]]: "matched"
          }
        });
      }
    }

    await commitTripUpdates(repo, [trip, matchTrip, requesterTrip, ...partnerTrips], updates);
    return { ok: true };
  }

  const matchSlot = getSlotForEmail(matchTrip, trip.user_email);
  if (matchSlot === -1) {
    throw new HttpError(404, "Match not found");
  }

  const matchTripStatus = matchTrip[matchStatusFields[matchSlot]];
  if (currentStatus === "matched" && matchTripStatus === "matched") {
    return { ok: true };
  }

  const requesterPartners = getMatchedPartners(matchTrip).filter((email) => email !== trip.user_email);
  if (requesterPartners.length > 0) {
    const partnerTrips = getPartnerTripsInContext(
      await repo.getTripsByUserEmails(requesterPartners, TRIP_MATCH_FIELDS),
      matchTrip.direction,
      matchTrip.flight_date,
      [matchTrip.id]
    );

    partnerTrips.forEach((partnerTrip) => {
      assertTripIntegrity(partnerTrip, "Partner trip");
      assertTripStatusesKnown(partnerTrip);
    });

    const updates = [
      {
        id: trip.id,
        updates: { [matchStatusFields[requesterSlot]]: "partner_approval_needed" }
      },
      {
        id: matchTrip.id,
        updates: { [matchStatusFields[matchSlot]]: "partner_approval_needed" }
      }
    ];

    partnerTrips.forEach((partnerTrip) => {
      const partnerSlot = getSlotForEmail(partnerTrip, trip.user_email);
      const emptySlot = partnerSlot === -1 ? getEmptySlot(partnerTrip) : partnerSlot;
      if (emptySlot === -1) {
        throw new HttpError(400, "No available match slots");
      }

      const existingStatus = partnerSlot === -1 ? null : partnerTrip[matchStatusFields[partnerSlot]];
      if (existingStatus === "matched") {
        throw new HttpError(409, "Match state conflict");
      }

      updates.push({
        id: partnerTrip.id,
        updates: buildSlotPatch(emptySlot, trip.user_email, "partner_approval_needed")
      });
    });

    await commitTripUpdates(repo, [trip, matchTrip, ...partnerTrips], updates);
    return { ok: true };
  }

  await commitTripUpdates(repo, [trip, matchTrip], [
    {
      id: trip.id,
      updates: { [matchStatusFields[requesterSlot]]: "matched" }
    },
    {
      id: matchTrip.id,
      updates: { [matchStatusFields[matchSlot]]: "matched" }
    }
  ]);

  return { ok: true };
}

async function runDenyAction(repo, trip, matchTrip) {
  const requesterSlot = getSlotForEmail(trip, matchTrip.user_email);
  if (requesterSlot === -1) {
    throw new HttpError(404, "Match not found");
  }

  const currentStatus = trip[matchStatusFields[requesterSlot]];
  assertStatusForInboundAction("deny", currentStatus);

  if (
    currentStatus === "partner_approval_needed" &&
    !hasStatusWithEmail(matchTrip, trip.user_email, "partner_approval_needed")
  ) {
    const sameContextTrips = await repo.getTripsByDirectionAndFlightDate(
      trip.direction,
      trip.flight_date,
      TRIP_MATCH_FIELDS
    );

    sameContextTrips.forEach((contextTrip) => {
      assertTripIntegrity(contextTrip, "Trip");
      assertTripStatusesKnown(contextTrip);
    });

    const requesterTrip = sameContextTrips.find((candidate) => {
      return (
        candidate.id !== trip.id &&
        hasStatusWithEmail(candidate, trip.user_email, "matched") &&
        hasStatusWithEmail(candidate, matchTrip.user_email, "partner_approval_needed")
      );
    });

    const updates = [
      { id: trip.id, updates: clearSlotPatch(requesterSlot) }
    ];

    if (!requesterTrip) {
      await commitTripUpdates(repo, [trip], updates);
      return { ok: true };
    }

    const requesterSlotWithCandidate = getSlotForEmail(requesterTrip, matchTrip.user_email);
    const candidateSlotWithRequester = getSlotForEmail(matchTrip, requesterTrip.user_email);

    if (requesterSlotWithCandidate !== -1) {
      updates.push({
        id: requesterTrip.id,
        updates: clearSlotPatch(requesterSlotWithCandidate)
      });
    }

    if (candidateSlotWithRequester !== -1) {
      updates.push({
        id: matchTrip.id,
        updates: clearSlotPatch(candidateSlotWithRequester)
      });
    }

    const requesterPartners = getMatchedPartners(requesterTrip);
    const partnerTrips = requesterPartners.length > 0
      ? getPartnerTripsInContext(
          await repo.getTripsByUserEmails(requesterPartners, TRIP_MATCH_FIELDS),
          requesterTrip.direction,
          requesterTrip.flight_date
        )
      : [];

    partnerTrips.forEach((partnerTrip) => {
      const partnerSlot = getSlotForEmail(partnerTrip, matchTrip.user_email);
      if (
        partnerSlot !== -1 &&
        partnerTrip[matchStatusFields[partnerSlot]] === "partner_approval_needed"
      ) {
        updates.push({
          id: partnerTrip.id,
          updates: clearSlotPatch(partnerSlot)
        });
      }
    });

    await commitTripUpdates(repo, [trip, matchTrip, requesterTrip, ...partnerTrips], updates);
    return { ok: true };
  }

  const matchSlot = getSlotForEmail(matchTrip, trip.user_email);
  if (matchSlot === -1) {
    throw new HttpError(404, "Match not found");
  }

  await commitTripUpdates(repo, [trip, matchTrip], [
    { id: trip.id, updates: clearSlotPatch(requesterSlot) },
    { id: matchTrip.id, updates: clearSlotPatch(matchSlot) }
  ]);

  return { ok: true };
}

async function runRemoveAction(repo, trip, matchTrip) {
  const requesterSlot = getSlotForEmail(trip, matchTrip.user_email);
  const matchSlot = getSlotForEmail(matchTrip, trip.user_email);

  if (requesterSlot === -1 || matchSlot === -1) {
    throw new HttpError(404, "Match not found");
  }

  await commitTripUpdates(repo, [trip, matchTrip], [
    { id: trip.id, updates: clearSlotPatch(requesterSlot) },
    { id: matchTrip.id, updates: clearSlotPatch(matchSlot) }
  ]);

  return { ok: true };
}

export async function executeMatchRequest({
  repo,
  requesterEmail,
  action,
  tripId,
  matchedTripId
}) {
  const normalizedAction = requireNonEmptyString(action, "action");
  const normalizedTripId = requireNonEmptyString(tripId, "tripId");
  const normalizedMatchedTripId = requireNonEmptyString(matchedTripId, "matchedTripId");

  if (!MATCH_ACTIONS.includes(normalizedAction)) {
    throw new HttpError(400, "Unsupported action");
  }

  if (normalizedTripId === normalizedMatchedTripId) {
    throw new HttpError(400, "A trip cannot match with itself");
  }

  return withKeyedLock(pairLockKey(normalizedTripId, normalizedMatchedTripId), async () => {
    const { trip, matchTrip } = await loadPair(repo, normalizedTripId, normalizedMatchedTripId);
    const ownsTrip = trip.user_email === requesterEmail;
    const ownsMatchTrip = matchTrip.user_email === requesterEmail;

    authorizeAction(normalizedAction, ownsTrip, ownsMatchTrip);

    if (normalizedAction === "request") {
      return runRequestAction(repo, trip, matchTrip);
    }

    if (normalizedAction === "withdraw") {
      return runWithdrawAction(repo, trip, matchTrip);
    }

    if (normalizedAction === "accept") {
      return runAcceptAction(repo, trip, matchTrip);
    }

    if (normalizedAction === "deny") {
      return runDenyAction(repo, trip, matchTrip);
    }

    return runRemoveAction(repo, trip, matchTrip);
  });
}

