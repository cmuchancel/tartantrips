import { HttpError } from "./errors";
import {
  applyTripUpdates,
  assertTripIntegrity,
  assertTripStatusesKnown,
  buildRollbackPatch,
  mergeUpdatesById
} from "./match-utils";

export function mapTripsById(trips) {
  return new Map(trips.map((trip) => [trip.id, trip]));
}

export async function commitTripUpdates(repo, originalTrips, updateOperations) {
  const mergedUpdates = mergeUpdatesById(updateOperations);
  if (mergedUpdates.length === 0) {
    return;
  }

  const originalById = mapTripsById(originalTrips);

  mergedUpdates.forEach(({ id, updates }) => {
    const originalTrip = originalById.get(id);
    if (!originalTrip) {
      throw new HttpError(500, `Missing original trip for update ${id}`);
    }

    const predictedTrip = applyTripUpdates(originalTrip, updates);
    assertTripIntegrity(predictedTrip, "Trip");
    assertTripStatusesKnown(predictedTrip);
  });

  const applied = [];

  try {
    for (const { id, updates } of mergedUpdates) {
      await repo.updateTrip(id, updates);
      applied.push({ id, keys: Object.keys(updates) });
    }
  } catch (error) {
    let rollbackFailed = false;

    for (const { id, keys } of [...applied].reverse()) {
      const originalTrip = originalById.get(id);
      try {
        await repo.updateTrip(id, buildRollbackPatch(originalTrip, keys));
      } catch (rollbackError) {
        rollbackFailed = true;
        break;
      }
    }

    if (rollbackFailed) {
      throw new HttpError(500, "Failed to update trips and rollback may be incomplete");
    }

    throw new HttpError(500, error.message || "Failed to update trips");
  }
}

