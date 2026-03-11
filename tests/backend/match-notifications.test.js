import { beforeEach, describe, expect, it } from "vitest";

import { createMatchNotificationsRoute } from "../../lib/backend/match-notifications-route";
import { executeMatchNotifications } from "../../lib/backend/match-notifications-service";
import { makeProfile, makeTrip, resetFixtureCounters, setMatch } from "../helpers/backend-fixtures";
import { FakeBackendRepository } from "../helpers/fake-backend-repo";
import { createMockRequest, readJson } from "../helpers/request";

function createEmailClient() {
  return {
    emails: {
      sent: [],
      async send(payload) {
        this.sent.push(payload);
        return { error: null };
      }
    }
  };
}

function createHarness({
  trips = [],
  profiles = [],
  notifications = [],
  createRepository = null,
  emailClient = null
} = {}) {
  const repo = createRepository
    ? null
    : new FakeBackendRepository({ trips, profiles, notifications });
  const client = emailClient || createEmailClient();
  const route = createMatchNotificationsRoute({
    createRepository: createRepository || (() => repo),
    createEmailClient: () => client,
    getFromAddress: () => "Test <test@example.com>"
  });

  return { repo, client, route };
}

async function post(route, body) {
  const response = await route(createMockRequest({ body, headers: {} }));
  return {
    response,
    json: await readJson(response)
  };
}

