import { HttpError } from "./errors";

export async function parseJsonBody(request) {
  let body;

  try {
    body = await request.json();
  } catch (error) {
    throw new HttpError(400, "Invalid JSON payload");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Request body must be a JSON object");
  }

  return body;
}

export function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, `${fieldName} is required`);
  }

  return value.trim();
}

export function getBearerToken(request) {
  const authHeader = (request.headers.get("authorization") || "").trim();
  if (!authHeader) {
    return null;
  }

  const bearerMatch = authHeader.match(/^Bearer(?:\s+(.*))?$/i);
  if (bearerMatch) {
    return bearerMatch[1]?.trim() || null;
  }

  return authHeader;
}

export function requireBearerToken(request) {
  const token = getBearerToken(request);
  if (!token) {
    throw new HttpError(401, "Missing auth token");
  }

  return token;
}
