import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const resendFrom = process.env.RESEND_FROM || "TartanTrips <onboarding@resend.dev>";

const supabaseAdmin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    })
  : null;

const resend = resendApiKey ? new Resend(resendApiKey) : null;

const allowsSex = (allowed, partnerSex) => {
  if (!allowed || allowed === "Any") {
    return true;
  }

  if (allowed === "Male only") {
    return partnerSex === "Male";
  }

  if (allowed === "Female only") {
    return partnerSex === "Female";
  }

  if (allowed === "Non-binary only") {
    return partnerSex === "Non-binary";
  }

  return false;
};

const windowsOverlap = (aStart, aEnd, bStart, bEnd) => {
  if (!aStart || !aEnd || !bStart || !bEnd) {
    return false;
  }

  const aStartDate = new Date(aStart);
  const aEndDate = new Date(aEnd);
  const bStartDate = new Date(bStart);
  const bEndDate = new Date(bEnd);

  return aStartDate <= bEndDate && aEndDate >= bStartDate;
};

const sendNotification = async (trip, matchedTrip) => {
  if (!resend) {
    return { error: "Missing Resend configuration" };
  }

  const subject = "✈️ New TartanTrips match available";
  const body = `Hi ${trip.name},\n\nA new CMU student with a compatible trip just matched with you on TartanTrips.\n\nLog in to view your updated matches and coordinate if this one works for you.\n\n— TartanTrips\n`;

  const { error } = await resend.emails.send({
    from: resendFrom,
    to: trip.user_email,
    subject,
    text: body
  });

  if (error) {
    return { error: error.message || "Failed to send email" };
  }

  return { error: null };
};

const notificationExists = async (tripId, matchedTripId) => {
  const { data, error } = await supabaseAdmin
    .from("match_notifications")
    .select("trip_id")
    .eq("trip_id", tripId)
    .eq("matched_trip_id", matchedTripId)
    .limit(1);

  if (error) {
    return { error, exists: false };
  }

  return { error: null, exists: (data ?? []).length > 0 };
};

export async function POST(request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Missing Supabase service role configuration" }, { status: 500 });
  }

  const { tripId } = await request.json();

  if (!tripId) {
    return NextResponse.json({ error: "tripId is required" }, { status: 400 });
  }

  const { data: trip, error: tripError } = await supabaseAdmin
    .from("trips")
    .select(
      "id,user_email,name,sex,direction,flight_date,flight_time,allowed_partner_sex,window_start,window_end,created_at,baseline_match_check_at"
    )
    .eq("id", tripId)
    .single();

  if (tripError || !trip) {
    return NextResponse.json({ error: tripError?.message || "Trip not found" }, { status: 404 });
  }

  const isNewTrip = !trip.baseline_match_check_at;
  let baseline = trip.baseline_match_check_at;
  if (!baseline) {
    const now = new Date().toISOString();
    const { error: baselineError } = await supabaseAdmin
      .from("trips")
      .update({ baseline_match_check_at: now })
      .eq("id", tripId);

    if (!baselineError) {
      baseline = now;
    }
  }

  const { data: candidates, error: candidatesError } = await supabaseAdmin
    .from("trips")
    .select(
      "id,user_email,name,sex,direction,flight_date,flight_time,allowed_partner_sex,window_start,window_end,created_at,baseline_match_check_at"
    )
    .eq("direction", trip.direction)
    .eq("flight_date", trip.flight_date)
    .neq("id", trip.id)
    .neq("user_email", trip.user_email);

  if (candidatesError) {
    return NextResponse.json({ error: candidatesError.message }, { status: 500 });
  }

  const compatible = (candidates ?? []).filter((candidate) => {
    if (!windowsOverlap(trip.window_start, trip.window_end, candidate.window_start, candidate.window_end)) {
      return false;
    }

    const currentAllowsCandidate = allowsSex(trip.allowed_partner_sex, candidate.sex);
    const candidateAllowsCurrent = allowsSex(candidate.allowed_partner_sex, trip.sex);

    return currentAllowsCandidate && candidateAllowsCurrent;
  });

  const notifications = [];

  for (const candidate of compatible) {
    const candidateCreatedAfterBaseline = baseline && candidate.created_at > baseline;

    if (candidateCreatedAfterBaseline) {
      const { error: existsError, exists } = await notificationExists(trip.id, candidate.id);
      if (!existsError && !exists) {
        const { error: sendError } = await sendNotification(trip, candidate);
        if (!sendError) {
          await supabaseAdmin.from("match_notifications").insert({
            trip_id: trip.id,
            matched_trip_id: candidate.id,
            notified_at: new Date().toISOString()
          });
          notifications.push({ tripId: trip.id, matchedTripId: candidate.id });
        }
      }
    }

    const otherBaseline = candidate.baseline_match_check_at || candidate.created_at;
    if (!isNewTrip && otherBaseline && trip.created_at > otherBaseline) {
      const { error: existsError, exists } = await notificationExists(candidate.id, trip.id);
      if (!existsError && !exists) {
        const { error: sendError } = await sendNotification(candidate, trip);
        if (!sendError) {
          await supabaseAdmin.from("match_notifications").insert({
            trip_id: candidate.id,
            matched_trip_id: trip.id,
            notified_at: new Date().toISOString()
          });
          notifications.push({ tripId: candidate.id, matchedTripId: trip.id });
        }
      }
    }
    if (isNewTrip && otherBaseline && trip.created_at > otherBaseline) {
      const { error: existsError, exists } = await notificationExists(candidate.id, trip.id);
      if (!existsError && !exists) {
        const { error: sendError } = await sendNotification(candidate, trip);
        if (!sendError) {
          await supabaseAdmin.from("match_notifications").insert({
            trip_id: candidate.id,
            matched_trip_id: trip.id,
            notified_at: new Date().toISOString()
          });
          notifications.push({ tripId: candidate.id, matchedTripId: trip.id });
        }
      }
    }
  }

  return NextResponse.json({
    notified: notifications.length,
    notifications,
    summary: {
      tripId: trip.id,
      baselineMatchCheckAt: baseline,
      compatibleTrips: compatible.length
    }
  });
}
