import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  allowsSex,
  applyTripUpdates,
  assertTripIntegrity,
  buildSlotPatch,
  clearSlotPatch,
  findDuplicateMatchEmails,
  getEmptySlot,
  getMatchEntries,
  getMatchedPartners,
  getOccupiedMatchCount,
  getSlotForEmail,
  getSlotsForEmail,
  hasStatusWithEmail,
  mergeUpdatesById,
  windowsOverlap
} from "../../lib/backend/match-utils";
import { makeTrip, pairTrips, setMatch } from "../helpers/backend-fixtures";

describe("match-utils", () => {
  it.each([
    ["slot 0", setMatch(makeTrip(), 0, "a@cmu.edu", "request_sent"), "a@cmu.edu", 0],
    ["slot 5", setMatch(makeTrip(), 5, "z@cmu.edu", "matched"), "z@cmu.edu", 5],
    ["missing", makeTrip(), "missing@cmu.edu", -1]
  ])("getSlotForEmail: %s", (_label, trip, email, expected) => {
    expect(getSlotForEmail(trip, email)).toBe(expected);
  });

  it.each([
    ["none", makeTrip(), "x@cmu.edu", []],
    [
      "duplicate",
      setMatch(setMatch(makeTrip(), 0, "x@cmu.edu", "matched"), 4, "x@cmu.edu", "matched"),
      "x@cmu.edu",
      [0, 4]
    ],
    [
      "single",
      setMatch(makeTrip(), 2, "x@cmu.edu", "matched"),
      "x@cmu.edu",
      [2]
    ]
  ])("getSlotsForEmail: %s", (_label, trip, email, expected) => {
    expect(getSlotsForEmail(trip, email)).toEqual(expected);
  });

  it.each([
    ["first slot", makeTrip(), 0],
    ["skip occupied", setMatch(makeTrip(), 0, "x@cmu.edu", "matched"), 1],
    [
      "full",
      Array.from({ length: 6 }).reduce((trip, _value, slot) => {
        return setMatch(trip, slot, `user${slot}@cmu.edu`, "matched");
      }, makeTrip()),
      -1
    ]
  ])("getEmptySlot: %s", (_label, trip, expected) => {
    expect(getEmptySlot(trip)).toBe(expected);
  });

  it("getMatchEntries preserves slot order", () => {
    const trip = setMatch(setMatch(makeTrip(), 1, "one@cmu.edu", "matched"), 3, "two@cmu.edu", "request_sent");
    expect(getMatchEntries(trip)).toEqual([
      { slot: 0, email: null, status: null },
      { slot: 1, email: "one@cmu.edu", status: "matched" },
      { slot: 2, email: null, status: null },
      { slot: 3, email: "two@cmu.edu", status: "request_sent" },
      { slot: 4, email: null, status: null },
      { slot: 5, email: null, status: null }
    ]);
  });

  it.each([
    [
      "matched only",
      setMatch(
        setMatch(setMatch(makeTrip(), 0, "one@cmu.edu", "matched"), 1, "two@cmu.edu", "request_sent"),
        2,
        "three@cmu.edu",
        "partner_approval_needed"
      ),
      ["one@cmu.edu"]
    ],
    [
      "multiple matched",
      setMatch(setMatch(makeTrip(), 0, "one@cmu.edu", "matched"), 3, "two@cmu.edu", "matched"),
      ["one@cmu.edu", "two@cmu.edu"]
    ],
    ["none", makeTrip(), []]
  ])("getMatchedPartners: %s", (_label, trip, expected) => {
    expect(getMatchedPartners(trip)).toEqual(expected);
  });

  it.each([
    ["true", setMatch(makeTrip(), 0, "one@cmu.edu", "matched"), "one@cmu.edu", "matched", true],
    ["missing", makeTrip(), "one@cmu.edu", "matched", false],
    [
      "wrong status",
      setMatch(makeTrip(), 0, "one@cmu.edu", "request_sent"),
      "one@cmu.edu",
      "matched",
      false
    ]
  ])("hasStatusWithEmail: %s", (_label, trip, email, status, expected) => {
    expect(hasStatusWithEmail(trip, email, status)).toBe(expected);
  });

  it.each([
    ["Any", "Male", true],
    ["Any", "Female", true],
    ["Male only", "Male", true],
    ["Male only", "Female", false],
    ["Male only", "Non-binary", false],
    ["Female only", "Female", true],
    ["Female only", "Male", false],
    ["Non-binary only", "Non-binary", true],
    ["Non-binary only", "Female", false],
    ["Unknown", "Male", false],
    [null, "Female", true],
    [undefined, "Female", true]
  ])("allowsSex(%s, %s)", (allowed, partnerSex, expected) => {
    expect(allowsSex(allowed, partnerSex)).toBe(expected);
  });

  it.each([
    ["exact", "2026-03-11T12:00:00.000Z", "2026-03-11T14:00:00.000Z", "2026-03-11T12:00:00.000Z", "2026-03-11T14:00:00.000Z", true],
    ["overlap", "2026-03-11T12:00:00.000Z", "2026-03-11T14:00:00.000Z", "2026-03-11T13:00:00.000Z", "2026-03-11T15:00:00.000Z", true],
    ["touch boundary", "2026-03-11T12:00:00.000Z", "2026-03-11T14:00:00.000Z", "2026-03-11T14:00:00.000Z", "2026-03-11T15:00:00.000Z", true],
    ["before", "2026-03-11T12:00:00.000Z", "2026-03-11T13:59:59.000Z", "2026-03-11T14:00:00.000Z", "2026-03-11T15:00:00.000Z", false],
    ["after", "2026-03-11T14:00:01.000Z", "2026-03-11T16:00:00.000Z", "2026-03-11T12:00:00.000Z", "2026-03-11T14:00:00.000Z", false],
    ["missing", null, "2026-03-11T14:00:00.000Z", "2026-03-11T12:00:00.000Z", "2026-03-11T14:00:00.000Z", false],
    ["invalid", "not-a-date", "2026-03-11T14:00:00.000Z", "2026-03-11T12:00:00.000Z", "2026-03-11T14:00:00.000Z", false],
    ["timezone", "2026-03-11T09:00:00-03:00", "2026-03-11T10:00:00-03:00", "2026-03-11T12:30:00Z", "2026-03-11T13:30:00Z", true]
  ])("windowsOverlap: %s", (_label, aStart, aEnd, bStart, bEnd, expected) => {
    expect(windowsOverlap(aStart, aEnd, bStart, bEnd)).toBe(expected);
  });

  it("buildSlotPatch and clearSlotPatch target the expected fields", () => {
    expect(buildSlotPatch(2, "x@cmu.edu", "request_sent")).toEqual({
      match_email_2: "x@cmu.edu",
      match_status_2: "request_sent"
    });
    expect(clearSlotPatch(2)).toEqual({
      match_email_2: null,
      match_status_2: null
    });
  });

  it("applyTripUpdates produces a predicted trip state", () => {
    const trip = makeTrip();
    expect(applyTripUpdates(trip, buildSlotPatch(1, "x@cmu.edu", "matched")).match_email_1).toBe("x@cmu.edu");
  });

  it("findDuplicateMatchEmails reports duplicates", () => {
    const trip = setMatch(setMatch(makeTrip(), 0, "dup@cmu.edu", "matched"), 2, "dup@cmu.edu", "matched");
    expect(findDuplicateMatchEmails(trip)).toEqual(["dup@cmu.edu"]);
  });

  it("assertTripIntegrity rejects missing owners", () => {
    expect(() => assertTripIntegrity({ id: "trip-1", user_email: null }, "Trip")).toThrow("Trip is missing user_email");
  });

  it("assertTripIntegrity rejects duplicate entries", () => {
    const trip = setMatch(setMatch(makeTrip(), 0, "dup@cmu.edu", "matched"), 1, "dup@cmu.edu", "matched");
    expect(() => assertTripIntegrity(trip, "Trip")).toThrow("Trip has duplicate match entries");
  });

  it("getOccupiedMatchCount returns occupied slot count", () => {
    const trip = setMatch(setMatch(makeTrip(), 0, "one@cmu.edu", "matched"), 5, "two@cmu.edu", "request_sent");
    expect(getOccupiedMatchCount(trip)).toBe(2);
  });

  it("mergeUpdatesById combines patches by trip id", () => {
    expect(
      mergeUpdatesById([
        { id: "a", updates: { match_status_0: "matched" } },
        { id: "a", updates: { match_email_0: "x@cmu.edu" } },
        { id: "b", updates: { trip_status: "Matched and satisfied" } }
      ])
    ).toEqual([
      { id: "a", updates: { match_status_0: "matched", match_email_0: "x@cmu.edu" } },
      { id: "b", updates: { trip_status: "Matched and satisfied" } }
    ]);
  });

  it("pairTrips helper forms reciprocal relationships", () => {
    const [trip, matchTrip] = pairTrips(makeTrip(), makeTrip(), "request_sent", "request_received");
    expect(getSlotForEmail(trip, matchTrip.user_email)).toBe(0);
    expect(getSlotForEmail(matchTrip, trip.user_email)).toBe(0);
  });

  it("windowsOverlap is symmetric for generated inputs", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (aStart, aLength, bStart, bLength) => {
          const first = windowsOverlap(
            new Date(aStart).toISOString(),
            new Date(aStart + aLength).toISOString(),
            new Date(bStart).toISOString(),
            new Date(bStart + bLength).toISOString()
          );
          const second = windowsOverlap(
            new Date(bStart).toISOString(),
            new Date(bStart + bLength).toISOString(),
            new Date(aStart).toISOString(),
            new Date(aStart + aLength).toISOString()
          );
          expect(first).toBe(second);
        }
      )
    );
  });

  it("generated occupied slot counts never exceed six", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 0, maxLength: 6 }),
        (slots) => {
          const trip = slots.reduce((current, slot, index) => {
            return setMatch(current, slot, `user${index}@cmu.edu`, "matched");
          }, makeTrip());

          expect(getOccupiedMatchCount(trip)).toBeLessThanOrEqual(6);
        }
      )
    );
  });

  it("generated duplicate detection matches repeated emails", () => {
    fc.assert(
      fc.property(fc.emailAddress(), (email) => {
        const trip = setMatch(setMatch(makeTrip(), 0, email, "matched"), 4, email, "matched");
        expect(findDuplicateMatchEmails(trip)).toContain(email);
      })
    );
  });
});

