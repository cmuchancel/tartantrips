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

  const { tripId, trip_status } = await request.json();
  if (!tripId || !trip_status) {
    return NextResponse.json({ error: "tripId and trip_status are required" }, { status: 400 });
  }

  const { data: trip, error: tripError } = await supabaseAdmin
    .from("trips")
    .select([
      "id",
      "user_email",
      ...matchEmailFields,
      ...matchStatusFields
    ].join(","))
    .eq("id", tripId)
    .single();

  if (tripError || !trip) {
    return NextResponse.json({ error: tripError?.message || "Trip not found" }, { status: 404 });
  }

  if (trip.user_email !== authData.user.email) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const matchedEmails = matchEmailFields
    .map((field, index) => ({
      email: trip[field],
      status: trip[matchStatusFields[index]]
    }))
    .filter((entry) => entry.email && entry.status === "matched")
    .map((entry) => entry.email);

  const updates = [{ id: trip.id, trip_status }];

  if (matchedEmails.length > 0) {
    const orFilters = matchEmailFields
      .map((field, index) => {
        const statusField = matchStatusFields[index];
        return `and(${field}.eq.${trip.user_email},${statusField}.eq.matched)`;
      })
      .join(",");

    const { data: matchedTrips, error: matchedTripsError } = await supabaseAdmin
      .from("trips")
      .select("id,user_email")
      .in("user_email", matchedEmails)
      .or(orFilters);

    if (matchedTripsError) {
      return NextResponse.json({ error: matchedTripsError.message }, { status: 500 });
    }

    (matchedTrips ?? []).forEach((row) => {
      updates.push({ id: row.id, trip_status });
    });
  }

  try {
    await Promise.all(
      updates.map((row) =>
        supabaseAdmin.from("trips").update({ trip_status: row.trip_status }).eq("id", row.id)
      )
    );
  } catch (err) {
    return NextResponse.json({ error: err.message || "Failed to sync status" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: updates.length });
}
