import { DEFAULT_RESEND_FROM } from "./constants";
import { executeMatchNotifications } from "./match-notifications-service";
import { HttpError } from "./errors";
import { requireNonEmptyString } from "./request";

const JOB_TYPE_MATCH_NOTIFICATIONS = "match_notifications";
const RETRY_DELAYS_MINUTES = [5, 15, 30, 60];

const isMissingRelationError = (error) => {
  const message = error?.message || "";
  return (
    message.includes("notification_jobs") ||
    message.includes("notification_outbox") ||
    message.includes("Could not find the table") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
};

function computeRetryAt(nowValue, attemptCount) {
  const base = new Date(nowValue);
  const delayMinutes =
    RETRY_DELAYS_MINUTES[Math.max(0, Math.min(RETRY_DELAYS_MINUTES.length - 1, attemptCount - 1))];
  base.setUTCMinutes(base.getUTCMinutes() + delayMinutes);
  return base.toISOString();
}

export async function enqueueTripNotificationJob({
  repo,
  tripId,
  now = () => new Date().toISOString()
}) {
  const normalizedTripId = requireNonEmptyString(tripId, "tripId");
  const record = {
    job_key: `${JOB_TYPE_MATCH_NOTIFICATIONS}:${normalizedTripId}`,
    job_type: JOB_TYPE_MATCH_NOTIFICATIONS,
    trip_id: normalizedTripId,
    status: "pending",
    attempt_count: 0,
    last_error: null,
    available_at: now(),
    locked_at: null,
    processed_at: null
  };

  try {
    const existing = await repo.upsertNotificationJob(record);
    return {
      enqueued: true,
      job: existing
    };
  } catch (error) {
    if (isMissingRelationError(error)) {
      return {
        enqueued: false,
        fallbackRequired: true
      };
    }

    throw error;
  }
}

export async function processNotificationJobs({
  repo,
  emailClient,
  resendFrom = DEFAULT_RESEND_FROM,
  limit = 10,
  now = () => new Date().toISOString()
}) {
  let jobs = [];

  try {
    jobs = await repo.getProcessableNotificationJobs({
      limit,
      jobType: JOB_TYPE_MATCH_NOTIFICATIONS,
      now: now()
    });
  } catch (error) {
    if (isMissingRelationError(error)) {
      return { processed: 0, skipped: 0, failed: 0, jobs: [] };
    }

    throw error;
  }

  const results = [];

  for (const job of jobs) {
    try {
      await repo.updateNotificationJob(job.id, {
        status: "processing",
        locked_at: now(),
        attempt_count: (job.attempt_count || 0) + 1,
        last_error: null
      });

      const result = await executeMatchNotifications({
        repo,
        emailClient,
        resendFrom,
        tripId: job.trip_id,
        now
      });

      if ((result.failures || []).length > 0) {
        throw new Error(result.failures.map((failure) => failure.error).join("; "));
      }

      await repo.updateNotificationJob(job.id, {
        status: "sent",
        processed_at: now(),
        locked_at: null,
        last_error: null
      });

      results.push({ jobId: job.id, status: "sent", result });
    } catch (error) {
      const retryAt = computeRetryAt(now(), (job.attempt_count || 0) + 1);
      await repo.updateNotificationJob(job.id, {
        status: "failed",
        locked_at: null,
        last_error: error.message || "Notification processing failed",
        available_at: retryAt
      });

      results.push({ jobId: job.id, status: "failed", error: error.message || "Notification processing failed" });
    }
  }

  return {
    processed: results.filter((item) => item.status === "sent").length,
    failed: results.filter((item) => item.status === "failed").length,
    skipped: 0,
    jobs: results
  };
}

export async function enqueueOrProcessTripNotifications({
  repo,
  emailClient,
  resendFrom = DEFAULT_RESEND_FROM,
  tripId,
  now = () => new Date().toISOString()
}) {
  const enqueueResult = await enqueueTripNotificationJob({ repo, tripId, now });

  if (enqueueResult.fallbackRequired) {
    const result = await executeMatchNotifications({
      repo,
      emailClient,
      resendFrom,
      tripId,
      now
    });

    return {
      enqueued: false,
      processedInline: true,
      notificationResult: result
    };
  }

  const processingResult = await processNotificationJobs({
    repo,
    emailClient,
    resendFrom,
    limit: 5,
    now
  });

  return {
    enqueued: true,
    processedInline: true,
    processingResult
  };
}
