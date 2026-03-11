import { HttpError } from "../../lib/backend/errors";
import { matchEmailFields, matchStatusFields } from "../../lib/backend/constants";

const clone = (value) => structuredClone(value);

const sleep = (durationMs) => new Promise((resolve) => {
  setTimeout(resolve, durationMs);
});

export class FakeBackendRepository {
  constructor({
    trips = [],
    profiles = [],
    notifications = [],
    notificationJobs = [],
    authUsersByToken = { valid: { email: "user1@andrew.cmu.edu" } },
    updateDelayMs = 0,
    matchTransitionHandler = null
  } = {}) {
    this.trips = clone(trips);
    this.profiles = clone(profiles);
    this.notifications = clone(notifications);
    this.notificationJobs = clone(notificationJobs);
    this.authUsersByToken = clone(authUsersByToken);
    this.updateDelayMs = updateDelayMs;
    this.matchTransitionHandler = matchTransitionHandler;
    this.failures = new Map();
    this.operationLog = [];
    this.createdTripCount = 0;
    this.createdJobCount = this.notificationJobs.length;
  }

  enqueueFailure(method, error, matcher = null) {
    const queue = this.failures.get(method) || [];
    queue.push({
      error: error instanceof Error ? error : new Error(error),
      matcher
    });
    this.failures.set(method, queue);
  }

  maybeThrow(method, context = {}) {
    const queue = this.failures.get(method) || [];
    const index = queue.findIndex((item) => !item.matcher || item.matcher(context));
    if (index === -1) {
      return;
    }

    const [{ error }] = queue.splice(index, 1);
    throw error;
  }

  readTrip(id) {
    return clone(this.trips.find((trip) => trip.id === id));
  }

  readNotifications() {
    return clone(this.notifications);
  }

  readNotificationJobs() {
    return clone(this.notificationJobs);
  }

  async getAuthUserByToken(token) {
    this.maybeThrow("getAuthUserByToken", { token });
    const user = this.authUsersByToken[token];
    if (!user) {
      throw new HttpError(401, "Invalid auth token");
    }

    return clone(user);
  }

  async getTripsByIds(ids) {
    this.maybeThrow("getTripsByIds", { ids });
    return clone(this.trips.filter((trip) => ids.includes(trip.id)));
  }

  async getTripById(id) {
    this.maybeThrow("getTripById", { id });
    return clone(this.trips.find((trip) => trip.id === id) || null);
  }

  async getTripsByUserEmails(userEmails) {
    this.maybeThrow("getTripsByUserEmails", { userEmails });
    return clone(this.trips.filter((trip) => userEmails.includes(trip.user_email)));
  }

  async getTripsByDirectionAndFlightDate(direction, flightDate) {
    this.maybeThrow("getTripsByDirectionAndFlightDate", { direction, flightDate });
    return clone(
      this.trips.filter((trip) => {
        return trip.direction === direction && trip.flight_date === flightDate;
      })
    );
  }

  async getTripsByOwner(userEmail) {
    this.maybeThrow("getTripsByOwner", { userEmail });
    return clone(this.trips.filter((trip) => trip.user_email === userEmail));
  }

  async createTrip(payload) {
    this.maybeThrow("createTrip", { payload });

    this.createdTripCount += 1;
    const trip = {
      id: payload.id || `created-trip-${this.createdTripCount}`,
      trip_status: payload.trip_status || "Unmatched (looking for matches)",
      landed_status: payload.landed_status ?? null,
      meetup_status: payload.meetup_status ?? null,
      created_at:
        payload.created_at ||
        `2026-03-11T00:${String(this.createdTripCount).padStart(2, "0")}:00.000Z`,
      baseline_match_check_at: payload.baseline_match_check_at ?? null,
      ...payload
    };

    matchEmailFields.forEach((field) => {
      if (!(field in trip)) {
        trip[field] = null;
      }
    });

    matchStatusFields.forEach((field) => {
      if (!(field in trip)) {
        trip[field] = null;
      }
    });

    this.trips.push(clone(trip));
    this.operationLog.push({ type: "createTrip", payload: clone(payload), trip: clone(trip) });
    return clone(trip);
  }

