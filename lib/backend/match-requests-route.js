import { NextResponse } from "next/server";

import { executeMatchTransition } from "./match-transition-service";
import { parseJsonBody, requireBearerToken } from "./request";
import {
  createSupabaseAdminFromEnv,
  createSupabaseBackendRepository
} from "./supabase-repo";
import { HttpError } from "./errors";
import { toRouteErrorResponse } from "./route-response";

function createDefaultRepository() {
  const supabase = createSupabaseAdminFromEnv();
  return supabase ? createSupabaseBackendRepository(supabase) : null;
}

export function createMatchRequestsRoute({ createRepository = createDefaultRepository } = {}) {
  return async function POST(request) {
    try {
      const repository = createRepository();
      if (!repository) {
        throw new HttpError(500, "Missing Supabase service role configuration");
      }

      const token = requireBearerToken(request);
      const user = await repository.getAuthUserByToken(token);
      const body = await parseJsonBody(request);
      const result = await executeMatchTransition({
        repo: repository,
        requesterEmail: user.email,
        action: body.action,
        tripId: body.tripId,
        matchedTripId: body.matchedTripId
      });

      return NextResponse.json(result);
    } catch (error) {
      return toRouteErrorResponse(error);
    }
  };
}
