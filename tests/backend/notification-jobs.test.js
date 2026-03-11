import { beforeEach, describe, expect, it } from "vitest";

import {
  createNotificationJobsProcessGetRoute,
  createNotificationJobsProcessPostRoute
} from "../../lib/backend/trips-route";
import {
  enqueueTripNotificationJob,
  processNotificationJobs
} from "../../lib/backend/notification-jobs-service";
import { makeProfile, makeTrip, resetFixtureCounters } from "../helpers/backend-fixtures";
import { FakeBackendRepository } from "../helpers/fake-backend-repo";
import { createMockRequest, readJson } from "../helpers/request";

function createEmailClient({ fail = false } = {}) {
  return {
    emails: {
      sent: [],
      async send(payload) {
        this.sent.push(payload);
        if (fail) {
          return { error: { message: "temporary delivery outage" } };
        }
        return { error: null };
      }
    }
  };
}

function createFixture() {
  const trip = makeTrip({
    id: "trip-1",
    user_email: "owner@andrew.cmu.edu",
    baseline_match_check_at: "2026-03-11T09:00:00.000Z",
    created_at: "2026-03-11T08:00:00.000Z"
  });
  const candidate = makeTrip({
    id: "trip-2",
    user_email: "candidate@andrew.cmu.edu",
    created_at: "2026-03-11T09:30:00.000Z"
  });

  return {
    trip,
    candidate,
    repo: new FakeBackendRepository({
      trips: [trip, candidate],
      profiles: [
        makeProfile({ email: trip.user_email, sex: "Female", name: "Owner" }),
        makeProfile({ email: candidate.user_email, sex: "Male", name: "Candidate" })
      ]
    })
  };
}

describe("notification jobs", () => {
  beforeEach(() => {
    resetFixtureCounters();
  });

  it("dedupes enqueueing by job key", async () => {
    const { repo, trip } = createFixture();

    const first = await enqueueTripNotificationJob({
      repo,
      tripId: trip.id,
      now: () => "2026-03-11T10:00:00.000Z"
    });
    const second = await enqueueTripNotificationJob({
      repo,
      tripId: trip.id,
      now: () => "2026-03-11T10:01:00.000Z"
    });

    expect(first.enqueued).toBe(true);
    expect(second.enqueued).toBe(true);
    expect(repo.readNotificationJobs()).toHaveLength(1);
    expect(repo.readNotificationJobs()[0].job_key).toBe(`match_notifications:${trip.id}`);
  });

  it("marks jobs failed and reschedules them when delivery fails", async () => {
    const { repo, trip } = createFixture();
    await enqueueTripNotificationJob({
      repo,
      tripId: trip.id,
      now: () => "2026-03-11T10:00:00.000Z"
    });

    const result = await processNotificationJobs({
      repo,
      emailClient: createEmailClient({ fail: true }),
      resendFrom: "Test <test@example.com>",
      now: () => "2026-03-11T10:00:00.000Z"
    });

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);
    expect(repo.readNotificationJobs()[0].status).toBe("failed");
    expect(repo.readNotificationJobs()[0].available_at).toBe("2026-03-11T10:05:00.000Z");
    expect(repo.readNotifications()).toHaveLength(0);
  });

  it("retries failed jobs successfully and remains idempotent after send", async () => {
    const { repo, trip } = createFixture();
    await enqueueTripNotificationJob({
      repo,
      tripId: trip.id,
      now: () => "2026-03-11T10:00:00.000Z"
    });

    await processNotificationJobs({
      repo,
      emailClient: createEmailClient({ fail: true }),
      resendFrom: "Test <test@example.com>",
      now: () => "2026-03-11T10:00:00.000Z"
    });

    const successResult = await processNotificationJobs({
      repo,
      emailClient: createEmailClient(),
      resendFrom: "Test <test@example.com>",
      now: () => "2026-03-11T10:06:00.000Z"
    });

    expect(successResult.processed).toBe(1);
    expect(successResult.failed).toBe(0);
    expect(repo.readNotificationJobs()[0].status).toBe("sent");
    expect(repo.readNotificationJobs()[0].attempt_count).toBe(2);
    expect(repo.readNotifications()).toHaveLength(1);

    const idempotentResult = await processNotificationJobs({
      repo,
      emailClient: createEmailClient(),
      resendFrom: "Test <test@example.com>",
      now: () => "2026-03-11T10:20:00.000Z"
    });

    expect(idempotentResult.processed).toBe(0);
    expect(idempotentResult.failed).toBe(0);
    expect(repo.readNotifications()).toHaveLength(1);
  });

  it("exposes a retryable processing route", async () => {
    const { repo, trip } = createFixture();
    await enqueueTripNotificationJob({
      repo,
      tripId: trip.id,
      now: () => "2026-03-11T10:00:00.000Z"
    });

    const route = createNotificationJobsProcessPostRoute({
      createRepository: () => repo,
      createEmailClient: () => createEmailClient(),
      getFromAddress: () => "Test <test@example.com>",
      authorize: () => {}
    });

    const response = await route(createMockRequest({ body: { limit: 5 }, headers: {} }));
    const json = await readJson(response);

    expect(response.status).toBe(200);
    expect(json.processed).toBe(1);
    expect(repo.readNotificationJobs()[0].status).toBe("sent");
  });

  it("supports a GET-based cron trigger with bearer auth", async () => {
    const { repo, trip } = createFixture();
    await enqueueTripNotificationJob({
      repo,
      tripId: trip.id,
      now: () => "2026-03-11T10:00:00.000Z"
    });

    const route = createNotificationJobsProcessGetRoute({
      createRepository: () => repo,
      createEmailClient: () => createEmailClient(),
      getFromAddress: () => "Test <test@example.com>",
      authorize: () => {}
    });

    const response = await route(
      createMockRequest({
        body: {},
        headers: { authorization: "Bearer cron-secret" },
        url: "https://example.com/api/notification-jobs/process?limit=12"
      })
    );
    const json = await readJson(response);

    expect(response.status).toBe(200);
    expect(json.processed).toBe(1);
    expect(repo.readNotificationJobs()[0].status).toBe("sent");
  });
});
