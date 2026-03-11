import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { executeMatchRequest } from "../../lib/backend/match-requests-service";
import { executeMatchNotifications } from "../../lib/backend/match-notifications-service";
import { executeTripStatusSync } from "../../lib/backend/trip-status-sync-service";
import { matchEmailFields } from "../../lib/backend/constants";
import { findDuplicateMatchEmails, getMatchedPartners, getSlotForEmail, hasStatusWithEmail } from "../../lib/backend/match-utils";
import { makeProfile, makeTrip, pairTrips, setMatch } from "../helpers/backend-fixtures";
import { FakeBackendRepository } from "../helpers/fake-backend-repo";

describe("generated backend invariants", () => {
  it("generated reciprocal request operations preserve reciprocity", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 5 }), async (slot) => {
        const trip = Array.from({ length: slot }).reduce((current, _value, index) => {
          return setMatch(current, index, `filled${index}@andrew.cmu.edu`, "matched");
        }, makeTrip({ id: "trip-a", user_email: "owner@andrew.cmu.edu" }));
        const matchTrip = Array.from({ length: slot }).reduce((current, _value, index) => {
          return setMatch(current, index, `other${index}@andrew.cmu.edu`, "matched");
        }, makeTrip({ id: "trip-b", user_email: "candidate@andrew.cmu.edu" }));
        const repo = new FakeBackendRepository({ trips: [trip, matchTrip] });

        await executeMatchRequest({
          repo,
          requesterEmail: trip.user_email,
          action: "request",
          tripId: trip.id,
          matchedTripId: matchTrip.id
        });

        const updatedTrip = repo.readTrip(trip.id);
        const updatedMatchTrip = repo.readTrip(matchTrip.id);
        expect(findDuplicateMatchEmails(updatedTrip)).toHaveLength(0);
        expect(findDuplicateMatchEmails(updatedMatchTrip)).toHaveLength(0);
        expect(hasStatusWithEmail(updatedTrip, updatedMatchTrip.user_email, "request_sent")).toBe(true);
        expect(hasStatusWithEmail(updatedMatchTrip, updatedTrip.user_email, "request_received")).toBe(true);
      })
    );
  });

  it("generated direct accept operations preserve matched reciprocity", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 5 }), async (slot) => {
        const [trip, matchTrip] = pairTrips(
          makeTrip({ id: "trip-a", user_email: "owner@andrew.cmu.edu" }),
          makeTrip({ id: "trip-b", user_email: "candidate@andrew.cmu.edu" }),
          "request_received",
          "request_sent",
          slot,
          slot
        );
        const repo = new FakeBackendRepository({ trips: [trip, matchTrip] });

        await executeMatchRequest({
          repo,
          requesterEmail: trip.user_email,
          action: "accept",
          tripId: trip.id,
          matchedTripId: matchTrip.id
        });

        const updatedTrip = repo.readTrip(trip.id);
        const updatedMatchTrip = repo.readTrip(matchTrip.id);
        expect(hasStatusWithEmail(updatedTrip, updatedMatchTrip.user_email, "matched")).toBe(true);
        expect(hasStatusWithEmail(updatedMatchTrip, updatedTrip.user_email, "matched")).toBe(true);
      })
    );
  });

  it("generated clear operations remove both sides of a relationship", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom("withdraw", "deny", "remove"), async (action) => {
        const baseStatus = action === "remove" ? "matched" : "request_received";
        const otherStatus = action === "remove" ? "matched" : "request_sent";
        const [trip, matchTrip] = pairTrips(
          makeTrip({ id: "trip-a", user_email: "owner@andrew.cmu.edu" }),
          makeTrip({ id: "trip-b", user_email: "candidate@andrew.cmu.edu" }),
          baseStatus,
          otherStatus
        );
        const repo = new FakeBackendRepository({ trips: [trip, matchTrip] });

        await executeMatchRequest({
          repo,
          requesterEmail: trip.user_email,
          action,
          tripId: trip.id,
          matchedTripId: matchTrip.id
        });

        expect(getSlotForEmail(repo.readTrip(trip.id), matchTrip.user_email)).toBe(-1);
        expect(getSlotForEmail(repo.readTrip(matchTrip.id), trip.user_email)).toBe(-1);
      })
    );
  });

  it("generated trip-status sync updates every reciprocal matched partner", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 3 }), async (partnerCount) => {
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
          tripStatus: "Matched and satisfied"
        });

        expect(result.updated).toBe(partnerCount + 1);
        partners.forEach((partner) => {
          expect(repo.readTrip(partner.id).trip_status).toBe("Matched and satisfied");
        });
      })
    );
  });

  it("generated notification runs never insert duplicate records for the same pair", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 3 }), async (candidateCount) => {
        const trip = makeTrip({
          id: "trip-1",
          user_email: "owner@andrew.cmu.edu",
          baseline_match_check_at: "2026-03-11T08:00:00.000Z"
        });
        const candidates = Array.from({ length: candidateCount }, (_, index) => {
          return makeTrip({
            id: `candidate-${index}`,
            user_email: `candidate-${index}@andrew.cmu.edu`,
            created_at: `2026-03-11T09:0${index}:00.000Z`
          });
        });
        const repo = new FakeBackendRepository({
          trips: [trip, ...candidates],
          profiles: [
            makeProfile({ email: trip.user_email, sex: "Female" }),
            ...candidates.map((candidate) => makeProfile({ email: candidate.user_email, sex: "Male" }))
          ]
        });
        const emailClient = {
          emails: {
            async send() {
              return { error: null };
            }
          }
        };

        await Promise.all([
          executeMatchNotifications({
            repo,
            emailClient,
            resendFrom: "Test <test@example.com>",
            tripId: trip.id,
            now: () => "2026-03-11T10:00:00.000Z"
          }),
          executeMatchNotifications({
            repo,
            emailClient,
            resendFrom: "Test <test@example.com>",
            tripId: trip.id,
            now: () => "2026-03-11T10:00:00.000Z"
          })
        ]);

        const notificationKeys = repo.readNotifications().map((item) => `${item.trip_id}:${item.matched_trip_id}`);
        expect(new Set(notificationKeys).size).toBe(notificationKeys.length);
      })
    );
  });

  it("generated matched partner lists stay within the slot count", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 6 }), async (count) => {
        const trip = Array.from({ length: count }).reduce((current, _value, index) => {
          return setMatch(current, index, `partner-${index}@andrew.cmu.edu`, "matched");
        }, makeTrip({ id: "source", user_email: "owner@andrew.cmu.edu" }));
        expect(getMatchedPartners(trip)).toHaveLength(count);
        expect(matchEmailFields.filter((field) => trip[field]).length).toBeLessThanOrEqual(6);
      })
    );
  });
});

