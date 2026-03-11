import { NextResponse } from "next/server";

import { executeMatchNotifications } from "./match-notifications-service";
import { HttpError } from "./errors";
import { parseJsonBody } from "./request";
import { toRouteErrorResponse } from "./route-response";
import {
  createResendClientFromEnv,
  createSupabaseAdminFromEnv,
  createSupabaseBackendRepository,
  getResendFromAddress
} from "./supabase-repo";

function createDefaultRepository() {
  const supabase = createSupabaseAdminFromEnv();
  return supabase ? createSupabaseBackendRepository(supabase) : null;
}

function createDefaultEmailClient() {
  return createResendClientFromEnv();
}

export function createMatchNotificationsRoute({
  createRepository = createDefaultRepository,
  createEmailClient = createDefaultEmailClient,
  getFromAddress = getResendFromAddress
} = {}) {
  return async function POST(request) {
    try {
      const repository = createRepository();
      if (!repository) {
        throw new HttpError(500, "Missing Supabase service role configuration");
      }

      const body = await parseJsonBody(request);
      const result = await executeMatchNotifications({
        repo: repository,
        emailClient: createEmailClient(),
        resendFrom: getFromAddress(),
        tripId: body.tripId
      });

      return NextResponse.json(result);
    } catch (error) {
      return toRouteErrorResponse(error);
    }
  };
}