describe("match-notifications", () => {
  beforeEach(() => {
    resetFixtureCounters();
  });

  it.each([
    ["missing repo", () => null, 500, "Missing Supabase service role configuration"],
    ["invalid json", undefined, 400, "Invalid JSON payload", new SyntaxError("bad json")],
    ["array", undefined, 400, "Request body must be a JSON object", []],
    ["missing tripId", undefined, 400, "tripId is required", {}],
    ["blank tripId", undefined, 400, "tripId is required", { tripId: " " }]
  ])("%s", async (_label, customRepoFactory, expectedStatus, expectedError, body) => {
    const { route } = createHarness({
      createRepository: customRepoFactory || (() => new FakeBackendRepository())
    });
    const response = await route(createMockRequest({ body: body === undefined ? { tripId: "trip-1" } : body }));
    expect(response.status).toBe(expectedStatus);
    expect((await readJson(response)).error).toBe(expectedError);
  });

  it("returns 404 for missing trips", async () => {
    const { route } = createHarness({ trips: [] });
    const { response, json } = await post(route, { tripId: "missing" });
    expect(response.status).toBe(404);
    expect(json.error).toBe("Trip not found");
  });

  it("returns 400 when the owner profile lacks sex", async () => {
    const trip = makeTrip({ id: "trip-1", user_email: "owner@andrew.cmu.edu" });
    const { route } = createHarness({
      trips: [trip],
      profiles: [makeProfile({ email: trip.user_email, sex: null })]
    });
    const { response, json } = await post(route, { tripId: trip.id });
    expect(response.status).toBe(400);
    expect(json.error).toBe("Trip owner profile is missing sex.");
  });

  it("initializes baseline_match_check_at when absent", async () => {
    const trip = makeTrip({ id: "trip-1", user_email: "owner@andrew.cmu.edu", baseline_match_check_at: null });
    const { repo } = createHarness({
      trips: [trip],
      profiles: [makeProfile({ email: trip.user_email, sex: "Female" })]
    });

    const result = await executeMatchNotifications({
      repo,
      emailClient: createEmailClient(),
      resendFrom: "Test <test@example.com>",
      tripId: trip.id,
      now: () => "2026-03-11T08:00:00.000Z"
    });

    expect(result.summary.baselineMatchCheckAt).toBe("2026-03-11T08:00:00.000Z");
    expect(repo.readTrip(trip.id).baseline_match_check_at).toBe("2026-03-11T08:00:00.000Z");
  });

  it("continues when baseline update fails", async () => {
    const trip = makeTrip({ id: "trip-1", user_email: "owner@andrew.cmu.edu", baseline_match_check_at: null });
    const repo = new FakeBackendRepository({
      trips: [trip],
      profiles: [makeProfile({ email: trip.user_email, sex: "Female" })]
    });
    repo.enqueueFailure("updateTrip", "baseline write failed", ({ id }) => id === trip.id);

    const result = await executeMatchNotifications({
      repo,
      emailClient: createEmailClient(),
      resendFrom: "Test <test@example.com>",
      tripId: trip.id,
      now: () => "2026-03-11T08:00:00.000Z"
    });

    expect(result.summary.baselineMatchCheckAt).toBe("2026-03-11T08:00:00.000Z");
    expect(repo.readTrip(trip.id).baseline_match_check_at).toBe(null);
  });

  it.each([
    ["no overlap", { window_start: "2026-03-11T16:00:00.000Z", window_end: "2026-03-11T17:00:00.000Z" }, 0],
    ["touch boundary", { window_start: "2026-03-11T14:00:00.000Z", window_end: "2026-03-11T15:00:00.000Z" }, 1],
    ["same user", { user_email: "owner@andrew.cmu.edu" }, 0],
    ["different date", { flight_date: "2026-03-12" }, 0],
    ["different direction", { direction: "Departing Pittsburgh" }, 0]
  ])("compatibility filter: %s", async (_label, candidateOverrides, expectedCompatibleTrips) => {
    const trip = makeTrip({ id: "trip-1", user_email: "owner@andrew.cmu.edu" });
    const candidate = makeTrip({ id: "trip-2", user_email: "candidate@andrew.cmu.edu", created_at: "2026-03-10T12:30:00.000Z", ...candidateOverrides });
    const { repo } = createHarness({
      trips: [trip, candidate],
      profiles: [
        makeProfile({ email: trip.user_email, sex: "Female" }),
        makeProfile({ email: candidate.user_email, sex: "Male" })
      ]
    });

    const result = await executeMatchNotifications({
      repo,
      emailClient: createEmailClient(),
      resendFrom: "Test <test@example.com>",
      tripId: trip.id,
      now: () => "2026-03-11T08:00:00.000Z"
    });

    expect(result.summary.compatibleTrips).toBe(expectedCompatibleTrips);
  });

  it.each([
    ["owner allows any", "Any", "Male", true],
    ["owner rejects male", "Female only", "Male", false],
    ["candidate rejects owner", "Any", "Male", false, "Male only", "Female"],
    ["candidate missing sex", "Any", null, false]
  ])("sex compatibility: %s", async (_label, ownerPreference, candidateSex, shouldMatch, candidatePreference = "Any", ownerSex = "Female") => {
    const trip = makeTrip({ id: "trip-1", user_email: "owner@andrew.cmu.edu", allowed_partner_sex: ownerPreference });
    const candidate = makeTrip({
      id: "trip-2",
      user_email: "candidate@andrew.cmu.edu",
      allowed_partner_sex: candidatePreference,
      created_at: "2026-03-11T09:00:00.000Z"
    });
    const { repo } = createHarness({
      trips: [trip, candidate],
      profiles: [
        makeProfile({ email: trip.user_email, sex: ownerSex }),
        makeProfile({ email: candidate.user_email, sex: candidateSex })
      ]
    });

    const result = await executeMatchNotifications({
      repo,
      emailClient: createEmailClient(),
      resendFrom: "Test <test@example.com>",
      tripId: trip.id,
      now: () => "2026-03-11T08:00:00.000Z"
    });

    expect(result.summary.compatibleTrips).toBe(shouldMatch ? 1 : 0);
  });

  it("skips candidates already connected to the source trip", async () => {
    const trip = setMatch(makeTrip({ id: "trip-1", user_email: "owner@andrew.cmu.edu" }), 0, "candidate@andrew.cmu.edu", "request_sent");
    const candidate = setMatch(makeTrip({ id: "trip-2", user_email: "candidate@andrew.cmu.edu", created_at: "2026-03-11T09:00:00.000Z" }), 0, trip.user_email, "request_received");
    const { repo } = createHarness({
      trips: [trip, candidate],
      profiles: [
        makeProfile({ email: trip.user_email, sex: "Female" }),
        makeProfile({ email: candidate.user_email, sex: "Male" })
      ]
    });

    const result = await executeMatchNotifications({
      repo,
      emailClient: createEmailClient(),
      resendFrom: "Test <test@example.com>",
      tripId: trip.id,
      now: () => "2026-03-11T08:00:00.000Z"
    });

    expect(result.summary.compatibleTrips).toBe(0);
  });

  it("sends source notification for candidates created after baseline", async () => {
    const trip = makeTrip({
      id: "trip-1",
      user_email: "owner@andrew.cmu.edu",
      baseline_match_check_at: "2026-03-11T08:00:00.000Z",
      created_at: "2026-03-10T12:00:00.000Z"
    });
    const candidate = makeTrip({
      id: "trip-2",
      user_email: "candidate@andrew.cmu.edu",
      created_at: "2026-03-11T09:00:00.000Z"
    });
    const { repo, client } = createHarness({
      trips: [trip, candidate],
      profiles: [
        makeProfile({ email: trip.user_email, sex: "Female", name: "Owner" }),
        makeProfile({ email: candidate.user_email, sex: "Male", name: "Candidate" })
      ]
    });

    const result = await executeMatchNotifications({
      repo,
      emailClient: client,
      resendFrom: "Test <test@example.com>",
      tripId: trip.id,
      now: () => "2026-03-11T10:00:00.000Z"
    });

    expect(result.notified).toBe(1);
    expect(client.emails.sent).toHaveLength(1);
    expect(client.emails.sent[0].to).toBe(trip.user_email);
    expect(repo.readNotifications()).toHaveLength(1);
  });

  it("sends reverse notification when source is newer than candidate baseline", async () => {
    const trip = makeTrip({
      id: "trip-1",
      user_email: "owner@andrew.cmu.edu",
      baseline_match_check_at: "2026-03-11T08:00:00.000Z",
      created_at: "2026-03-11T09:30:00.000Z"
    });
    const candidate = makeTrip({
      id: "trip-2",
      user_email: "candidate@andrew.cmu.edu",
      baseline_match_check_at: "2026-03-11T09:00:00.000Z",
      created_at: "2026-03-11T08:00:00.000Z"
    });
    const { repo, client } = createHarness({
      trips: [trip, candidate],
      profiles: [
        makeProfile({ email: trip.user_email, sex: "Female", name: "Owner" }),
        makeProfile({ email: candidate.user_email, sex: "Male", name: "Candidate" })
      ]
    });

    const result = await executeMatchNotifications({
      repo,
      emailClient: client,
      resendFrom: "Test <test@example.com>",
      tripId: trip.id,
      now: () => "2026-03-11T10:00:00.000Z"
    });

    expect(result.notifications).toContainEqual({
      tripId: candidate.id,
      matchedTripId: trip.id
    });
    expect(client.emails.sent.at(-1).to).toBe(candidate.user_email);
  });

  it.each([
    ["forward dedupe", [{ trip_id: "trip-1", matched_trip_id: "trip-2", notified_at: "2026-03-11T09:00:00.000Z" }], 1],
    ["reverse dedupe", [{ trip_id: "trip-2", matched_trip_id: "trip-1", notified_at: "2026-03-11T09:00:00.000Z" }], 1]
  ])("notification dedupe: %s", async (_label, notifications, expectedCount) => {
    const trip = makeTrip({
      id: "trip-1",
      user_email: "owner@andrew.cmu.edu",
      baseline_match_check_at: "2026-03-11T08:00:00.000Z",
      created_at: "2026-03-11T09:30:00.000Z"
    });
    const candidate = makeTrip({
      id: "trip-2",
      user_email: "candidate@andrew.cmu.edu",
      baseline_match_check_at: "2026-03-11T09:00:00.000Z",
      created_at: "2026-03-11T09:15:00.000Z"
    });
    const { repo, client } = createHarness({
      trips: [trip, candidate],
      profiles: [
        makeProfile({ email: trip.user_email, sex: "Female" }),
        makeProfile({ email: candidate.user_email, sex: "Male" })
      ],
      notifications
    });

    const result = await executeMatchNotifications({
      repo,
      emailClient: client,
      resendFrom: "Test <test@example.com>",
      tripId: trip.id,
      now: () => "2026-03-11T10:00:00.000Z"
    });

    expect(result.notified).toBe(expectedCount);
  });

  it("missing resend client returns zero notifications and does not crash", async () => {
    const trip = makeTrip({
      id: "trip-1",
      user_email: "owner@andrew.cmu.edu",
      baseline_match_check_at: "2026-03-11T08:00:00.000Z"
    });
    const candidate = makeTrip({
      id: "trip-2",
      user_email: "candidate@andrew.cmu.edu",
      created_at: "2026-03-11T09:00:00.000Z"
    });
    const { repo } = createHarness({
      trips: [trip, candidate],
      profiles: [
        makeProfile({ email: trip.user_email, sex: "Female" }),
        makeProfile({ email: candidate.user_email, sex: "Male" })
      ]
    });

    const result = await executeMatchNotifications({
      repo,
      emailClient: null,
      resendFrom: "Test <test@example.com>",
      tripId: trip.id,
      now: () => "2026-03-11T10:00:00.000Z"
    });

    expect(result.notified).toBe(0);
    expect(repo.readNotifications()).toHaveLength(0);
  });

  it("provider send failures do not insert dedupe rows", async () => {
    const trip = makeTrip({
      id: "trip-1",
      user_email: "owner@andrew.cmu.edu",
      baseline_match_check_at: "2026-03-11T08:00:00.000Z"
    });
    const candidate = makeTrip({
      id: "trip-2",
      user_email: "candidate@andrew.cmu.edu",
      created_at: "2026-03-11T09:00:00.000Z"
    });
    const emailClient = {
      emails: {
        async send() {
          return { error: { message: "provider failure" } };
        }
      }
    };
    const { repo } = createHarness({
      trips: [trip, candidate],
      profiles: [
        makeProfile({ email: trip.user_email, sex: "Female" }),
        makeProfile({ email: candidate.user_email, sex: "Male" })
      ],
      emailClient
    });

    const result = await executeMatchNotifications({
      repo,
      emailClient,
      resendFrom: "Test <test@example.com>",
      tripId: trip.id,
      now: () => "2026-03-11T10:00:00.000Z"
    });

    expect(result.notified).toBe(0);
    expect(repo.readNotifications()).toHaveLength(0);
  });

  it("notification existence query failures are treated as safe skips", async () => {
    const trip = makeTrip({
      id: "trip-1",
      user_email: "owner@andrew.cmu.edu",
      baseline_match_check_at: "2026-03-11T08:00:00.000Z"
    });
    const candidate = makeTrip({
      id: "trip-2",
      user_email: "candidate@andrew.cmu.edu",
      created_at: "2026-03-11T09:00:00.000Z"
    });
    const { repo } = createHarness({
      trips: [trip, candidate],
      profiles: [
        makeProfile({ email: trip.user_email, sex: "Female" }),
        makeProfile({ email: candidate.user_email, sex: "Male" })
      ]
    });
    repo.enqueueFailure("getNotificationRecord", "dedupe read failed");

    const result = await executeMatchNotifications({
      repo,
      emailClient: createEmailClient(),
      resendFrom: "Test <test@example.com>",
      tripId: trip.id,
      now: () => "2026-03-11T10:00:00.000Z"
    });

    expect(result.notified).toBe(0);
  });

  it("duplicate candidate rows only notify once per pair", async () => {
    const trip = makeTrip({
      id: "trip-1",
      user_email: "owner@andrew.cmu.edu",
      baseline_match_check_at: "2026-03-11T08:00:00.000Z"
    });
    const candidate = makeTrip({
      id: "trip-2",
      user_email: "candidate@andrew.cmu.edu",
      created_at: "2026-03-11T09:00:00.000Z"
    });
    const repo = new FakeBackendRepository({
      trips: [trip, candidate, { ...candidate }],
      profiles: [
        makeProfile({ email: trip.user_email, sex: "Female" }),
        makeProfile({ email: candidate.user_email, sex: "Male" })
      ]
    });
    const client = createEmailClient();

    const result = await executeMatchNotifications({
      repo,
      emailClient: client,
      resendFrom: "Test <test@example.com>",
      tripId: trip.id,
      now: () => "2026-03-11T10:00:00.000Z"
    });

    expect(result.notifications.filter((item) => item.tripId === trip.id)).toHaveLength(1);
  });

  it("concurrent route calls do not duplicate sends", async () => {
    const trip = makeTrip({
      id: "trip-1",
      user_email: "owner@andrew.cmu.edu",
      baseline_match_check_at: "2026-03-11T08:00:00.000Z"
    });
    const candidate = makeTrip({
      id: "trip-2",
      user_email: "candidate@andrew.cmu.edu",
      created_at: "2026-03-11T09:00:00.000Z"
    });
    const { repo, client, route } = createHarness({
      trips: [trip, candidate],
      profiles: [
        makeProfile({ email: trip.user_email, sex: "Female" }),
        makeProfile({ email: candidate.user_email, sex: "Male" })
      ]
    });

    await Promise.all([
      post(route, { tripId: trip.id }),
      post(route, { tripId: trip.id })
    ]);

    expect(repo.readNotifications().filter((item) => item.trip_id === trip.id)).toHaveLength(1);
    expect(client.emails.sent.filter((item) => item.to === trip.user_email)).toHaveLength(1);
  });
});
