import { NextResponse } from "next/server";

import { isHttpError } from "./errors";

export function toRouteErrorResponse(error) {
  const status = isHttpError(error) ? error.status : 500;
  const message = error?.message || "Internal server error";

  if (status >= 500 && process.env.NODE_ENV !== "test" && !process.env.VITEST) {
    console.error(error);
  }

  return NextResponse.json({ error: message }, { status });
}
