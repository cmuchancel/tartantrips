import { NextResponse } from "next/server";

import { executeTripStatusSync } from "./trip-status-sync-service";
import { HttpError } from "./errors";
import { parseJsonBody, requireBearerToken } from "./request";
import { toRouteErrorResponse } from "./route-response";
import {
  createSupabaseAdminFromEnv,
  createSupabaseBackendRepository
} from "./supabase-repo";

function createDefaultRepository() {
  const supabase = createSupabaseAdminFromEnv();
  return supabase ? createSupabaseBackendRepository(supabase) : null;
}

export function createTripStatusSyncRoute({ createRepository = createDefaultRepository } = {}) {
  return async function POST(request) {
    try {
      const repository = createRepository();
      if (!repository) {
        throw new HttpError(500, "Missing Supabase service role configuration");
      }

      const token = requireBearerToken(request);
      const user = await repository.getAuthUserByToken(token);
      const body = await parseJsonBody(request);
      const result = await executeTripStatusSync({
        repo: repository,
        requesterEmail: user.email,
        tripId: body.tripId,
        tripStatus: body.trip_status
      });

      return NextResponse.json(result);
    } catch (error) {
      return toRouteErrorResponse(error);
    }
  };
}

