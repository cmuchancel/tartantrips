import { beforeEach, describe, expect, it } from "vitest";

import { createTripStatusSyncRoute } from "../../lib/backend/trip-status-sync-route";
import { executeTripStatusSync } from "../../lib/backend/trip-status-sync-service";
import { makeTrip, pairTrips, resetFixtureCounters, setMatch } from "../helpers/backend-fixtures";
import { FakeBackendRepository } from "../helpers/fake-backend-repo";
import { createMockRequest, readJson } from "../helpers/request";

const validToken = "valid";

function createHarness({ trips = [], authUsersByToken = null, createRepository = null } = {}) {
  const repo = createRepository
    ? null
    : new FakeBackendRepository({
        trips,
        authUsersByToken: authUsersByToken || {
          [validToken]: {
            email: trips[0]?.user_email || "user1@andrew.cmu.edu"
          }
        }
      });
  const route = createTripStatusSyncRoute({
    createRepository: createRepository || (() => repo)
  });

  return { repo, route };
}

async function post(route, body, headers = { authorization: `Bearer ${validToken}` }) {
  const response = await route(createMockRequest({ body, headers }));
  return {
    response,
    json: await readJson(response)
  };
}

describe("trip-status-sync", () => {
  beforeEach(() => {
    resetFixtureCounters();
  });

  it.each([
    ["missing repo", () => null, 500, "Missing Supabase service role configuration"],
    ["invalid json", undefined, 400, "Invalid JSON payload", new SyntaxError("bad json")],
    ["array", undefined, 400, "Request body must be a JSON object", []],
    ["missing tripId", undefined, 400, "tripId is required", { trip_status: "Matched and still looking" }],
    ["missing trip_status", undefined, 400, "trip_status is required", { tripId: "trip-1" }],
    ["blank trip_status", undefined, 400, "trip_status is required", { tripId: "trip-1", trip_status: " " }],
    ["invalid status", undefined, 400, "Invalid trip_status", { tripId: "trip-1", trip_status: "Not a status" }]
  ])("%s", async (_label, customRepoFactory, expectedStatus, expectedError, body) => {
    const { route } = createHarness({
      createRepository: customRepoFactory || (() => new FakeBackendRepository())
    });
    const response = await route(
      createMockRequest({
        body: body === undefined ? { tripId: "trip-1", trip_status: "Matched and still looking" } : body,
        headers: { authorization: `Bearer ${validToken}` }
      })
    );
    expect(response.status).toBe(expectedStatus);
    expect((await readJson(response)).error).toBe(expectedError);
  });

  it.each([
    ["missing auth", {}, "Missing auth token"],
    ["invalid auth", { authorization: "Bearer bad" }, "Invalid auth token"],
    ["blank auth", { authorization: "" }, "Missing auth token"]
  ])("auth handling: %s", async (_label, headers, expectedError) => {
    const trip = makeTrip({ id: "trip-1", user_email: "user1@andrew.cmu.edu" });
    const { route } = createHarness({ trips: [trip] });
    const response = await route(
      createMockRequest({
        body: { tripId: trip.id, trip_status: "Matched and still looking" },
        headers
      })
    );
    expect((await readJson(response)).error).toBe(expectedError);
  });

  it("returns 404 for a missing trip", async () => {
    const { route } = createHarness({ trips: [] });
    const { response, json } = await post(route, {
      tripId: "missing",
      trip_status: "Matched and still looking"
    });
    expect(response.status).toBe(404);
    expect(json.error).toBe("Trip not found");
  });

  it("returns 403 for a non-owner", async () => {
    const trip = makeTrip({ id: "trip-1", user_email: "owner@andrew.cmu.edu" });
    const { route } = createHarness({
      trips: [trip],
      authUsersByToken: { [validToken]: { email: "outsider@andrew.cmu.edu" } }
    });
    const { response, json } = await post(route, {
      tripId: trip.id,
      trip_status: "Matched and still looking"
    });
    expect(response.status).toBe(403);
    expect(json.error).toBe("Not authorized");
  });

  it.each([
    ["one trip", [], 1],
    ["one matched partner", [
      setMatch(makeTrip({ id: "partner", user_email: "partner@andrew.cmu.edu" }), 0, "owner@andrew.cmu.edu", "matched")
    ], 2],
    ["two matched partners", [
      setMatch(makeTrip({ id: "partner-a", user_email: "partner-a@andrew.cmu.edu" }), 0, "owner@andrew.cmu.edu", "matched"),
      setMatch(makeTrip({ id: "partner-b", user_email: "partner-b@andrew.cmu.edu" }), 0, "owner@andrew.cmu.edu", "matched")
    ], 3]
  ])("sync updates matched set: %s", async (_label, partnerTrips, expectedUpdated) => {
    const source = setMatch(
      partnerTrips.reduce((trip, partner, index) => {
        return setMatch(trip, index, partner.user_email, "matched");
      }, makeTrip({ id: "source", user_email: "owner@andrew.cmu.edu" })),
      5,
      "ignored@andrew.cmu.edu",
      "request_sent"
    );
    const { repo } = createHarness({ trips: [source, ...partnerTrips] });

    const result = await executeTripStatusSync({
      repo,
      requesterEmail: source.user_email,
      tripId: source.id,
      tripStatus: "Matched and satisfied"
    });

    expect(result.updated).toBe(expectedUpdated);
    expect(repo.readTrip(source.id).trip_status).toBe("Matched and satisfied");
    partnerTrips.forEach((partnerTrip) => {
      expect(repo.readTrip(partnerTrip.id).trip_status).toBe("Matched and satisfied");
    });
  });

  it("ignores non-reciprocal trips with the same user_email", async () => {
    const [source, partner] = pairTrips(
      makeTrip({ id: "source", user_email: "owner@andrew.cmu.edu" }),
      makeTrip({ id: "partner", user_email: "partner@andrew.cmu.edu" }),
      "matched",
      "matched"
    );
    const unrelated = makeTrip({ id: "unrelated", user_email: partner.user_email });
    const { repo } = createHarness({ trips: [source, partner, unrelated] });

    const result = await executeTripStatusSync({
      repo,
      requesterEmail: source.user_email,
      tripId: source.id,
      tripStatus: "Matched and still looking"
    });

    expect(result.updated).toBe(2);
    expect(repo.readTrip(unrelated.id).trip_status).toBe("Unmatched (looking for matches)");
  });

  it("repository read failures become 500 errors", async () => {
    const trip = makeTrip({ id: "source", user_email: "owner@andrew.cmu.edu" });
    const { repo, route } = createHarness({ trips: [trip] });
    repo.enqueueFailure("getTripById", "Read failed");

    const { response, json } = await post(route, {
      tripId: trip.id,
      trip_status: "Matched and still looking"
    });

    expect(response.status).toBe(500);
    expect(json.error).toBe("Read failed");
  });

  it("rollback restores earlier writes if a partner update fails", async () => {
    const [source, partner] = pairTrips(
      makeTrip({ id: "source", user_email: "owner@andrew.cmu.edu" }),
      makeTrip({ id: "partner", user_email: "partner@andrew.cmu.edu" }),
      "matched",
      "matched"
    );
    const { repo } = createHarness({ trips: [source, partner] });
    repo.enqueueFailure("updateTrip", "Partner write failed", ({ id }) => id === partner.id);

    await expect(
      executeTripStatusSync({
        repo,
        requesterEmail: source.user_email,
        tripId: source.id,
        tripStatus: "Matched and satisfied"
      })
    ).rejects.toThrow("Partner write failed");

    expect(repo.readTrip(source.id).trip_status).toBe("Unmatched (looking for matches)");
    expect(repo.readTrip(partner.id).trip_status).toBe("Unmatched (looking for matches)");
  });

  it.each([
    "Matched and still looking",
    "Matched and satisfied",
    "Unmatched (looking for matches)"
  ])("route accepts %s", async (tripStatus) => {
    const trip = makeTrip({ id: "source", user_email: "owner@andrew.cmu.edu" });
    const { response, json } = await post(createHarness({ trips: [trip] }).route, {
      tripId: trip.id,
      trip_status: tripStatus
    });

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
  });

  it("concurrent sync calls remain stable", async () => {
    const [source, partner] = pairTrips(
      makeTrip({ id: "source", user_email: "owner@andrew.cmu.edu" }),
      makeTrip({ id: "partner", user_email: "partner@andrew.cmu.edu" }),
      "matched",
      "matched"
    );
    const { repo } = createHarness({ trips: [source, partner] });

    await Promise.all([
      executeTripStatusSync({
        repo,
        requesterEmail: source.user_email,
        tripId: source.id,
        tripStatus: "Matched and still looking"
      }),
      executeTripStatusSync({
        repo,
        requesterEmail: source.user_email,
        tripId: source.id,
        tripStatus: "Matched and still looking"
      })
    ]);

    expect(repo.readTrip(source.id).trip_status).toBe("Matched and still looking");
    expect(repo.readTrip(partner.id).trip_status).toBe("Matched and still looking");
  });
});

