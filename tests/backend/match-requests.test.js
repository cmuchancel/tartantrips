import { beforeEach, describe, expect, it } from "vitest";

import { createMatchRequestsRoute } from "../../lib/backend/match-requests-route";
import { executeMatchRequest } from "../../lib/backend/match-requests-service";
import { matchEmailFields, matchStatusFields } from "../../lib/backend/constants";
import { makeTrip, pairTrips, resetFixtureCounters, setMatch } from "../helpers/backend-fixtures";
import { FakeBackendRepository } from "../helpers/fake-backend-repo";
import { createMockRequest, readJson } from "../helpers/request";

const validToken = "valid";

function createHarness({
  trips = [],
  authUsersByToken = null,
  createRepository = null,
  updateDelayMs = 0
} = {}) {
  const repo = createRepository
    ? null
    : new FakeBackendRepository({
        trips,
        authUsersByToken: authUsersByToken || {
          [validToken]: {
            email: trips[0]?.user_email || "user1@andrew.cmu.edu"
          }
        },
        updateDelayMs
      });

  const route = createMatchRequestsRoute({
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

describe("match-requests route and service", () => {
  beforeEach(() => {
    resetFixtureCounters();
  });

  it.each([
    ["missing repo", () => null, 500, "Missing Supabase service role configuration"],
    ["invalid json", undefined, 400, "Invalid JSON payload", new SyntaxError("bad json")],
    ["array body", undefined, 400, "Request body must be a JSON object", []],
    ["null body", undefined, 400, "Request body must be a JSON object", null],
    ["missing action", undefined, 400, "action is required", { tripId: "a", matchedTripId: "b" }],
    ["missing tripId", undefined, 400, "tripId is required", { action: "request", matchedTripId: "b" }],
    ["missing matchedTripId", undefined, 400, "matchedTripId is required", { action: "request", tripId: "a" }],
    ["blank action", undefined, 400, "action is required", { action: " ", tripId: "a", matchedTripId: "b" }],
    ["blank tripId", undefined, 400, "tripId is required", { action: "request", tripId: " ", matchedTripId: "b" }],
    ["blank matchedTripId", undefined, 400, "matchedTripId is required", { action: "request", tripId: "a", matchedTripId: " " }],
    ["unsupported action", undefined, 400, "Unsupported action", { action: "approve", tripId: "a", matchedTripId: "b" }],
    ["same trip ids", undefined, 400, "A trip cannot match with itself", { action: "request", tripId: "a", matchedTripId: "a" }]
  ])("%s", async (_label, customRepoFactory, expectedStatus, expectedError, customBody) => {
    const { route } = createHarness({
      createRepository: customRepoFactory || (() => new FakeBackendRepository())
    });
    const response = await route(
      createMockRequest({
        body: customBody === undefined ? { action: "request", tripId: "a", matchedTripId: "b" } : customBody,
        headers: { authorization: `Bearer ${validToken}` }
      })
    );

    expect(response.status).toBe(expectedStatus);
    expect((await readJson(response)).error).toBe(expectedError);
  });

  it.each([
    ["missing header", {}, "Missing auth token"],
    ["blank header", { authorization: "" }, "Missing auth token"],
    ["empty bearer", { authorization: "Bearer    " }, "Missing auth token"],
    ["invalid token", { authorization: "Bearer bad" }, "Invalid auth token"],
    ["trimmed token", { authorization: `Bearer   ${validToken}  ` }, null]
  ])("auth handling: %s", async (_label, headers, expectedError) => {
    const [trip, matchTrip] = pairTrips(makeTrip(), makeTrip(), "request_sent", "request_received");
    const { route } = createHarness({ trips: [trip, matchTrip] });
    const response = await route(
      createMockRequest({
        body: { action: "withdraw", tripId: trip.id, matchedTripId: matchTrip.id },
        headers
      })
    );
    const json = await readJson(response);

    if (expectedError) {
      expect(response.status).toBe(expectedError === "Invalid auth token" ? 401 : 401);
      expect(json.error).toBe(expectedError);
      return;
    }

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
  });

  it("auth failures do not mutate state", async () => {
    const [trip, matchTrip] = pairTrips(makeTrip(), makeTrip(), "request_sent", "request_received");
    const { repo, route } = createHarness({
      trips: [trip, matchTrip],
      authUsersByToken: {}
    });

    const { response } = await post(
      route,
      { action: "withdraw", tripId: trip.id, matchedTripId: matchTrip.id },
      { authorization: "Bearer bad" }
    );

    expect(response.status).toBe(401);
    expect(repo.readTrip(trip.id).match_email_0).toBe(matchTrip.user_email);
    expect(repo.readTrip(matchTrip.id).match_email_0).toBe(trip.user_email);
  });

  it.each([
    ["missing both", [], 404, "Trips not found"],
    ["missing target", [makeTrip({ id: "trip-a" })], 404, "Trips not found"],
    ["missing source", [makeTrip({ id: "trip-b" })], 404, "Trips not found"]
  ])("lookup errors: %s", async (_label, trips, expectedStatus, expectedError) => {
    const { route } = createHarness({ trips });
    const { response, json } = await post(route, {
      action: "request",
      tripId: "trip-a",
      matchedTripId: "trip-b"
    });
    expect(response.status).toBe(expectedStatus);
    expect(json.error).toBe(expectedError);
  });

  it("lookup repository failures become 500 errors", async () => {
    const trip = makeTrip({ id: "trip-a" });
    const matchTrip = makeTrip({ id: "trip-b" });
    const { repo, route } = createHarness({ trips: [trip, matchTrip] });
    repo.enqueueFailure("getTripsByIds", "Database unavailable");

    const { response, json } = await post(route, {
      action: "request",
      tripId: trip.id,
      matchedTripId: matchTrip.id
    });

    expect(response.status).toBe(500);
    expect(json.error).toBe("Database unavailable");
  });

  it.each([
    ["request", "request", 403],
    ["withdraw", "withdraw", 403],
    ["accept", "accept", 403],
    ["deny", "deny", 403]
  ])("owner checks for %s", async (_label, action, expectedStatus) => {
    const [trip, matchTrip] = pairTrips(makeTrip(), makeTrip(), "request_received", "request_sent");
    const { route } = createHarness({
      trips: [trip, matchTrip],
      authUsersByToken: { [validToken]: { email: "outsider@andrew.cmu.edu" } }
    });

    const { response, json } = await post(route, {
      action,
      tripId: trip.id,
      matchedTripId: matchTrip.id
    });

    expect(response.status).toBe(expectedStatus);
    expect(json.error).toBe("Not authorized");
  });

  it.each([
    ["remove allowed for source owner", "source", 200],
    ["remove allowed for target owner", "target", 200],
    ["remove denied for outsider", "outsider", 403]
  ])("%s", async (_label, who, expectedStatus) => {
    const [trip, matchTrip] = pairTrips(makeTrip(), makeTrip(), "matched", "matched");
    const email =
      who === "source"
        ? trip.user_email
        : who === "target"
          ? matchTrip.user_email
          : "outsider@andrew.cmu.edu";
    const { route } = createHarness({
      trips: [trip, matchTrip],
      authUsersByToken: { [validToken]: { email } }
    });

    const { response } = await post(route, {
      action: "remove",
      tripId: trip.id,
      matchedTripId: matchTrip.id
    });

    expect(response.status).toBe(expectedStatus);
  });

  it.each([
    ["incompatible direction", { direction: "Departing Pittsburgh" }, {}, 400, "Trips are not compatible for matching"],
    ["same owner", {}, { user_email: "user1@andrew.cmu.edu" }, 400, "Trips are not compatible for matching"],
    ["different date", { flight_date: "2026-03-12" }, {}, 400, "Trips are not compatible for matching"]
  ])("request validation: %s", async (_label, tripOverrides, matchOverrides, expectedStatus, expectedError) => {
    const trip = makeTrip({ id: "trip-a", user_email: "user1@andrew.cmu.edu", ...tripOverrides });
    const matchTrip = makeTrip({ id: "trip-b", user_email: "user2@andrew.cmu.edu", ...matchOverrides });
    const { route } = createHarness({ trips: [trip, matchTrip] });

    const { response, json } = await post(route, {
      action: "request",
      tripId: trip.id,
      matchedTripId: matchTrip.id
    });

    expect(response.status).toBe(expectedStatus);
    expect(json.error).toBe(expectedError);
  });

  it.each([
    ["fresh slots", makeTrip({ id: "trip-a" }), makeTrip({ id: "trip-b" }), 0, 0],
    [
      "source existing slot",
      setMatch(makeTrip({ id: "trip-a" }), 2, "user2@andrew.cmu.edu", "request_received"),
      makeTrip({ id: "trip-b", user_email: "user2@andrew.cmu.edu" }),
      2,
      0
    ],
    [
      "target existing slot",
      makeTrip({ id: "trip-a" }),
      setMatch(makeTrip({ id: "trip-b", user_email: "user2@andrew.cmu.edu" }), 4, "user1@andrew.cmu.edu", "request_sent"),
      0,
      4
    ],
    [
      "slot five",
      Array.from({ length: 5 }).reduce((trip, _value, slot) => {
        return setMatch(trip, slot, `filled${slot}@cmu.edu`, "matched");
      }, makeTrip({ id: "trip-a" })),
      Array.from({ length: 5 }).reduce((trip, _value, slot) => {
        return setMatch(trip, slot, `other${slot}@cmu.edu`, "matched");
      }, makeTrip({ id: "trip-b", user_email: "user2@andrew.cmu.edu" })),
      5,
      5
    ]
  ])("request success: %s", async (_label, tripInput, matchTripInput, expectedTripSlot, expectedMatchSlot) => {
    const trip = { ...tripInput, user_email: "user1@andrew.cmu.edu" };
    const matchTrip = { ...matchTripInput, user_email: "user2@andrew.cmu.edu" };
    const { repo, route } = createHarness({ trips: [trip, matchTrip] });

    const { response, json } = await post(route, {
      action: "request",
      tripId: trip.id,
      matchedTripId: matchTrip.id
    });

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(repo.readTrip(trip.id)[matchEmailFields[expectedTripSlot]]).toBe(matchTrip.user_email);
    expect(repo.readTrip(trip.id)[matchStatusFields[expectedTripSlot]]).toBe("request_sent");
    expect(repo.readTrip(matchTrip.id)[matchEmailFields[expectedMatchSlot]]).toBe(trip.user_email);
    expect(repo.readTrip(matchTrip.id)[matchStatusFields[expectedMatchSlot]]).toBe("request_received");
  });

  it.each([
    ["source full", makeTrip({ id: "trip-a" }), makeTrip({ id: "trip-b", user_email: "user2@andrew.cmu.edu" }), "source"],
    ["target full", makeTrip({ id: "trip-a" }), makeTrip({ id: "trip-b", user_email: "user2@andrew.cmu.edu" }), "target"]
  ])("request full slots: %s", async (_label, tripInput, matchTripInput, fullSide) => {
    const trip = Array.from({ length: 6 }).reduce((current, _value, slot) => {
      if (fullSide !== "source") {
        return current;
      }
      return setMatch(current, slot, `filled${slot}@cmu.edu`, "matched");
    }, { ...tripInput, user_email: "user1@andrew.cmu.edu" });
    const matchTrip = Array.from({ length: 6 }).reduce((current, _value, slot) => {
      if (fullSide !== "target") {
        return current;
      }
      return setMatch(current, slot, `other${slot}@cmu.edu`, "matched");
    }, matchTripInput);

    const { route } = createHarness({ trips: [trip, matchTrip] });
    const { response, json } = await post(route, {
      action: "request",
      tripId: trip.id,
      matchedTripId: matchTrip.id
    });

    expect(response.status).toBe(400);
    expect(json.error).toBe("No available match slots");
  });

  it.each([
    ["already requested", "request_sent", "request_received"],
    ["already matched", "matched", "matched"],
    ["already pending", "partner_approval_needed", "partner_approval_needed"]
  ])("request idempotency for %s", async (_label, statusA, statusB) => {
    const [trip, matchTrip] = pairTrips(
      makeTrip({ user_email: "user1@andrew.cmu.edu" }),
      makeTrip({ user_email: "user2@andrew.cmu.edu" }),
      statusA,
      statusB
    );
    const { repo, route } = createHarness({ trips: [trip, matchTrip] });

    const { response, json } = await post(route, {
      action: "request",
      tripId: trip.id,
      matchedTripId: matchTrip.id
    });

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(repo.operationLog.filter((entry) => entry.type === "updateTrip")).toHaveLength(0);
  });

  it("request rejects conflicted matched state", async () => {
    const trip = setMatch(makeTrip({ user_email: "user1@andrew.cmu.edu" }), 0, "user2@andrew.cmu.edu", "matched");
    const matchTrip = makeTrip({ user_email: "user2@andrew.cmu.edu" });
    const { route } = createHarness({ trips: [trip, matchTrip] });

    const { response, json } = await post(route, {
      action: "request",
      tripId: trip.id,
      matchedTripId: matchTrip.id
    });

    expect(response.status).toBe(409);
    expect(json.error).toBe("Match state conflict");
  });

  it("request rolls back if target update fails", async () => {
    const trip = makeTrip({ id: "trip-a", user_email: "user1@andrew.cmu.edu" });
    const matchTrip = makeTrip({ id: "trip-b", user_email: "user2@andrew.cmu.edu" });
    const { repo, route } = createHarness({ trips: [trip, matchTrip] });
    repo.enqueueFailure("updateTrip", "Second update failed", ({ id }) => id === matchTrip.id);

    const { response, json } = await post(route, {
      action: "request",
      tripId: trip.id,
      matchedTripId: matchTrip.id
    });

    expect(response.status).toBe(500);
    expect(json.error).toBe("Second update failed");
    expect(repo.readTrip(trip.id).match_email_0).toBe(null);
    expect(repo.readTrip(matchTrip.id).match_email_0).toBe(null);
  });

  it.each([
    ["request_sent/request_received", "request_sent", "request_received"],
    ["matched/matched", "matched", "matched"]
  ])("withdraw clears reciprocal state from %s", async (_label, statusA, statusB) => {
    const [trip, matchTrip] = pairTrips(
      makeTrip({ user_email: "user1@andrew.cmu.edu" }),
      makeTrip({ user_email: "user2@andrew.cmu.edu" }),
      statusA,
      statusB
    );
    const { repo, route } = createHarness({ trips: [trip, matchTrip] });

    const { response } = await post(route, {
      action: "withdraw",
      tripId: trip.id,
      matchedTripId: matchTrip.id
    });

    expect(response.status).toBe(200);
    expect(repo.readTrip(trip.id).match_email_0).toBe(null);
    expect(repo.readTrip(matchTrip.id).match_email_0).toBe(null);
  });

  it("withdraw clears pending approvals on partner trips", async () => {
    const requester = setMatch(makeTrip({ id: "requester", user_email: "user1@andrew.cmu.edu" }), 1, "candidate@andrew.cmu.edu", "request_sent");
    const candidate = setMatch(makeTrip({ id: "candidate", user_email: "candidate@andrew.cmu.edu" }), 0, "user1@andrew.cmu.edu", "request_received");
    const partner = setMatch(setMatch(makeTrip({ id: "partner", user_email: "partner@andrew.cmu.edu" }), 0, requester.user_email, "matched"), 1, candidate.user_email, "partner_approval_needed");
    const requesterWithPartner = setMatch(requester, 0, partner.user_email, "matched");
    const { repo, route } = createHarness({ trips: [requesterWithPartner, candidate, partner] });

    const { response } = await post(route, {
      action: "withdraw",
      tripId: requesterWithPartner.id,
      matchedTripId: candidate.id
    });

    expect(response.status).toBe(200);
    expect(repo.readTrip(partner.id).match_email_1).toBe(null);
  });

  it.each([
    ["source missing", makeTrip({ user_email: "user1@andrew.cmu.edu" }), makeTrip({ user_email: "user2@andrew.cmu.edu" }), "source"],
    ["target missing", makeTrip({ user_email: "user1@andrew.cmu.edu" }), makeTrip({ user_email: "user2@andrew.cmu.edu" }), "target"]
  ])("withdraw returns 404 when %s slot is absent", async (_label, tripInput, matchTripInput, missingSide) => {
    const trip = missingSide === "source" ? tripInput : setMatch(tripInput, 0, matchTripInput.user_email, "request_sent");
    const matchTrip = missingSide === "target" ? matchTripInput : setMatch(matchTripInput, 0, trip.user_email, "request_received");
    const { route } = createHarness({ trips: [trip, matchTrip] });

    const { response, json } = await post(route, {
      action: "withdraw",
      tripId: trip.id,
      matchedTripId: matchTrip.id
    });

    expect(response.status).toBe(404);
    expect(json.error).toBe("Match not found");
  });

  it("withdraw rolls back on partner update failure", async () => {
    const requester = setMatch(setMatch(makeTrip({ id: "requester", user_email: "user1@andrew.cmu.edu" }), 0, "partner@andrew.cmu.edu", "matched"), 1, "candidate@andrew.cmu.edu", "request_sent");
    const candidate = setMatch(makeTrip({ id: "candidate", user_email: "candidate@andrew.cmu.edu" }), 0, "user1@andrew.cmu.edu", "request_received");
    const partner = setMatch(setMatch(makeTrip({ id: "partner", user_email: "partner@andrew.cmu.edu" }), 0, requester.user_email, "matched"), 2, candidate.user_email, "partner_approval_needed");
    const { repo, route } = createHarness({ trips: [requester, candidate, partner] });
    repo.enqueueFailure("updateTrip", "Partner update failed", ({ id }) => id === partner.id);

    const { response } = await post(route, {
      action: "withdraw",
      tripId: requester.id,
      matchedTripId: candidate.id
    });

    expect(response.status).toBe(500);
    expect(repo.readTrip(requester.id).match_email_1).toBe(candidate.user_email);
    expect(repo.readTrip(candidate.id).match_email_0).toBe(requester.user_email);
  });

  it("accept direct match flips both sides to matched", async () => {
    const [trip, matchTrip] = pairTrips(
      makeTrip({ user_email: "user1@andrew.cmu.edu" }),
      makeTrip({ user_email: "user2@andrew.cmu.edu" }),
      "request_received",
      "request_sent"
    );
    const { repo, route } = createHarness({ trips: [trip, matchTrip] });

    const { response } = await post(route, {
      action: "accept",
      tripId: trip.id,
      matchedTripId: matchTrip.id
    });

    expect(response.status).toBe(200);
    expect(repo.readTrip(trip.id).match_status_0).toBe("matched");
    expect(repo.readTrip(matchTrip.id).match_status_0).toBe("matched");
  });

  it.each([
    ["missing source slot", makeTrip({ user_email: "user1@andrew.cmu.edu" }), makeTrip({ user_email: "user2@andrew.cmu.edu" }), 404],
    ["missing target slot", setMatch(makeTrip({ user_email: "user1@andrew.cmu.edu" }), 0, "user2@andrew.cmu.edu", "request_received"), makeTrip({ user_email: "user2@andrew.cmu.edu" }), 404]
  ])("accept not-found handling: %s", async (_label, trip, matchTrip, expectedStatus) => {
    const { route } = createHarness({ trips: [trip, matchTrip] });
    const { response } = await post(route, {
      action: "accept",
      tripId: trip.id,
      matchedTripId: matchTrip.id
    });
    expect(response.status).toBe(expectedStatus);
  });

  it.each([
    ["request_sent", "Use withdraw instead of accept for an outbound request"],
    ["request_sent deny", "Use withdraw instead of deny for an outbound request", "deny"]
  ])("outbound request guard: %s", async (_label, expectedError, action = "accept") => {
    const [trip, matchTrip] = pairTrips(
      makeTrip({ user_email: "user1@andrew.cmu.edu" }),
      makeTrip({ user_email: "user2@andrew.cmu.edu" }),
      "request_sent",
      "request_received"
    );
    const { route } = createHarness({ trips: [trip, matchTrip] });
    const { response, json } = await post(route, {
      action,
      tripId: trip.id,
      matchedTripId: matchTrip.id
    });
    expect(response.status).toBe(409);
    expect(json.error).toBe(expectedError);
  });

  it("accept with existing group moves to partner approval and propagates candidate", async () => {
    const acceptor = setMatch(makeTrip({ id: "acceptor", user_email: "acceptor@andrew.cmu.edu" }), 0, "requester@andrew.cmu.edu", "request_received");
    const requester = setMatch(setMatch(makeTrip({ id: "requester", user_email: "requester@andrew.cmu.edu" }), 0, "partner@andrew.cmu.edu", "matched"), 1, "acceptor@andrew.cmu.edu", "request_sent");
    const partner = setMatch(makeTrip({ id: "partner", user_email: "partner@andrew.cmu.edu" }), 0, requester.user_email, "matched");
    const { repo, route } = createHarness({ trips: [acceptor, requester, partner] });

    const { response } = await post(route, {
      action: "accept",
      tripId: acceptor.id,
      matchedTripId: requester.id
    });

    expect(response.status).toBe(200);
    expect(repo.readTrip(acceptor.id).match_status_0).toBe("partner_approval_needed");
    expect(repo.readTrip(requester.id).match_status_1).toBe("partner_approval_needed");
    expect(repo.readTrip(partner.id).match_email_1).toBe(acceptor.user_email);
    expect(repo.readTrip(partner.id).match_status_1).toBe("partner_approval_needed");
  });

  it("accept with full partner trip fails without partial writes", async () => {
    const acceptor = setMatch(makeTrip({ id: "acceptor", user_email: "acceptor@andrew.cmu.edu" }), 0, "requester@andrew.cmu.edu", "request_received");
    const requester = setMatch(setMatch(makeTrip({ id: "requester", user_email: "requester@andrew.cmu.edu" }), 0, "partner@andrew.cmu.edu", "matched"), 1, "acceptor@andrew.cmu.edu", "request_sent");
    const fullPartner = Array.from({ length: 6 }).reduce((trip, _value, slot) => {
      return setMatch(trip, slot, `filled${slot}@andrew.cmu.edu`, "matched");
    }, makeTrip({ id: "partner", user_email: "partner@andrew.cmu.edu" }));
    const fullPartnerWithRequester = setMatch(fullPartner, 0, requester.user_email, "matched");
    const { repo, route } = createHarness({ trips: [acceptor, requester, fullPartnerWithRequester] });

    const { response, json } = await post(route, {
      action: "accept",
      tripId: acceptor.id,
      matchedTripId: requester.id
    });

    expect(response.status).toBe(400);
    expect(json.error).toBe("No available match slots");
    expect(repo.readTrip(acceptor.id).match_status_0).toBe("request_received");
  });

  it("stale partner approval accept clears local pending and finalizes when last approval arrives", async () => {
    const approver = setMatch(makeTrip({ id: "approver", user_email: "approver@andrew.cmu.edu" }), 0, "candidate@andrew.cmu.edu", "partner_approval_needed");
    const requester = setMatch(setMatch(makeTrip({ id: "requester", user_email: "requester@andrew.cmu.edu" }), 0, approver.user_email, "matched"), 1, "candidate@andrew.cmu.edu", "partner_approval_needed");
    const candidate = setMatch(makeTrip({ id: "candidate", user_email: "candidate@andrew.cmu.edu" }), 0, requester.user_email, "partner_approval_needed");
    const { repo } = createHarness({ trips: [approver, requester, candidate] });

    const result = await executeMatchRequest({
      repo,
      requesterEmail: approver.user_email,
      action: "accept",
      tripId: approver.id,
      matchedTripId: candidate.id
    });

    expect(result.ok).toBe(true);
    expect(repo.readTrip(approver.id).match_email_0).toBe(null);
    expect(repo.readTrip(requester.id).match_status_1).toBe("matched");
    expect(repo.readTrip(candidate.id).match_status_0).toBe("matched");
  });

  it("stale partner approval accept returns ok when original requester is gone", async () => {
    const approver = setMatch(makeTrip({ id: "approver", user_email: "approver@andrew.cmu.edu" }), 0, "candidate@andrew.cmu.edu", "partner_approval_needed");
    const candidate = makeTrip({ id: "candidate", user_email: "candidate@andrew.cmu.edu" });
    const { repo } = createHarness({ trips: [approver, candidate] });

    const result = await executeMatchRequest({
      repo,
      requesterEmail: approver.user_email,
      action: "accept",
      tripId: approver.id,
      matchedTripId: candidate.id
    });

    expect(result.ok).toBe(true);
    expect(repo.readTrip(approver.id).match_email_0).toBe(null);
  });

  it("deny direct request clears both sides", async () => {
    const [trip, matchTrip] = pairTrips(
      makeTrip({ user_email: "user1@andrew.cmu.edu" }),
      makeTrip({ user_email: "user2@andrew.cmu.edu" }),
      "request_received",
      "request_sent"
    );
    const { repo, route } = createHarness({ trips: [trip, matchTrip] });

    const { response } = await post(route, {
      action: "deny",
      tripId: trip.id,
      matchedTripId: matchTrip.id
    });

    expect(response.status).toBe(200);
    expect(repo.readTrip(trip.id).match_email_0).toBe(null);
    expect(repo.readTrip(matchTrip.id).match_email_0).toBe(null);
  });

  it("stale partner approval deny clears requester and partner pending state", async () => {
    const approver = setMatch(makeTrip({ id: "approver", user_email: "approver@andrew.cmu.edu" }), 0, "candidate@andrew.cmu.edu", "partner_approval_needed");
    const requester = setMatch(
      setMatch(
        setMatch(makeTrip({ id: "requester", user_email: "requester@andrew.cmu.edu" }), 0, approver.user_email, "matched"),
        1,
        "candidate@andrew.cmu.edu",
        "partner_approval_needed"
      ),
      2,
      "partner@andrew.cmu.edu",
      "matched"
    );
    const candidate = setMatch(makeTrip({ id: "candidate", user_email: "candidate@andrew.cmu.edu" }), 0, requester.user_email, "partner_approval_needed");
    const partner = setMatch(setMatch(makeTrip({ id: "partner", user_email: "partner@andrew.cmu.edu" }), 0, requester.user_email, "matched"), 1, candidate.user_email, "partner_approval_needed");
    const { repo } = createHarness({ trips: [approver, requester, candidate, partner] });

    const result = await executeMatchRequest({
      repo,
      requesterEmail: approver.user_email,
      action: "deny",
      tripId: approver.id,
      matchedTripId: candidate.id
    });

    expect(result.ok).toBe(true);
    expect(repo.readTrip(approver.id).match_email_0).toBe(null);
    expect(repo.readTrip(requester.id).match_email_1).toBe(null);
    expect(repo.readTrip(candidate.id).match_email_0).toBe(null);
    expect(repo.readTrip(partner.id).match_email_1).toBe(null);
  });

  it.each([
    ["source missing", makeTrip({ user_email: "user1@andrew.cmu.edu" }), makeTrip({ user_email: "user2@andrew.cmu.edu" })],
    ["target missing", setMatch(makeTrip({ user_email: "user1@andrew.cmu.edu" }), 0, "user2@andrew.cmu.edu", "matched"), makeTrip({ user_email: "user2@andrew.cmu.edu" })]
  ])("remove requires reciprocal slots: %s", async (_label, trip, matchTrip) => {
    const { route } = createHarness({ trips: [trip, matchTrip] });
    const { response } = await post(route, {
      action: "remove",
      tripId: trip.id,
      matchedTripId: matchTrip.id
    });
    expect(response.status).toBe(404);
  });

  it("remove clears matched relationships", async () => {
    const [trip, matchTrip] = pairTrips(
      makeTrip({ user_email: "user1@andrew.cmu.edu" }),
      makeTrip({ user_email: "user2@andrew.cmu.edu" }),
      "matched",
      "matched"
    );
    const { repo, route } = createHarness({ trips: [trip, matchTrip] });
    const { response } = await post(route, {
      action: "remove",
      tripId: trip.id,
      matchedTripId: matchTrip.id
    });
    expect(response.status).toBe(200);
    expect(repo.readTrip(trip.id).match_email_0).toBe(null);
    expect(repo.readTrip(matchTrip.id).match_email_0).toBe(null);
  });

  it("duplicate emails in one trip are rejected", async () => {
    const trip = setMatch(setMatch(makeTrip({ user_email: "user1@andrew.cmu.edu" }), 0, "user2@andrew.cmu.edu", "matched"), 1, "user2@andrew.cmu.edu", "request_sent");
    const matchTrip = makeTrip({ user_email: "user2@andrew.cmu.edu" });
    const { route } = createHarness({ trips: [trip, matchTrip] });
    const { response, json } = await post(route, {
      action: "request",
      tripId: trip.id,
      matchedTripId: matchTrip.id
    });
    expect(response.status).toBe(409);
    expect(json.error).toBe("Trip has duplicate match entries");
  });

  it("concurrent duplicate requests remain single-entry", async () => {
    const trip = makeTrip({ id: "trip-a", user_email: "user1@andrew.cmu.edu" });
    const matchTrip = makeTrip({ id: "trip-b", user_email: "user2@andrew.cmu.edu" });
    const { repo, route } = createHarness({
      trips: [trip, matchTrip],
      updateDelayMs: 10
    });

    await Promise.all([
      post(route, { action: "request", tripId: trip.id, matchedTripId: matchTrip.id }),
      post(route, { action: "request", tripId: trip.id, matchedTripId: matchTrip.id })
    ]);

    const sourceMatches = matchEmailFields.filter((field) => repo.readTrip(trip.id)[field] === matchTrip.user_email);
    const targetMatches = matchEmailFields.filter((field) => repo.readTrip(matchTrip.id)[field] === trip.user_email);
    expect(sourceMatches).toHaveLength(1);
    expect(targetMatches).toHaveLength(1);
  });

  it("request racing withdraw converges to empty state", async () => {
    const [trip, matchTrip] = pairTrips(
      makeTrip({ id: "trip-a", user_email: "user1@andrew.cmu.edu" }),
      makeTrip({ id: "trip-b", user_email: "user2@andrew.cmu.edu" }),
      "request_sent",
      "request_received"
    );
    const { repo, route } = createHarness({
      trips: [trip, matchTrip],
      updateDelayMs: 10
    });

    await Promise.all([
      post(route, { action: "request", tripId: trip.id, matchedTripId: matchTrip.id }),
      post(route, { action: "withdraw", tripId: trip.id, matchedTripId: matchTrip.id })
    ]);

    expect(repo.readTrip(trip.id).match_email_0).toBe(null);
    expect(repo.readTrip(matchTrip.id).match_email_0).toBe(null);
  });
});
