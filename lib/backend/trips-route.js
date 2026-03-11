import { NextResponse } from "next/server";

import { HttpError } from "./errors";
import { processNotificationJobs } from "./notification-jobs-service";
import {
  getBearerToken,
  parseJsonBody,
  requireBearerToken,
  requireNonEmptyString
} from "./request";
import { toRouteErrorResponse } from "./route-response";
import {
  createResendClientFromEnv,
  createSupabaseAdminFromEnv,
  createSupabaseBackendRepository,
  getResendFromAddress
} from "./supabase-repo";
import {
  createTrip,
  deleteTrip,
  getTripRouteMutationKind,
  updateTripDetails,
  updateTripState
} from "./trip-service";

function createDefaultRepository() {
  const supabase = createSupabaseAdminFromEnv();
  return supabase ? createSupabaseBackendRepository(supabase) : null;
}

function createDefaultEmailClient() {
  return createResendClientFromEnv();
}

async function getAuthorizedContext(request, createRepository) {
  const repository = createRepository();
  if (!repository) {
    throw new HttpError(500, "Missing Supabase service role configuration");
  }

  const token = requireBearerToken(request);
  const user = await repository.getAuthUserByToken(token);

  return { repository, user };
}

async function resolveRouteParams(context) {
  if (!context?.params) {
    return {};
  }

  if (typeof context.params.then === "function") {
    return context.params;
  }

  return context.params;
}

async function requireTripId(context) {
  const params = await resolveRouteParams(context);
  return requireNonEmptyString(params?.tripId, "tripId");
}

export function createTripsPostRoute({
  createRepository = createDefaultRepository,
  createEmailClient = createDefaultEmailClient,
  getFromAddress = getResendFromAddress
} = {}) {
  return async function POST(request) {
    try {
      const { repository, user } = await getAuthorizedContext(request, createRepository);
      const body = await parseJsonBody(request);
      const result = await createTrip({
        repo: repository,
        emailClient: createEmailClient(),
        resendFrom: getFromAddress(),
        requesterEmail: user.email,
        input: body
      });

      return NextResponse.json(result, { status: 201 });
    } catch (error) {
      return toRouteErrorResponse(error);
    }
  };
}

export function createTripPatchRoute({
  createRepository = createDefaultRepository,
  createEmailClient = createDefaultEmailClient,
  getFromAddress = getResendFromAddress
} = {}) {
  return async function PATCH(request, context) {
    try {
      const { repository, user } = await getAuthorizedContext(request, createRepository);
      const tripId = await requireTripId(context);
      const body = await parseJsonBody(request);
      const mutationKind = getTripRouteMutationKind(body);
      const result =
        mutationKind === "trip_details"
          ? await updateTripDetails({
              repo: repository,
              emailClient: createEmailClient(),
              resendFrom: getFromAddress(),
              tripId,
              requesterEmail: user.email,
              input: body
            })
          : await updateTripState({
              repo: repository,
              tripId,
              requesterEmail: user.email,
              input: body
            });

      return NextResponse.json(result);
    } catch (error) {
      return toRouteErrorResponse(error);
    }
  };
}

export function createTripDeleteRoute({ createRepository = createDefaultRepository } = {}) {
  return async function DELETE(request, context) {
    try {
      const { repository, user } = await getAuthorizedContext(request, createRepository);
      const tripId = await requireTripId(context);
      const result = await deleteTrip({
        repo: repository,
        tripId,
        requesterEmail: user.email
      });

      return NextResponse.json(result);
    } catch (error) {
      return toRouteErrorResponse(error);
    }
  };
}

function requireProcessorSecret(request, env = process.env) {
  const configuredCronSecret = env.CRON_SECRET;
  const configuredManualSecret = env.NOTIFICATION_JOB_SECRET;

  if (!configuredCronSecret && !configuredManualSecret) {
    if (env.NODE_ENV === "test" || env.VITEST) {
      return;
    }

    throw new HttpError(500, "Missing CRON_SECRET or NOTIFICATION_JOB_SECRET configuration");
  }

  const bearerToken = getBearerToken(request);
  if (configuredCronSecret && bearerToken === configuredCronSecret) {
    return;
  }

  const providedManualSecret = (request.headers.get("x-notification-job-secret") || "").trim();
  if (configuredManualSecret && providedManualSecret === configuredManualSecret) {
    return;
  }

  throw new HttpError(401, "Invalid notification job secret");
}

function parseLimitValue(value, defaultLimit) {
  if (value === undefined || value === null || value === "") {
    return defaultLimit;
  }

  const limit = Math.max(1, Math.min(100, Number(value)));
  if (!Number.isFinite(limit)) {
    throw new HttpError(400, "limit must be a number");
  }

  return limit;
}

async function runNotificationJobs(request, {
  createRepository,
  createEmailClient,
  getFromAddress,
  authorize,
  defaultLimit = 10,
  readLimit
}) {
  authorize(request);

  const repository = createRepository();
  if (!repository) {
    throw new HttpError(500, "Missing Supabase service role configuration");
  }

  const limit = await readLimit(request, defaultLimit);

  return processNotificationJobs({
    repo: repository,
    emailClient: createEmailClient(),
    resendFrom: getFromAddress(),
    limit
  });
}

export function createNotificationJobsProcessPostRoute({
  createRepository = createDefaultRepository,
  createEmailClient = createDefaultEmailClient,
  getFromAddress = getResendFromAddress,
  authorize = requireProcessorSecret
} = {}) {
  return async function POST(request) {
    try {
      const result = await runNotificationJobs(request, {
        createRepository,
        createEmailClient,
        getFromAddress,
        authorize,
        defaultLimit: 10,
        readLimit: async (incomingRequest, defaultLimit) => {
          const body = await parseJsonBody(incomingRequest);
          return parseLimitValue(body.limit, defaultLimit);
        }
      });

      return NextResponse.json(result);
    } catch (error) {
      return toRouteErrorResponse(error);
    }
  };
}

export function createNotificationJobsProcessGetRoute({
  createRepository = createDefaultRepository,
  createEmailClient = createDefaultEmailClient,
  getFromAddress = getResendFromAddress,
  authorize = requireProcessorSecret
} = {}) {
  return async function GET(request) {
    try {
      const result = await runNotificationJobs(request, {
        createRepository,
        createEmailClient,
        getFromAddress,
        authorize,
        defaultLimit: 25,
        readLimit: async (incomingRequest, defaultLimit) => {
          const url = new URL(incomingRequest.url);
          return parseLimitValue(url.searchParams.get("limit"), defaultLimit);
        }
      });

      return NextResponse.json(result);
    } catch (error) {
      return toRouteErrorResponse(error);
    }
  };
}
