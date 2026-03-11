import { describe, expect, it } from "vitest";

import { POST as matchNotificationsPost } from "../../app/api/match-notifications/route";
import { POST as matchRequestsPost } from "../../app/api/match-requests/route";
import {
  GET as notificationJobsProcessGet,
  POST as notificationJobsProcessPost
} from "../../app/api/notification-jobs/process/route";
import { DELETE as tripsDelete, PATCH as tripsPatch } from "../../app/api/trips/[tripId]/route";
import { POST as tripsPost } from "../../app/api/trips/route";
import { POST as tripStatusSyncPost } from "../../app/api/trip-status-sync/route";

describe("route exports", () => {
  it("exports match-requests POST", () => {
    expect(typeof matchRequestsPost).toBe("function");
  });

  it("exports trip-status-sync POST", () => {
    expect(typeof tripStatusSyncPost).toBe("function");
  });

  it("exports match-notifications POST", () => {
    expect(typeof matchNotificationsPost).toBe("function");
  });

  it("exports trips POST", () => {
    expect(typeof tripsPost).toBe("function");
  });

  it("exports trip PATCH and DELETE", () => {
    expect(typeof tripsPatch).toBe("function");
    expect(typeof tripsDelete).toBe("function");
  });

  it("exports notification job processor POST", () => {
    expect(typeof notificationJobsProcessGet).toBe("function");
    expect(typeof notificationJobsProcessPost).toBe("function");
  });
});
