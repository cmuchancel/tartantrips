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
        "direction",
        "flight_date",
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

  const getMatchedPartners = (sourceTrip) => {
    return matchEmailFields
      .map((field, index) => {
        const status = sourceTrip[matchStatusFields[index]];
        return status === "matched" ? sourceTrip[field] : null;
      })
      .filter(Boolean);
  };

  const hasStatusWithEmail = (sourceTrip, email, status) => {
    const slot = getSlotForEmail(sourceTrip, email);
    if (slot === -1) {
      return false;
    }
    return sourceTrip[matchStatusFields[slot]] === status;
  };

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

      const matchedPartners = getMatchedPartners(trip);
      if (matchedPartners.length > 0) {
        const { data: partnerTrips } = await supabaseAdmin
          .from("trips")
          .select(["id", "user_email", ...matchEmailFields, ...matchStatusFields].join(","))
          .in("user_email", matchedPartners)
          .eq("direction", trip.direction)
          .eq("flight_date", trip.flight_date);

        for (const partnerTrip of partnerTrips ?? []) {
          const partnerSlot = getSlotForEmail(partnerTrip, matchTrip.user_email);
          if (
            partnerSlot !== -1 &&
            partnerTrip[matchStatusFields[partnerSlot]] === "partner_approval_needed"
          ) {
            await updateTrip(partnerTrip.id, {
              [matchEmailFields[partnerSlot]]: null,
              [matchStatusFields[partnerSlot]]: null
            });
          }
        }
      }
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "accept") {
    if (requesterSlot === -1) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    try {
      const currentStatus = trip[matchStatusFields[requesterSlot]];
      if (
        currentStatus === "partner_approval_needed" &&
        !hasStatusWithEmail(matchTrip, trip.user_email, "partner_approval_needed")
      ) {
        await updateTrip(trip.id, {
          [matchEmailFields[requesterSlot]]: null,
          [matchStatusFields[requesterSlot]]: null
        });

        const { data: possibleRequesters } = await supabaseAdmin
          .from("trips")
          .select(["id", "user_email", "direction", "flight_date", ...matchEmailFields, ...matchStatusFields].join(","))
          .eq("direction", trip.direction)
          .eq("flight_date", trip.flight_date);

        const requesterTrip = (possibleRequesters ?? []).find((candidate) => {
          return (
            hasStatusWithEmail(candidate, trip.user_email, "matched") &&
            hasStatusWithEmail(candidate, matchTrip.user_email, "partner_approval_needed")
          );
        });

        if (!requesterTrip) {
          return NextResponse.json({ ok: true });
        }

        const requesterPartners = getMatchedPartners(requesterTrip);
        const { data: partnerTrips } = await supabaseAdmin
          .from("trips")
          .select(["id", "user_email", ...matchEmailFields, ...matchStatusFields].join(","))
          .in("user_email", requesterPartners)
          .eq("direction", requesterTrip.direction)
          .eq("flight_date", requesterTrip.flight_date);

        const pendingApprovals = (partnerTrips ?? []).filter((partnerTrip) => {
          const partnerSlot = getSlotForEmail(partnerTrip, matchTrip.user_email);
          return (
            partnerSlot !== -1 &&
            partnerTrip[matchStatusFields[partnerSlot]] === "partner_approval_needed"
          );
        });

        if (pendingApprovals.length === 0) {
          const requesterSlotWithCandidate = getSlotForEmail(requesterTrip, matchTrip.user_email);
          const candidateSlotWithRequester = getSlotForEmail(matchTrip, requesterTrip.user_email);
          if (requesterSlotWithCandidate !== -1 && candidateSlotWithRequester !== -1) {
            await updateTrip(requesterTrip.id, {
              [matchStatusFields[requesterSlotWithCandidate]]: "matched"
            });
            await updateTrip(matchTrip.id, {
              [matchStatusFields[candidateSlotWithRequester]]: "matched"
            });
          }
        }

        return NextResponse.json({ ok: true });
      }

      if (matchSlot === -1) {
        return NextResponse.json({ error: "Match not found" }, { status: 404 });
      }

      const requesterPartners = getMatchedPartners(matchTrip);
      if (requesterPartners.length > 0) {
        await updateTrip(trip.id, { [matchStatusFields[requesterSlot]]: "partner_approval_needed" });
        await updateTrip(matchTrip.id, { [matchStatusFields[matchSlot]]: "partner_approval_needed" });

        const { data: partnerTrips } = await supabaseAdmin
          .from("trips")
          .select(["id", "user_email", ...matchEmailFields, ...matchStatusFields].join(","))
          .in("user_email", requesterPartners)
          .eq("direction", matchTrip.direction)
          .eq("flight_date", matchTrip.flight_date);

        for (const partnerTrip of partnerTrips ?? []) {
          const partnerSlot = getSlotForEmail(partnerTrip, trip.user_email);
          const emptySlot = partnerSlot === -1 ? getEmptySlot(partnerTrip) : partnerSlot;
          if (emptySlot === -1) {
            continue;
          }
          await updateTrip(partnerTrip.id, {
            [matchEmailFields[emptySlot]]: trip.user_email,
            [matchStatusFields[emptySlot]]: "partner_approval_needed"
          });
        }

        return NextResponse.json({ ok: true });
      }

      await updateTrip(trip.id, { [matchStatusFields[requesterSlot]]: "matched" });
      await updateTrip(matchTrip.id, { [matchStatusFields[matchSlot]]: "matched" });
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "deny") {
    if (requesterSlot === -1) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    try {
      const currentStatus = trip[matchStatusFields[requesterSlot]];
      if (
        currentStatus === "partner_approval_needed" &&
        !hasStatusWithEmail(matchTrip, trip.user_email, "partner_approval_needed")
      ) {
        await updateTrip(trip.id, {
          [matchEmailFields[requesterSlot]]: null,
          [matchStatusFields[requesterSlot]]: null
        });

        const { data: possibleRequesters } = await supabaseAdmin
          .from("trips")
          .select(["id", "user_email", "direction", "flight_date", ...matchEmailFields, ...matchStatusFields].join(","))
          .eq("direction", trip.direction)
          .eq("flight_date", trip.flight_date);

        const requesterTrip = (possibleRequesters ?? []).find((candidate) => {
          return (
            hasStatusWithEmail(candidate, trip.user_email, "matched") &&
            hasStatusWithEmail(candidate, matchTrip.user_email, "partner_approval_needed")
          );
        });

        if (requesterTrip) {
          const requesterSlotWithCandidate = getSlotForEmail(requesterTrip, matchTrip.user_email);
          const candidateSlotWithRequester = getSlotForEmail(matchTrip, requesterTrip.user_email);

          if (requesterSlotWithCandidate !== -1) {
            await updateTrip(requesterTrip.id, {
              [matchEmailFields[requesterSlotWithCandidate]]: null,
              [matchStatusFields[requesterSlotWithCandidate]]: null
            });
          }
          if (candidateSlotWithRequester !== -1) {
            await updateTrip(matchTrip.id, {
              [matchEmailFields[candidateSlotWithRequester]]: null,
              [matchStatusFields[candidateSlotWithRequester]]: null
            });
          }

          const requesterPartners = getMatchedPartners(requesterTrip);
          const { data: partnerTrips } = await supabaseAdmin
            .from("trips")
            .select(["id", "user_email", ...matchEmailFields, ...matchStatusFields].join(","))
            .in("user_email", requesterPartners)
            .eq("direction", requesterTrip.direction)
            .eq("flight_date", requesterTrip.flight_date);

          for (const partnerTrip of partnerTrips ?? []) {
            const partnerSlot = getSlotForEmail(partnerTrip, matchTrip.user_email);
            if (
              partnerSlot !== -1 &&
              partnerTrip[matchStatusFields[partnerSlot]] === "partner_approval_needed"
            ) {
              await updateTrip(partnerTrip.id, {
                [matchEmailFields[partnerSlot]]: null,
                [matchStatusFields[partnerSlot]]: null
              });
            }
          }
        }

        return NextResponse.json({ ok: true });
      }

      if (matchSlot === -1) {
        return NextResponse.json({ error: "Match not found" }, { status: 404 });
      }

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
