import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    })
  : null;

const matchEmailFields = [
  "match_email_0",
  "match_email_1",
  "match_email_2",
  "match_email_3",
  "match_email_4",
  "match_email_5"
];

const matchStatusFields = [
  "match_status_0",
  "match_status_1",
  "match_status_2",
  "match_status_3",
  "match_status_4",
  "match_status_5"
];

const getSlotForEmail = (trip, email) => {
  return matchEmailFields.findIndex((field) => trip[field] === email);
};

const getEmptySlot = (trip) => {
  return matchEmailFields.findIndex((field) => !trip[field]);
};

export async function POST(request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Missing Supabase service role configuration" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
  }

  const { action, tripId, matchedTripId } = await request.json();
  if (!action || !tripId || !matchedTripId) {
    return NextResponse.json({ error: "action, tripId, matchedTripId are required" }, { status: 400 });
  }

  const { data: trips, error: tripError } = await supabaseAdmin
    .from("trips")
    .select(
      [
        "id",
        "user_email",
        ...matchEmailFields,
        ...matchStatusFields
      ].join(",")
    )
    .in("id", [tripId, matchedTripId]);

  if (tripError || !trips || trips.length !== 2) {
    return NextResponse.json({ error: tripError?.message || "Trips not found" }, { status: 404 });
  }

  const requesterEmail = authData.user.email;
  const trip = trips.find((row) => row.id === tripId);
  const matchTrip = trips.find((row) => row.id === matchedTripId);

  if (!trip || !matchTrip || !requesterEmail) {
    return NextResponse.json({ error: "Trips not found" }, { status: 404 });
  }

  const ownsTrip = trip.user_email === requesterEmail;
  const ownsMatchTrip = matchTrip.user_email === requesterEmail;

  if (action === "request" || action === "withdraw") {
    if (!ownsTrip) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
  }

  if (action === "accept" || action === "deny") {
    if (!ownsTrip) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
  }

  if (action === "remove") {
    if (!ownsTrip && !ownsMatchTrip) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
  }

  const requesterSlot = getSlotForEmail(trip, matchTrip.user_email);
  const matchSlot = getSlotForEmail(matchTrip, trip.user_email);

  const updateTrip = async (rowId, updates) => {
    const { error } = await supabaseAdmin.from("trips").update(updates).eq("id", rowId);
    if (error) {
      throw new Error(error.message || "Failed to update trip");
    }
  };

  if (action === "request") {
    const slotA = requesterSlot === -1 ? getEmptySlot(trip) : requesterSlot;
    const slotB = matchSlot === -1 ? getEmptySlot(matchTrip) : matchSlot;

    if (slotA === -1 || slotB === -1) {
      return NextResponse.json({ error: "No available match slots" }, { status: 400 });
    }

    const updatesA = {
      [matchEmailFields[slotA]]: matchTrip.user_email,
      [matchStatusFields[slotA]]: "request_sent"
    };
    const updatesB = {
      [matchEmailFields[slotB]]: trip.user_email,
      [matchStatusFields[slotB]]: "request_received"
    };

    try {
      await updateTrip(trip.id, updatesA);
      await updateTrip(matchTrip.id, updatesB);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "withdraw") {
    if (requesterSlot === -1 || matchSlot === -1) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    try {
      await updateTrip(trip.id, {
        [matchEmailFields[requesterSlot]]: null,
        [matchStatusFields[requesterSlot]]: null
      });
      await updateTrip(matchTrip.id, {
        [matchEmailFields[matchSlot]]: null,
        [matchStatusFields[matchSlot]]: null
      });
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "accept") {
    if (requesterSlot === -1 || matchSlot === -1) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    try {
      await updateTrip(trip.id, { [matchStatusFields[requesterSlot]]: "matched" });
      await updateTrip(matchTrip.id, { [matchStatusFields[matchSlot]]: "matched" });
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "deny") {
    if (requesterSlot === -1 || matchSlot === -1) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    try {
      await updateTrip(trip.id, {
        [matchEmailFields[requesterSlot]]: null,
        [matchStatusFields[requesterSlot]]: null
      });
      await updateTrip(matchTrip.id, {
        [matchEmailFields[matchSlot]]: null,
        [matchStatusFields[matchSlot]]: null
      });
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "remove") {
    if (requesterSlot === -1 || matchSlot === -1) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    try {
      await updateTrip(trip.id, {
        [matchEmailFields[requesterSlot]]: null,
        [matchStatusFields[requesterSlot]]: null
      });
      await updateTrip(matchTrip.id, {
        [matchEmailFields[matchSlot]]: null,
        [matchStatusFields[matchSlot]]: null
      });
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
