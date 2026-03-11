import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMatchRequestsRoute } from "../../lib/backend/match-requests-route";
import { executeMatchTransition } from "../../lib/backend/match-transition-service";
import { makeTrip, pairTrips, resetFixtureCounters } from "../helpers/backend-fixtures";
import { FakeBackendRepository } from "../helpers/fake-backend-repo";
import { createMockRequest, readJson } from "../helpers/request";

const validToken = "valid";

describe("match transition boundary", () => {
  beforeEach(() => {
    resetFixtureCounters();
  });

  it("uses the RPC boundary when available", async () => {
    const executeRpc = vi.fn().mockResolvedValue({ ok: true, via: "rpc" });

    const result = await executeMatchTransition({
      repo: {
        executeMatchTransition: executeRpc
      },
      requesterEmail: "owner@andrew.cmu.edu",
      action: "request",
      tripId: "trip-1",
      matchedTripId: "trip-2"
    });

    expect(result).toEqual({ ok: true, via: "rpc" });
    expect(executeRpc).toHaveBeenCalledWith({
      action: "request",
      tripId: "trip-1",
      matchedTripId: "trip-2",
      requesterEmail: "owner@andrew.cmu.edu"
    });
  });

  it("falls back to the existing service when the RPC is unavailable", async () => {
    const [trip, matchedTrip] = pairTrips(
      makeTrip({ id: "trip-1", user_email: "owner@andrew.cmu.edu" }),
      makeTrip({ id: "trip-2", user_email: "candidate@andrew.cmu.edu" }),
      "request_sent",
      "request_received"
    );
    const repo = new FakeBackendRepository({ trips: [trip, matchedTrip] });

    const result = await executeMatchTransition({
      repo,
      requesterEmail: trip.user_email,
      action: "withdraw",
      tripId: trip.id,
      matchedTripId: matchedTrip.id
    });

    expect(result.ok).toBe(true);
    expect(repo.readTrip(trip.id).match_email_0).toBe(null);
    expect(repo.readTrip(matchedTrip.id).match_email_0).toBe(null);
  });

  it("surfaces RPC failures through the route", async () => {
    const trip = makeTrip({ id: "trip-1", user_email: "owner@andrew.cmu.edu" });
    const matchedTrip = makeTrip({ id: "trip-2", user_email: "candidate@andrew.cmu.edu" });
    const route = createMatchRequestsRoute({
      createRepository: () => ({
        async getAuthUserByToken() {
          return { email: trip.user_email };
        },
        async executeMatchTransition() {
          throw new Error("match_transition rejected the request");
        }
      })
    });

    const response = await route(
      createMockRequest({
        body: {
          action: "request",
          tripId: trip.id,
          matchedTripId: matchedTrip.id
        },
        headers: { authorization: `Bearer ${validToken}` }
      })
    );
    const json = await readJson(response);

    expect(response.status).toBe(500);
    expect(json.error).toBe("match_transition rejected the request");
  });
});
