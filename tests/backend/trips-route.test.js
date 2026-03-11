import { beforeEach, describe, expect, it } from "vitest";

import {
  createTripDeleteRoute,
  createTripPatchRoute,
  createTripsPostRoute
} from "../../lib/backend/trips-route";
import { makeProfile, makeTrip, pairTrips, resetFixtureCounters } from "../helpers/backend-fixtures";
import { FakeBackendRepository } from "../helpers/fake-backend-repo";
import { createMockRequest, readJson } from "../helpers/request";

const validToken = "valid";

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
  notificationJobs = [],
  authUsersByToken = null,
  createRepository = null,
  emailClient = null
} = {}) {
  const repo = createRepository
    ? null
    : new FakeBackendRepository({
        trips,
        profiles,
        notifications,
        notificationJobs,
        authUsersByToken: authUsersByToken || {
          [validToken]: {
            email: trips[0]?.user_email || "owner@andrew.cmu.edu"
          }
        }
      });
  const client = emailClient || createEmailClient();
  const options = {
    createRepository: createRepository || (() => repo),
    createEmailClient: () => client,
    getFromAddress: () => "Test <test@example.com>"
  };

  return {
    repo,
    client,
    postRoute: createTripsPostRoute(options),
    patchRoute: createTripPatchRoute(options),
    deleteRoute: createTripDeleteRoute(options)
  };
}

async function invoke(route, body, { headers = { authorization: `Bearer ${validToken}` }, context } = {}) {
  const response = await route(createMockRequest({ body, headers }), context);
  return {
    response,
    json: await readJson(response)
  };
}

describe("trip routes", () => {
  beforeEach(() => {
    resetFixtureCounters();
  });

  it("creates a trip through the backend and processes notification work", async () => {
    const ownerEmail = "owner@andrew.cmu.edu";
    const { repo, postRoute } = createHarness({
      profiles: [makeProfile({ email: ownerEmail, sex: "Female" })],
      authUsersByToken: { [validToken]: { email: ownerEmail } }
    });

    const { response, json } = await invoke(postRoute, {
      user_email: "spoofed@example.com",
      direction: "Arriving to Pittsburgh",
      flight_date: "2026-03-11",
      flight_time: "13:00",
      allowed_partner_sex: "Any",
      willing_to_wait_until_time: "14:30"
    });

    expect(response.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.tripId).toBeTruthy();
    expect(repo.readTrip(json.tripId).user_email).toBe(ownerEmail);
    expect(repo.readNotificationJobs()[0].status).toBe("sent");
  });

  it("stores the authenticated user rather than trusting the body email", async () => {
    const ownerEmail = "owner@andrew.cmu.edu";
    const { repo, postRoute } = createHarness({
      profiles: [makeProfile({ email: ownerEmail, sex: "Female" })],
      authUsersByToken: { [validToken]: { email: ownerEmail } }
    });

    const { json } = await invoke(postRoute, {
      user_email: "spoofed@example.com",
      direction: "Arriving to Pittsburgh",
      flight_date: "2026-03-11",
      flight_time: "13:00",
      allowed_partner_sex: "Any",
      willing_to_wait_until_time: "14:30"
    });

    expect(repo.readTrip(json.tripId).user_email).toBe(ownerEmail);
    expect(repo.readNotificationJobs()).toHaveLength(1);
    expect(repo.readNotificationJobs()[0].status).toBe("sent");
  });

  it("rejects duplicate trips for the same direction and date", async () => {
    const existingTrip = makeTrip({
      id: "trip-1",
      user_email: "owner@andrew.cmu.edu",
      direction: "Arriving to Pittsburgh",
      flight_date: "2026-03-11"
    });
    const { postRoute } = createHarness({
      trips: [existingTrip],
      profiles: [makeProfile({ email: existingTrip.user_email, sex: "Female" })]
    });

    const { response, json } = await invoke(postRoute, {
      direction: existingTrip.direction,
      flight_date: existingTrip.flight_date,
      flight_time: "15:00",
      allowed_partner_sex: "Any",
      willing_to_wait_until_time: "16:00"
    });

    expect(response.status).toBe(409);
    expect(json.error).toContain("You already have a trip");
  });

  it("updates trip details through the backend route", async () => {
    const trip = makeTrip({
      id: "trip-1",
      user_email: "owner@andrew.cmu.edu",
      direction: "Departing Pittsburgh",
      min_hours_before: 2,
      max_hours_before: 4,
      flight_date: "2026-03-12",
      flight_time: "12:00"
    });
    const { repo, patchRoute } = createHarness({
      trips: [trip],
      profiles: [makeProfile({ email: trip.user_email, sex: "Female" })]
    });

    const { response, json } = await invoke(
      patchRoute,
      {
        direction: trip.direction,
        flight_date: trip.flight_date,
        flight_time: "13:15",
        allowed_partner_sex: "Female only",
        min_hours_before: 1,
        max_hours_before: 3
      },
      { context: { params: { tripId: trip.id } } }
    );

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(repo.readTrip(trip.id).flight_time).toBe("13:15");
    expect(repo.readTrip(trip.id).allowed_partner_sex).toBe("Female only");
    expect(repo.readNotificationJobs()).toHaveLength(1);
  });

  it("routes status updates through the backend sync path", async () => {
    const [trip, partner] = pairTrips(
      makeTrip({ id: "trip-1", user_email: "owner@andrew.cmu.edu" }),
      makeTrip({ id: "trip-2", user_email: "partner@andrew.cmu.edu" }),
      "matched",
      "matched"
    );
    const { repo, patchRoute } = createHarness({ trips: [trip, partner] });

    const { response, json } = await invoke(
      patchRoute,
      { trip_status: "Matched and satisfied" },
      { context: { params: { tripId: trip.id } } }
    );

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(repo.readTrip(trip.id).trip_status).toBe("Matched and satisfied");
    expect(repo.readTrip(partner.id).trip_status).toBe("Matched and satisfied");
  });

  it("deletes a trip through the backend and clears reciprocal references", async () => {
    const [trip, partner] = pairTrips(
      makeTrip({ id: "trip-1", user_email: "owner@andrew.cmu.edu" }),
      makeTrip({ id: "trip-2", user_email: "partner@andrew.cmu.edu" }),
      "matched",
      "matched"
    );
    const { repo, deleteRoute } = createHarness({ trips: [trip, partner] });

    const { response, json } = await invoke(deleteRoute, {}, {
      context: { params: { tripId: trip.id } }
    });

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(repo.readTrip(trip.id)).toBeUndefined();
    expect(repo.readTrip(partner.id).match_email_0).toBe(null);
    expect(repo.readTrip(partner.id).match_status_0).toBe(null);
  });

  it("rejects unauthenticated trip writes", async () => {
    const { postRoute } = createHarness();
    const { response, json } = await invoke(
      postRoute,
      {
        direction: "Arriving to Pittsburgh",
        flight_date: "2026-03-11",
        flight_time: "13:00",
        allowed_partner_sex: "Any",
        willing_to_wait_until_time: "14:30"
      },
      { headers: {} }
    );

    expect(response.status).toBe(401);
    expect(json.error).toBe("Missing auth token");
  });
});