  async updateTrip(id, updates) {
    this.maybeThrow("updateTrip", { id, updates });

    if (this.updateDelayMs > 0) {
      await sleep(this.updateDelayMs);
    }

    const trip = this.trips.find((candidate) => candidate.id === id);
    if (!trip) {
      throw new Error("Trip not found");
    }

    Object.assign(trip, clone(updates));
    this.operationLog.push({ type: "updateTrip", id, updates: clone(updates) });
  }

  async deleteTrip(id) {
    this.maybeThrow("deleteTrip", { id });
    const index = this.trips.findIndex((trip) => trip.id === id);
    if (index === -1) {
      throw new Error("Trip not found");
    }

    this.trips.splice(index, 1);
    this.operationLog.push({ type: "deleteTrip", id });
  }

  async getProfilesByEmails(emails) {
    this.maybeThrow("getProfilesByEmails", { emails });
    return clone(this.profiles.filter((profile) => emails.includes(profile.email)));
  }

  async getNotificationRecord(tripId, matchedTripId) {
    this.maybeThrow("getNotificationRecord", { tripId, matchedTripId });
    return clone(
      this.notifications.find((notification) => {
        return (
          notification.trip_id === tripId &&
          notification.matched_trip_id === matchedTripId
        );
      }) || null
    );
  }

  async insertNotification(record) {
    this.maybeThrow("insertNotification", { record });
    this.notifications.push(clone(record));
    this.operationLog.push({ type: "insertNotification", record: clone(record) });
  }

  async upsertNotificationJob(record) {
    this.maybeThrow("upsertNotificationJob", { record });
    const existingIndex = this.notificationJobs.findIndex((job) => job.job_key === record.job_key);

    if (existingIndex !== -1) {
      const merged = {
        ...this.notificationJobs[existingIndex],
        ...clone(record),
        updated_at: "2026-03-11T12:00:00.000Z"
      };
      this.notificationJobs[existingIndex] = merged;
      this.operationLog.push({ type: "upsertNotificationJob", record: clone(merged), existing: true });
      return clone(merged);
    }

    this.createdJobCount += 1;
    const job = {
      id: `job-${this.createdJobCount}`,
      created_at: "2026-03-11T12:00:00.000Z",
      updated_at: "2026-03-11T12:00:00.000Z",
      ...clone(record)
    };
    this.notificationJobs.push(job);
    this.operationLog.push({ type: "upsertNotificationJob", record: clone(job), existing: false });
    return clone(job);
  }

  async getProcessableNotificationJobs({ limit, jobType, now }) {
    this.maybeThrow("getProcessableNotificationJobs", { limit, jobType, now });
    return clone(
      this.notificationJobs
        .filter((job) => {
          return (
            job.job_type === jobType &&
            ["pending", "failed"].includes(job.status) &&
            (!job.available_at || job.available_at <= now)
          );
        })
        .sort((left, right) => {
          return String(left.available_at).localeCompare(String(right.available_at)) || left.id.localeCompare(right.id);
        })
        .slice(0, limit)
    );
  }

  async updateNotificationJob(id, updates) {
    this.maybeThrow("updateNotificationJob", { id, updates });
    const job = this.notificationJobs.find((candidate) => candidate.id === id);
    if (!job) {
      throw new Error("Notification job not found");
    }

    Object.assign(job, clone(updates), { updated_at: "2026-03-11T12:05:00.000Z" });
    this.operationLog.push({ type: "updateNotificationJob", id, updates: clone(updates) });
  }

  async executeMatchTransition(context) {
    this.maybeThrow("executeMatchTransition", context);

    if (this.matchTransitionHandler) {
      return clone(await this.matchTransitionHandler(context, this));
    }

    throw new Error('Could not find the function public.match_transition(action, trip_id, matched_trip_id, requester_email)');
  }
}
