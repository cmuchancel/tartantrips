import { executeMatchRequest } from "./match-requests-service";

const isMissingRpcError = (error) => {
  const message = error?.message || "";
  return (
    message.includes("Could not find the function") ||
    (message.includes("match_transition") && message.includes("does not exist")) ||
    (message.includes("function") && message.includes("does not exist"))
  );
};

export async function executeMatchTransition({
  repo,
  requesterEmail,
  action,
  tripId,
  matchedTripId
}) {
  if (typeof repo.executeMatchTransition !== "function") {
    return executeMatchRequest({
      repo,
      requesterEmail,
      action,
      tripId,
      matchedTripId
    });
  }

  try {
    return await repo.executeMatchTransition({
      action,
      tripId,
      matchedTripId,
      requesterEmail
    });
  } catch (error) {
    if (!isMissingRpcError(error)) {
      throw error;
    }

    return executeMatchRequest({
      repo,
      requesterEmail,
      action,
      tripId,
      matchedTripId
    });
  }
}
