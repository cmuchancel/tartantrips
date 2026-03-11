import {
  createNotificationJobsProcessGetRoute,
  createNotificationJobsProcessPostRoute
} from "../../../../lib/backend/trips-route";

export const GET = createNotificationJobsProcessGetRoute();
export const POST = createNotificationJobsProcessPostRoute();
