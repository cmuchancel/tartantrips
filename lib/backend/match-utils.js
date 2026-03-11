import { matchEmailFields, matchStatusFields, MATCH_STATUSES } from "./constants";
import { HttpError } from "./errors";

export function getSlotForEmail(trip, email) {
  return matchEmailFields.findIndex((field) => trip?.[field] === email);
}

export function getSlotsForEmail(trip, email) {
  return matchEmailFields.flatMap((field, index) => (
    trip?.[field] === email ? [index] : []
  ));
}

export function getEmptySlot(trip) {
  return matchEmailFields.findIndex((field) => !trip?.[field]);
}

export function getMatchEntries(trip) {
  return matchEmailFields.map((emailField, index) => ({
    slot: index,
    email: trip?.[emailField] ?? null,
    status: trip?.[matchStatusFields[index]] ?? null
  }));
}

export function getMatchedPartners(trip) {
  return getMatchEntries(trip)
    .filter((entry) => entry.email && entry.status === "matched")
    .map((entry) => entry.email);
}

export function hasStatusWithEmail(trip, email, status) {
  const slot = getSlotForEmail(trip, email);
  if (slot === -1) {
    return false;
  }

  return trip?.[matchStatusFields[slot]] === status;
}

export function buildSlotPatch(slot, email, status) {
  if (slot < 0 || slot >= matchEmailFields.length) {
    throw new HttpError(500, "Invalid match slot");
  }

  return {
    [matchEmailFields[slot]]: email,
    [matchStatusFields[slot]]: status
  };
}

export function clearSlotPatch(slot) {
  return buildSlotPatch(slot, null, null);
}

export function applyTripUpdates(trip, updates) {
  return { ...trip, ...updates };
}

export function getOccupiedMatchCount(trip) {
  return getMatchEntries(trip).filter((entry) => Boolean(entry.email)).length;
}

export function findDuplicateMatchEmails(trip) {
  const seen = new Set();
  const duplicates = new Set();

  getMatchEntries(trip)
    .map((entry) => entry.email)
    .filter(Boolean)
    .forEach((email) => {
      if (seen.has(email)) {
        duplicates.add(email);
        return;
      }

      seen.add(email);
    });

  return [...duplicates];
}

export function assertTripIntegrity(trip, label = "Trip") {
  if (!trip?.id) {
    throw new HttpError(404, "Trip not found");
  }

  if (!trip.user_email) {
    throw new HttpError(409, `${label} is missing user_email`);
  }

  const duplicates = findDuplicateMatchEmails(trip);
  if (duplicates.length > 0) {
    throw new HttpError(409, `${label} has duplicate match entries`);
  }
}

export function assertKnownMatchStatus(status) {
  if (status && !MATCH_STATUSES.includes(status)) {
    throw new HttpError(409, `Unknown match status: ${status}`);
  }
}

export function assertTripStatusesKnown(trip) {
  getMatchEntries(trip).forEach((entry) => {
    assertKnownMatchStatus(entry.status);
  });
}

export function allowsSex(allowed, partnerSex) {
  if (!allowed || allowed === "Any") {
    return true;
  }

  if (allowed === "Male only") {
    return partnerSex === "Male";
  }

  if (allowed === "Female only") {
    return partnerSex === "Female";
  }

  if (allowed === "Non-binary only") {
    return partnerSex === "Non-binary";
  }

  return false;
}

const parseTimestamp = (value) => {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

export function windowsOverlap(aStart, aEnd, bStart, bEnd) {
  const parsedAStart = parseTimestamp(aStart);
  const parsedAEnd = parseTimestamp(aEnd);
  const parsedBStart = parseTimestamp(bStart);
  const parsedBEnd = parseTimestamp(bEnd);

  if (
    parsedAStart === null ||
    parsedAEnd === null ||
    parsedBStart === null ||
    parsedBEnd === null
  ) {
    return false;
  }

  return parsedAStart <= parsedBEnd && parsedAEnd >= parsedBStart;
}

export function areTripsCompatibleForRequest(trip, matchTrip) {
  return (
    trip.direction === matchTrip.direction &&
    trip.flight_date === matchTrip.flight_date &&
    trip.id !== matchTrip.id &&
    trip.user_email !== matchTrip.user_email
  );
}

export function mergeUpdatesById(updateOperations) {
  const merged = new Map();

  updateOperations.forEach(({ id, updates }) => {
    if (!updates || Object.keys(updates).length === 0) {
      return;
    }

    merged.set(id, {
      ...(merged.get(id) || {}),
      ...updates
    });
  });

  return [...merged.entries()].map(([id, updates]) => ({ id, updates }));
}

export function buildRollbackPatch(originalTrip, keys) {
  return keys.reduce((rollback, key) => {
    rollback[key] = originalTrip[key] ?? null;
    return rollback;
  }, {});
}

