import { describe, expect, it } from "vitest";

import { executeMatchRequest } from "../../lib/backend/match-requests-service";
import { executeMatchNotifications } from "../../lib/backend/match-notifications-service";
import { executeTripStatusSync } from "../../lib/backend/trip-status-sync-service";
import { allowsSex, windowsOverlap } from "../../lib/backend/match-utils";
import { makeProfile, makeTrip, pairTrips, setMatch } from "../helpers/backend-fixtures";
import { FakeBackendRepository } from "../helpers/fake-backend-repo";

function buildFilledTrip(overrides = {}, count = 6) {
  return Array.from({ length: count }).reduce((trip, _value, slot) => {
    return setMatch(trip, slot, `filled${slot}@andrew.cmu.edu`, "matched");
  }, makeTrip(overrides));
}

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

describe("additional backend matrix coverage", () => {
  it.each([
    ["Any", "Male", true],
    ["Any", "Female", true],
    ["Any", "Non-binary", true],
    ["Any", null, true],
    ["Male only", "Male", true],
    ["Male only", "Female", false],
    ["Male only", "Non-binary", false],
    ["Male only", null, false],
    ["Female only", "Female", true],
    ["Female only", "Male", false],
    ["Female only", "Non-binary", false],
    ["Female only", null, false],
    ["Non-binary only", "Non-binary", true],
    ["Non-binary only", "Male", false],
    ["Non-binary only", "Female", false],
    ["Non-binary only", null, false],
    [null, "Male", true],
    [null, "Female", true],
    [undefined, "Non-binary", true],
    ["Unexpected", "Male", false],
    ["Unexpected", "Female", false],
    ["Unexpected", "Non-binary", false],
    ["Any", "Unexpected", true],
    ["Male only", "Unexpected", false]
  ])("allowsSex matrix %#", (allowed, partnerSex, expected) => {
    expect(allowsSex(allowed, partnerSex)).toBe(expected);
  });

  it.each([
    ["exact", "2026-03-11T12:00:00.000Z", "2026-03-11T13:00:00.000Z", "2026-03-11T12:00:00.000Z", "2026-03-11T13:00:00.000Z", true],
    ["contained", "2026-03-11T12:00:00.000Z", "2026-03-11T14:00:00.000Z", "2026-03-11T12:30:00.000Z", "2026-03-11T13:30:00.000Z", true],
    ["reverse contained", "2026-03-11T12:30:00.000Z", "2026-03-11T13:30:00.000Z", "2026-03-11T12:00:00.000Z", "2026-03-11T14:00:00.000Z", true],
    ["touch left", "2026-03-11T13:00:00.000Z", "2026-03-11T14:00:00.000Z", "2026-03-11T12:00:00.000Z", "2026-03-11T13:00:00.000Z", true],
    ["touch right", "2026-03-11T12:00:00.000Z", "2026-03-11T13:00:00.000Z", "2026-03-11T13:00:00.000Z", "2026-03-11T14:00:00.000Z", true],
    ["gap one minute", "2026-03-11T12:00:00.000Z", "2026-03-11T12:59:00.000Z", "2026-03-11T13:00:00.000Z", "2026-03-11T14:00:00.000Z", false],
    ["gap reverse", "2026-03-11T13:01:00.000Z", "2026-03-11T14:00:00.000Z", "2026-03-11T12:00:00.000Z", "2026-03-11T13:00:00.000Z", false],
    ["timezone overlap", "2026-03-11T09:00:00-04:00", "2026-03-11T10:00:00-04:00", "2026-03-11T13:30:00Z", "2026-03-11T14:00:00Z", true],
    ["timezone no overlap", "2026-03-11T09:00:00-04:00", "2026-03-11T10:00:00-04:00", "2026-03-11T14:01:00Z", "2026-03-11T14:30:00Z", false],
    ["missing start", null, "2026-03-11T13:00:00.000Z", "2026-03-11T12:00:00.000Z", "2026-03-11T13:00:00.000Z", false],
    ["missing end", "2026-03-11T12:00:00.000Z", null, "2026-03-11T12:00:00.000Z", "2026-03-11T13:00:00.000Z", false],
    ["invalid a", "not-a-date", "2026-03-11T13:00:00.000Z", "2026-03-11T12:00:00.000Z", "2026-03-11T13:00:00.000Z", false],
    ["invalid b", "2026-03-11T12:00:00.000Z", "2026-03-11T13:00:00.000Z", "not-a-date", "2026-03-11T13:00:00.000Z", false],
    ["same instant", "2026-03-11T12:00:00.000Z", "2026-03-11T12:00:00.000Z", "2026-03-11T12:00:00.000Z", "2026-03-11T12:00:00.000Z", true],
    ["micro gap", "2026-03-11T12:00:00.000Z", "2026-03-11T12:00:00.000Z", "2026-03-11T12:00:00.001Z", "2026-03-11T12:00:01.000Z", false],
    ["long overlap", "2026-03-11T00:00:00.000Z", "2026-03-11T23:59:59.000Z", "2026-03-11T08:00:00.000Z", "2026-03-11T09:00:00.000Z", true]
  ])("windowsOverlap matrix %#", (_label, aStart, aEnd, bStart, bEnd, expected) => {
    expect(windowsOverlap(aStart, aEnd, bStart, bEnd)).toBe(expected);
  });

  it.each([
    ["request fresh", "request", () => [makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" })], "ok"],
    ["request existing request", "request", () => pairTrips(makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" }), "request_sent", "request_received"), "ok"],
    ["request existing matched", "request", () => pairTrips(makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" }), "matched", "matched"), "ok"],
    ["request existing pending", "request", () => pairTrips(makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" }), "partner_approval_needed", "partner_approval_needed"), "ok"],
    ["request source full", "request", () => [buildFilledTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" })], "No available match slots"],
    ["request target full", "request", () => [makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), buildFilledTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" })], "No available match slots"],
    ["request direction mismatch", "request", () => [makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu", direction: "Departing Pittsburgh" })], "Trips are not compatible for matching"],
    ["request date mismatch", "request", () => [makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu", flight_date: "2026-03-12" })], "Trips are not compatible for matching"],
    ["request same owner", "request", () => [makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), makeTrip({ id: "b", user_email: "owner@andrew.cmu.edu" })], "Trips are not compatible for matching"],
    ["withdraw request", "withdraw", () => pairTrips(makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" }), "request_sent", "request_received"), "ok"],
    ["withdraw matched", "withdraw", () => pairTrips(makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" }), "matched", "matched"), "ok"],
    ["withdraw missing source", "withdraw", () => [makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), setMatch(makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" }), 0, "owner@andrew.cmu.edu", "request_received")], "Match not found"],
    ["withdraw missing target", "withdraw", () => [setMatch(makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), 0, "candidate@andrew.cmu.edu", "request_sent"), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" })], "Match not found"],
    ["accept direct", "accept", () => pairTrips(makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" }), "request_received", "request_sent"), "ok"],
    ["accept outbound", "accept", () => pairTrips(makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" }), "request_sent", "request_received"), "Use withdraw instead of accept for an outbound request"],
    ["accept missing source", "accept", () => [makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" })], "Match not found"],
    ["accept missing target", "accept", () => [setMatch(makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), 0, "candidate@andrew.cmu.edu", "request_received"), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" })], "Match not found"],
    ["deny direct", "deny", () => pairTrips(makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" }), "request_received", "request_sent"), "ok"],
    ["deny outbound", "deny", () => pairTrips(makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" }), "request_sent", "request_received"), "Use withdraw instead of deny for an outbound request"],
    ["deny missing source", "deny", () => [makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" })], "Match not found"],
    ["deny missing target", "deny", () => [setMatch(makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), 0, "candidate@andrew.cmu.edu", "request_received"), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" })], "Match not found"],
    ["remove matched", "remove", () => pairTrips(makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" }), "matched", "matched"), "ok"],
    ["remove missing source", "remove", () => [makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), setMatch(makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" }), 0, "owner@andrew.cmu.edu", "matched")], "Match not found"],
    ["remove missing target", "remove", () => [setMatch(makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), 0, "candidate@andrew.cmu.edu", "matched"), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" })], "Match not found"],
    ["remove as target owner", "remove", () => pairTrips(makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" }), "matched", "matched"), "ok", "candidate@andrew.cmu.edu"],
    ["remove as outsider", "remove", () => pairTrips(makeTrip({ id: "a", user_email: "owner@andrew.cmu.edu" }), makeTrip({ id: "b", user_email: "candidate@andrew.cmu.edu" }), "matched", "matched"), "Not authorized", "outsider@andrew.cmu.edu"]
  ])("match request matrix %#", async (_label, action, setup, expected, requesterEmail = "owner@andrew.cmu.edu") => {
    const [trip, matchTrip] = setup();
    const repo = new FakeBackendRepository({ trips: [trip, matchTrip] });

    if (expected === "ok") {
      const result = await executeMatchRequest({
        repo,
        requesterEmail,
        action,
        tripId: trip.id,
        matchedTripId: matchTrip.id
      });
      expect(result.ok).toBe(true);
      return;
    }

    await expect(
      executeMatchRequest({
        repo,
        requesterEmail,
        action,
        tripId: trip.id,
        matchedTripId: matchTrip.id
      })
    ).rejects.toThrow(expected);
  });

  it.each([
    ["no partners unmatched", 0, "Unmatched (looking for matches)", 1],
    ["no partners looking", 0, "Matched and still looking", 1],
    ["no partners satisfied", 0, "Matched and satisfied", 1],
    ["one partner unmatched", 1, "Unmatched (looking for matches)", 2],
    ["one partner looking", 1, "Matched and still looking", 2],
    ["one partner satisfied", 1, "Matched and satisfied", 2],
    ["two partners unmatched", 2, "Unmatched (looking for matches)", 3],
    ["two partners looking", 2, "Matched and still looking", 3],
    ["two partners satisfied", 2, "Matched and satisfied", 3],
    ["three partners unmatched", 3, "Unmatched (looking for matches)", 4],
    ["three partners looking", 3, "Matched and still looking", 4],
    ["three partners satisfied", 3, "Matched and satisfied", 4]
  ])("trip-status sync matrix %#", async (_label, partnerCount, tripStatus, expectedUpdated) => {
    const source = makeTrip({ id: "source", user_email: "owner@andrew.cmu.edu" });
    const partners = Array.from({ length: partnerCount }, (_, index) => {
      return setMatch(
        makeTrip({ id: `partner-${index}`, user_email: `partner-${index}@andrew.cmu.edu` }),
        0,
        source.user_email,
        "matched"
      );
    });
    const sourceWithPartners = partners.reduce((trip, partner, index) => {
      return setMatch(trip, index, partner.user_email, "matched");
    }, source);
    const repo = new FakeBackendRepository({ trips: [sourceWithPartners, ...partners] });

    const result = await executeTripStatusSync({
      repo,
      requesterEmail: source.user_email,
      tripId: source.id,
      tripStatus
    });

    expect(result.updated).toBe(expectedUpdated);
  });

  it.each([
    ["invalid status", "Invalid trip_status", "Not a status", "owner@andrew.cmu.edu"],
    ["missing trip", "Trip not found", "Matched and satisfied", "owner@andrew.cmu.edu"],
    ["unauthorized", "Not authorized", "Matched and satisfied", "outsider@andrew.cmu.edu"]
  ])("trip-status sync guards %#", async (_label, expectedError, tripStatus, requesterEmail) => {
    const source = makeTrip({ id: "source", user_email: "owner@andrew.cmu.edu" });
    const repo = new FakeBackendRepository({ trips: expectedError === "Trip not found" ? [] : [source] });
    await expect(
      executeTripStatusSync({
        repo,
        requesterEmail,
        tripId: source.id,
        tripStatus
      })
    ).rejects.toThrow(expectedError);
  });

  it.each([
    ["Any", "Female", "Any", "Male", true],
    ["Any", "Female", "Male only", "Male", false],
    ["Any", "Female", "Female only", "Male", true],
    ["Male only", "Male", "Any", "Female", false],
    ["Male only", "Female", "Any", "Male", true],
    ["Female only", "Female", "Any", "Male", false],
    ["Female only", "Male", "Any", "Female", true],
    ["Non-binary only", "Non-binary", "Any", "Female", false],
    ["Non-binary only", "Female", "Any", "Male", false],
    ["Any", "Female", "Non-binary only", "Non-binary", false],
    ["Any", "Female", "Non-binary only", "Male", false],
    ["Any", "Female", "Any", null, false],
    [null, "Female", "Any", "Male", true],
    ["Any", "Male", null, "Female", true],
    ["Any", "Female", "Unexpected", "Male", false],
    ["Unexpected", "Female", "Any", "Male", false],
    ["Male only", "Male", "Male only", "Male", true],
    ["Female only", "Female", "Female only", "Female", true],
    ["Non-binary only", "Non-binary", "Non-binary only", "Non-binary", true],
    ["Male only", "Male", "Female only", "Female", false]
  ])("notification compatibility matrix %#", async (
    ownerPreference,
    ownerSex,
    candidatePreference,
    candidateSex,
    shouldNotify
  ) => {
    const trip = makeTrip({
      id: "trip-1",
      user_email: "owner@andrew.cmu.edu",
      allowed_partner_sex: ownerPreference,
      baseline_match_check_at: "2026-03-11T08:00:00.000Z"
    });
    const candidate = makeTrip({
      id: "trip-2",
      user_email: "candidate@andrew.cmu.edu",
      allowed_partner_sex: candidatePreference,
      created_at: "2026-03-11T09:00:00.000Z"
    });
    const repo = new FakeBackendRepository({
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
      now: () => "2026-03-11T10:00:00.000Z"
    });

    expect(result.summary.compatibleTrips).toBe(shouldNotify ? 1 : 0);
  });

  it.each([
    ["candidate after baseline", "2026-03-11T08:00:00.000Z", "2026-03-11T09:00:00.000Z", null, "2026-03-10T07:00:00.000Z", 1],
    ["candidate before baseline", "2026-03-11T10:00:00.000Z", "2026-03-11T09:00:00.000Z", null, "2026-03-10T07:00:00.000Z", 0],
    ["reverse notify", "2026-03-11T08:00:00.000Z", "2026-03-11T07:00:00.000Z", "2026-03-11T06:00:00.000Z", "2026-03-11T09:00:00.000Z", 1],
    ["existing forward dedupe", "2026-03-11T08:00:00.000Z", "2026-03-11T09:00:00.000Z", null, "2026-03-10T07:00:00.000Z", 0, [{ trip_id: "trip-1", matched_trip_id: "trip-2", notified_at: "2026-03-11T09:10:00.000Z" }]],
    ["existing reverse dedupe", "2026-03-11T08:00:00.000Z", "2026-03-11T07:00:00.000Z", "2026-03-11T06:00:00.000Z", "2026-03-11T09:00:00.000Z", 0, [{ trip_id: "trip-2", matched_trip_id: "trip-1", notified_at: "2026-03-11T09:10:00.000Z" }]]
  ])("notification timing matrix %#", async (
    _label,
    baseline,
    candidateCreatedAt,
    candidateBaseline,
    tripCreatedAt,
    minimumNotified,
    notifications = []
  ) => {
    const trip = makeTrip({
      id: "trip-1",
      user_email: "owner@andrew.cmu.edu",
      baseline_match_check_at: baseline,
      created_at: tripCreatedAt
    });
    const candidate = makeTrip({
      id: "trip-2",
      user_email: "candidate@andrew.cmu.edu",
      baseline_match_check_at: candidateBaseline,
      created_at: candidateCreatedAt
    });
    const repo = new FakeBackendRepository({
      trips: [trip, candidate],
      profiles: [
        makeProfile({ email: trip.user_email, sex: "Female" }),
        makeProfile({ email: candidate.user_email, sex: "Male" })
      ],
      notifications
    });

    const result = await executeMatchNotifications({
      repo,
      emailClient: createEmailClient(),
      resendFrom: "Test <test@example.com>",
      tripId: trip.id,
      now: () => "2026-03-11T10:00:00.000Z"
    });

    expect(result.notified).toBeGreaterThanOrEqual(minimumNotified);
  });

  it.each([
    ["existing relation on source", () => {
      const trip = setMatch(makeTrip({ id: "trip-1", user_email: "owner@andrew.cmu.edu", baseline_match_check_at: "2026-03-11T08:00:00.000Z" }), 0, "candidate@andrew.cmu.edu", "request_sent");
      const candidate = makeTrip({ id: "trip-2", user_email: "candidate@andrew.cmu.edu", created_at: "2026-03-11T09:00:00.000Z" });
      return [trip, candidate];
    }, 0],
    ["existing relation on candidate", () => {
      const trip = makeTrip({ id: "trip-1", user_email: "owner@andrew.cmu.edu", baseline_match_check_at: "2026-03-11T08:00:00.000Z" });
      const candidate = setMatch(makeTrip({ id: "trip-2", user_email: "candidate@andrew.cmu.edu", created_at: "2026-03-11T09:00:00.000Z" }), 0, "owner@andrew.cmu.edu", "request_received");
      return [trip, candidate];
    }, 0],
    ["duplicate candidate rows", () => {
      const trip = makeTrip({ id: "trip-1", user_email: "owner@andrew.cmu.edu", baseline_match_check_at: "2026-03-11T08:00:00.000Z" });
      const candidate = makeTrip({ id: "trip-2", user_email: "candidate@andrew.cmu.edu", created_at: "2026-03-11T09:00:00.000Z" });
      return [trip, candidate, { ...candidate }];
    }, 1],
    ["missing candidate sex", () => {
      const trip = makeTrip({ id: "trip-1", user_email: "owner@andrew.cmu.edu", baseline_match_check_at: "2026-03-11T08:00:00.000Z" });
      const candidate = makeTrip({ id: "trip-2", user_email: "candidate@andrew.cmu.edu", created_at: "2026-03-11T09:00:00.000Z" });
      return [trip, candidate];
    }, 0, [
      makeProfile({ email: "owner@andrew.cmu.edu", sex: "Female" }),
      makeProfile({ email: "candidate@andrew.cmu.edu", sex: null })
    ]],
    ["non-overlap candidate", () => {
      const trip = makeTrip({ id: "trip-1", user_email: "owner@andrew.cmu.edu", baseline_match_check_at: "2026-03-11T08:00:00.000Z" });
      const candidate = makeTrip({
        id: "trip-2",
        user_email: "candidate@andrew.cmu.edu",
        created_at: "2026-03-11T09:00:00.000Z",
        window_start: "2026-03-11T16:00:00.000Z",
        window_end: "2026-03-11T17:00:00.000Z"
      });
      return [trip, candidate];
    }, 0]
  ])("notification guard matrix %#", async (_label, tripFactory, expectedCompatibleTrips, customProfiles = null) => {
    const trips = tripFactory();
    const repo = new FakeBackendRepository({
      trips,
      profiles: customProfiles || [
        makeProfile({ email: "owner@andrew.cmu.edu", sex: "Female" }),
        makeProfile({ email: "candidate@andrew.cmu.edu", sex: "Male" })
      ]
    });

    const result = await executeMatchNotifications({
      repo,
      emailClient: createEmailClient(),
      resendFrom: "Test <test@example.com>",
      tripId: "trip-1",
      now: () => "2026-03-11T10:00:00.000Z"
    });

    expect(result.summary.compatibleTrips).toBe(expectedCompatibleTrips);
  });
});
