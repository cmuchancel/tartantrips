import {
  ALLOWED_PARTNER_SEX_VALUES,
  MATCHED_TRIP_STATUSES,
  TRIP_DIRECTIONS,
  TRIP_STATUSES
} from "./constants";
import { HttpError } from "./errors";
import { requireNonEmptyString } from "./request";

const EST_OFFSET_HOURS = 5;

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

function toDateTimeEST(dateValue, timeValue) {
  const [year, month, day] = String(dateValue || "").split("-").map(Number);
  const [hour, minute = 0] = String(timeValue || "").split(":").map(Number);

  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
    return new Date("invalid");
  }

  const utcMillis = Date.UTC(year, month - 1, day, hour + EST_OFFSET_HOURS, minute);
  return new Date(utcMillis);
}

const addHours = (dateValue, hours) => {
  return new Date(dateValue.getTime() + hours * 60 * 60 * 1000);
};

function requireDirection(direction) {
  const normalizedDirection = requireNonEmptyString(direction, "direction");
  if (!TRIP_DIRECTIONS.includes(normalizedDirection)) {
    throw new HttpError(400, "Invalid direction");
  }

  return normalizedDirection;
}

function requireAllowedPartnerSex(value) {
  const normalizedValue = requireNonEmptyString(value, "allowed_partner_sex");
  if (!ALLOWED_PARTNER_SEX_VALUES.includes(normalizedValue)) {
    throw new HttpError(400, "Invalid allowed_partner_sex");
  }

  return normalizedValue;
}

function requireTripStatus(value) {
  const normalizedValue = requireNonEmptyString(value, "trip_status");
  if (!TRIP_STATUSES.includes(normalizedValue)) {
    throw new HttpError(400, "Invalid trip_status");
  }

  return normalizedValue;
}

function parseOptionalInteger(value, fieldName) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalizedValue =
    typeof value === "string" && value.trim().length > 0 ? Number(value) : value;

  if (!isFiniteNumber(normalizedValue)) {
    throw new HttpError(400, `${fieldName} must be a number`);
  }

  return Math.trunc(normalizedValue);
}

export function buildNormalizedTripPayload(input, requesterEmail) {
  const direction = requireDirection(input.direction);
  const flightDate = requireNonEmptyString(input.flight_date, "flight_date");
  const flightTime = requireNonEmptyString(input.flight_time, "flight_time");
  const allowedPartnerSex = requireAllowedPartnerSex(input.allowed_partner_sex || "Any");
  const tripStatus = requireTripStatus(
    input.trip_status || "Unmatched (looking for matches)"
  );
  const landedStatus = input.landed_status ?? (direction === "Arriving to Pittsburgh" ? "Not landed yet" : null);
  const meetupStatus = input.meetup_status ?? (direction === "Arriving to Pittsburgh" ? "Looking for match" : null);

  const flightDateTime = toDateTimeEST(flightDate, flightTime);
  if (Number.isNaN(flightDateTime.getTime())) {
    throw new HttpError(400, "Please enter a valid flight date and time.");
  }

  let willingToWaitUntilTime = input.willing_to_wait_until_time ?? null;
  let minHoursBefore = parseOptionalInteger(input.min_hours_before, "min_hours_before");
  let maxHoursBefore = parseOptionalInteger(input.max_hours_before, "max_hours_before");
  let windowStart;
  let windowEnd;

  if (direction === "Arriving to Pittsburgh") {
    willingToWaitUntilTime = requireNonEmptyString(
      willingToWaitUntilTime,
      "willing_to_wait_until_time"
    );

    const waitUntil = toDateTimeEST(flightDate, willingToWaitUntilTime);
    if (Number.isNaN(waitUntil.getTime())) {
      throw new HttpError(400, "Please enter a valid wait-until time.");
    }

    if (waitUntil < flightDateTime) {
      waitUntil.setDate(waitUntil.getDate() + 1);
    }

    windowStart = flightDateTime.toISOString();
    windowEnd = waitUntil.toISOString();
    minHoursBefore = null;
    maxHoursBefore = null;
  } else {
    if (!isFiniteNumber(minHoursBefore) || !isFiniteNumber(maxHoursBefore)) {
      throw new HttpError(400, "Please enter valid hour ranges for departures.");
    }

    if (minHoursBefore < 0 || maxHoursBefore < 0) {
      throw new HttpError(400, "Hours before flight must be positive.");
    }

    if (maxHoursBefore < minHoursBefore) {
      throw new HttpError(400, "Maximum hours before flight must be greater than minimum hours.");
    }

    windowStart = addHours(flightDateTime, -maxHoursBefore).toISOString();
    windowEnd = addHours(flightDateTime, -minHoursBefore).toISOString();
    willingToWaitUntilTime = null;
  }

  return {
    user_email: requesterEmail,
    direction,
    flight_date: flightDate,
    flight_time: flightTime,
    allowed_partner_sex: allowedPartnerSex,
    trip_status: tripStatus,
    landed_status: landedStatus,
    meetup_status: meetupStatus,
    willing_to_wait_until_time: willingToWaitUntilTime,
    min_hours_before: minHoursBefore,
    max_hours_before: maxHoursBefore,
    window_start: windowStart,
    window_end: windowEnd
  };
}

export function buildTripStatusPatch(input) {
  const updates = {};

  if (input.trip_status !== undefined) {
    const tripStatus = requireTripStatus(input.trip_status);
    updates.trip_status = tripStatus;
  }

  if (input.landed_status !== undefined) {
    if (input.landed_status !== null && typeof input.landed_status !== "string") {
      throw new HttpError(400, "landed_status must be a string or null");
    }
    updates.landed_status = input.landed_status;
  }

  if (input.meetup_status !== undefined) {
    if (input.meetup_status !== null && typeof input.meetup_status !== "string") {
      throw new HttpError(400, "meetup_status must be a string or null");
    }
    updates.meetup_status = input.meetup_status;
  }

  if (Object.keys(updates).length === 0) {
    throw new HttpError(400, "At least one trip field update is required");
  }

  return updates;
}

export function isMatchedStatus(value) {
  return typeof value === "string" && MATCHED_TRIP_STATUSES.includes(value);
}

export function getTripMutationKind(body) {
  const detailedFields = [
    "direction",
    "flight_date",
    "flight_time",
    "allowed_partner_sex",
    "willing_to_wait_until_time",
    "min_hours_before",
    "max_hours_before"
  ];

  if (detailedFields.some((field) => Object.prototype.hasOwnProperty.call(body, field))) {
    return "trip_details";
  }

  return "status_patch";
}
