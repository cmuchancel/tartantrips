"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import AppNav from "../components/AppNav";

type TripRecord = {
  id: string;
  user_email: string;
  direction: string;
  flight_date: string;
  flight_time: string;
  allowed_partner_sex: string;
  trip_status: string | null;
  landed_status: string | null;
  meetup_status: string | null;
  match_email_0: string | null;
  match_email_1: string | null;
  match_email_2: string | null;
  match_email_3: string | null;
  match_email_4: string | null;
  match_email_5: string | null;
  match_status_0: string | null;
  match_status_1: string | null;
  match_status_2: string | null;
  match_status_3: string | null;
  match_status_4: string | null;
  match_status_5: string | null;
  willing_to_wait_until_time: string | null;
  min_hours_before: number | null;
  max_hours_before: number | null;
  window_start: string | null;
  window_end: string | null;
  created_at: string;
};

type MatchRecord = {
  id: string;
  user_email: string;
  direction: string;
  flight_date: string;
  flight_time: string;
  allowed_partner_sex: string;
  window_start: string | null;
  window_end: string | null;
  willing_to_wait_until_time: string | null;
  created_at: string;
  trip_status: string | null;
  match_email_0: string | null;
  match_email_1: string | null;
  match_email_2: string | null;
  match_email_3: string | null;
  match_email_4: string | null;
  match_email_5: string | null;
  match_status_0: string | null;
  match_status_1: string | null;
  match_status_2: string | null;
  match_status_3: string | null;
  match_status_4: string | null;
  match_status_5: string | null;
  profile?: ProfileRecord | null;
};

type ProfileRecord = {
  email: string;
  name: string | null;
  sex: string | null;
  major: string | null;
  graduation_year: string | null;
  phone: string | null;
  avatar_path: string | null;
};

type MatchGroup = {
  kind: "single" | "pair";
  members: MatchRecord[];
};

const normalizeTime = (value: string | null) => {
  if (!value) {
    return "";
  }

  return value.length >= 5 ? value.slice(0, 5) : value;
};

const toDateTimeEST = (dateValue: string, timeValue: string) => {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute = 0] = timeValue.split(":").map(Number);

  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
    return new Date("invalid");
  }

  const utcMillis = Date.UTC(year, month - 1, day, hour + 5, minute);
  return new Date(utcMillis);
};

const diffMinutes = (dateValue: string, timeA: string, timeB: string) => {
  const a = toDateTimeEST(dateValue, timeA);
  const b = toDateTimeEST(dateValue, timeB);

  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.abs(a.getTime() - b.getTime());
};

const formatTime12h = (timeValue: string) => {
  const [hourRaw, minuteRaw = "0"] = timeValue.split(":");
  const hourNum = Number(hourRaw);
  const minuteNum = Number(minuteRaw);

  if (Number.isNaN(hourNum) || Number.isNaN(minuteNum)) {
    return timeValue;
  }

  const period = hourNum >= 12 ? "PM" : "AM";
  const normalizedHour = hourNum % 12 || 12;
  const paddedMinute = minuteNum.toString().padStart(2, "0");
  return `${normalizedHour}:${paddedMinute} ${period}`;
};

const formatDateLong = (dateValue: string) => {
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) {
    return dateValue;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
};

const allowsSex = (allowed: string, partnerSex: string) => {
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

const windowsOverlap = (
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null
) => {
  if (!aStart || !aEnd || !bStart || !bEnd) {
    return false;
  }

  const aStartDate = new Date(aStart);
  const aEndDate = new Date(aEnd);
  const bStartDate = new Date(bStart);
  const bEndDate = new Date(bEnd);

  return aStartDate <= bEndDate && aEndDate >= bStartDate;
};

const TRIP_STATUS_OPTIONS = [
  "Unmatched (looking for matches)",
  "Matched and still looking",
  "Matched and satisfied"
] as const;

const TRIP_STATUS_STEPS = [
  {
    value: "Unmatched (looking for matches)",
    label: "Unmatched"
  },
  {
    value: "Matched and still looking",
    label: "Matched · Looking"
  },
  {
    value: "Matched and satisfied",
    label: "Matched · Done"
  }
] as const;

const MATCHED_TRIP_STATUS_OPTIONS = [
  "Matched and still looking",
  "Matched and satisfied"
] as const;

export default function TripsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusTripId = searchParams.get("tripId");
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [matchesByTrip, setMatchesByTrip] = useState<Record<string, MatchRecord[]>>({});
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [updatingTripId, setUpdatingTripId] = useState<string | null>(null);
  const [confirmingMatch, setConfirmingMatch] = useState<{
    tripId: string;
    matchId: string;
    matchName: string;
  } | null>(null);
  const [removingMatch, setRemovingMatch] = useState<{
    tripId: string;
    matchId: string;
    matchName: string;
  } | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const { data, error: userError } = await supabase.auth.getUser();

      if (userError || !data?.user) {
        router.replace("/login");
        return;
      }

      setEmail(data.user.email ?? "");
      const { data: profileData } = await supabase
        .from("profiles")
        .select("email,name,sex,major,graduation_year,phone,avatar_path")
        .eq("user_id", data.user.id)
        .single();
      setProfile(
        profileData
          ? {
              email: profileData.email,
              name: profileData.name ?? null,
              sex: profileData.sex ?? null,
              major: profileData.major ?? null,
              graduation_year: profileData.graduation_year ?? null,
              phone: profileData.phone ?? null,
              avatar_path: profileData.avatar_path ?? null
            }
          : null
      );
      setLoading(false);
      fetchTrips(data.user.email ?? "");
    };

    loadUser();
  }, [router]);

  useEffect(() => {
    if (!focusTripId || loading) {
      return;
    }

    const element = document.getElementById(`trip-${focusTripId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focusTripId, loading]);

  useEffect(() => {
    const fetchMatchesForTrips = async () => {
      if (!email || trips.length === 0 || !profile?.sex) {
        setMatchesByTrip({});
        return;
      }

      setLoadingMatches(true);

      const results = await Promise.all(
        trips.map(async (trip) => {
          const { data, error: matchError } = await supabase
            .from("trips")
            .select(
              "id,user_email,direction,flight_date,flight_time,allowed_partner_sex,trip_status,match_email_0,match_email_1,match_email_2,match_email_3,match_email_4,match_email_5,match_status_0,match_status_1,match_status_2,match_status_3,match_status_4,match_status_5,window_start,window_end,willing_to_wait_until_time,created_at"
            )
            .eq("direction", trip.direction)
            .eq("flight_date", trip.flight_date)
            .neq("user_email", email);

          if (matchError) {
            return [trip.id, []] as const;
          }

          const candidates = data ?? [];
          if (candidates.length === 0) {
            return [trip.id, []] as const;
          }
          const candidateEmails = candidates.map((candidate) => candidate.user_email);
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("email,name,sex,major,graduation_year,phone,avatar_path")
            .in("email", candidateEmails);

          const profileMap = new Map<string, ProfileRecord>();
          (profilesData ?? []).forEach((record) => {
            profileMap.set(record.email, {
              email: record.email,
              name: record.name ?? null,
              sex: record.sex ?? null,
              major: record.major ?? null,
              graduation_year: record.graduation_year ?? null,
              phone: record.phone ?? null,
              avatar_path: record.avatar_path ?? null
            });
          });

          const confirmedEmails = new Set(
            [0, 1, 2, 3, 4, 5]
              .map((slot) => {
                const emailKey = `match_email_${slot}` as keyof TripRecord;
                const statusKey = `match_status_${slot}` as keyof TripRecord;
                const emailValue = trip[emailKey];
                const statusValue = trip[statusKey];
                return statusValue === "matched" ? (emailValue as string | null) : null;
              })
              .filter(Boolean) as string[]
          );

          const enriched = candidates
            .map((candidate) => ({
              ...candidate,
              profile: profileMap.get(candidate.user_email) ?? null
            }))
            .sort((a, b) => {
              const aDiff = diffMinutes(trip.flight_date, trip.flight_time, a.flight_time);
              const bDiff = diffMinutes(trip.flight_date, trip.flight_time, b.flight_time);
              return aDiff - bDiff;
            });

          const confirmedCandidates = enriched.filter((candidate) =>
            confirmedEmails.has(candidate.user_email)
          );

          const potentialCandidates = enriched.filter((candidate) => {
            if (confirmedEmails.has(candidate.user_email)) {
              return false;
            }

            if (candidate.trip_status === "Matched and satisfied") {
              return false;
            }

            if (!windowsOverlap(trip.window_start, trip.window_end, candidate.window_start, candidate.window_end)) {
              return false;
            }

            const candidateProfile = candidate.profile;
            if (!candidateProfile?.sex) {
              return false;
            }

            const currentAllowsCandidate = allowsSex(
              trip.allowed_partner_sex,
              candidateProfile.sex
            );
            const candidateAllowsCurrent = allowsSex(candidate.allowed_partner_sex, profile.sex ?? "");

            return currentAllowsCandidate && candidateAllowsCurrent;
          });

          const paired = potentialCandidates.filter((candidate) => {
            for (let i = 0; i < 6; i += 1) {
              const emailKey = `match_email_${i}` as keyof MatchRecord;
              const statusKey = `match_status_${i}` as keyof MatchRecord;
              const matchedEmail = candidate[emailKey] as string | null;
              const matchedStatus = candidate[statusKey] as string | null;
              if (matchedStatus === "matched" && matchedEmail && !potentialCandidates.find((item) => item.user_email === matchedEmail)) {
                return false;
              }
            }
            return true;
          });

          const emailsInList = new Set(paired.map((candidate) => candidate.user_email));
          const finalList = paired.filter((candidate) => {
            for (let i = 0; i < 6; i += 1) {
              const emailKey = `match_email_${i}` as keyof MatchRecord;
              const statusKey = `match_status_${i}` as keyof MatchRecord;
              const matchedEmail = candidate[emailKey] as string | null;
              const matchedStatus = candidate[statusKey] as string | null;
              if (matchedStatus === "matched" && matchedEmail && emailsInList.has(matchedEmail)) {
                const pairedCandidate = paired.find((item) => item.user_email === matchedEmail);
                if (!pairedCandidate || !hasConfirmedMatchWith(pairedCandidate, candidate.user_email)) {
                  return false;
                }
              }
            }
            return true;
          });

          return [trip.id, [...confirmedCandidates, ...finalList]] as const;
        })
      );

      const mapped: Record<string, MatchRecord[]> = {};
      results.forEach(([tripId, matches]) => {
        mapped[tripId] = [...matches];
      });

      setMatchesByTrip(mapped);
      setLoadingMatches(false);
    };

    fetchMatchesForTrips();
  }, [email, trips]);

  const getMatchSlot = (trip: TripRecord, otherEmail: string) => {
    for (let i = 0; i < 6; i += 1) {
      const emailKey = `match_email_${i}` as keyof TripRecord;
      if (trip[emailKey] === otherEmail) {
        return i;
      }
    }
    return -1;
  };

  const getMatchStatus = (trip: TripRecord, otherEmail: string) => {
    const slot = getMatchSlot(trip, otherEmail);
    if (slot === -1) {
      return null;
    }
    const statusKey = `match_status_${slot}` as keyof TripRecord;
    return trip[statusKey] as string | null;
  };

  const hasConfirmedMatchWith = (trip: MatchRecord, otherEmail: string) => {
    for (let i = 0; i < 6; i += 1) {
      const emailKey = `match_email_${i}` as keyof MatchRecord;
      const statusKey = `match_status_${i}` as keyof MatchRecord;
      if (trip[emailKey] === otherEmail && trip[statusKey] === "matched") {
        return true;
      }
    }
    return false;
  };

  const buildMatchGroups = (matches: MatchRecord[]): MatchGroup[] => {
    const used = new Set<string>();
    const groups: MatchGroup[] = [];

    matches.forEach((candidate) => {
      if (used.has(candidate.user_email)) {
        return;
      }

      const partner = matches.find(
        (other) =>
          other.user_email !== candidate.user_email &&
          !used.has(other.user_email) &&
          hasConfirmedMatchWith(candidate, other.user_email) &&
          hasConfirmedMatchWith(other, candidate.user_email)
      );

      if (partner) {
        used.add(candidate.user_email);
        used.add(partner.user_email);
        groups.push({ kind: "pair", members: [candidate, partner] });
        return;
      }

      used.add(candidate.user_email);
      groups.push({ kind: "single", members: [candidate] });
    });

    return groups;
  };

  const fetchTrips = async (userEmail: string) => {
    if (!userEmail) {
      return;
    }

    setLoadingTrips(true);
    const { data, error: fetchError } = await supabase
      .from("trips")
      .select(
        "id,user_email,direction,flight_date,flight_time,allowed_partner_sex,trip_status,landed_status,meetup_status,match_email_0,match_email_1,match_email_2,match_email_3,match_email_4,match_email_5,match_status_0,match_status_1,match_status_2,match_status_3,match_status_4,match_status_5,willing_to_wait_until_time,min_hours_before,max_hours_before,window_start,window_end,created_at"
      )
      .eq("user_email", userEmail)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setLoadingTrips(false);
      return;
    }

    setTrips([...(data ?? [])]);
    setLoadingTrips(false);
  };

  const handleDeleteTrip = async (tripId: string) => {
    if (!email) {
      return;
    }

    const { error: deleteError } = await supabase
      .from("trips")
      .delete()
      .eq("id", tripId)
      .eq("user_email", email);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    fetchTrips(email);
  };

  const updateTripStatus = async (
    tripId: string,
    updates: Partial<Pick<TripRecord, "trip_status" | "landed_status" | "meetup_status">>
  ) => {
    if (!email) {
      return;
    }

    if (
      updates.trip_status &&
      MATCHED_TRIP_STATUS_OPTIONS.includes(updates.trip_status as string)
    ) {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        setError("We couldn't confirm your session. Please log in again.");
        return;
      }

      const response = await fetch("/api/trip-status-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ tripId, trip_status: updates.trip_status })
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data?.error || "Unable to sync trip status.");
        return;
      }

      fetchTrips(email);
      return;
    }

    setUpdatingTripId(tripId);
    const { error: updateError } = await supabase
      .from("trips")
      .update(updates)
      .eq("id", tripId)
      .eq("user_email", email);

    if (updateError) {
      setError(updateError.message);
      setUpdatingTripId(null);
      return;
    }

    fetchTrips(email);
    setUpdatingTripId(null);
  };

  const buildEmailSubject = (tripDate: string) => {
    return `Airport ride share – CMU trip on ${tripDate}`;
  };

  const buildEmailBody = (match: MatchRecord, trip: TripRecord) => {
    const tripTime = formatTime12h(normalizeTime(trip.flight_time));
    const formattedDate = formatDateLong(trip.flight_date);
    const directionPhrase =
      trip.direction === "Arriving to Pittsburgh"
        ? "arriving in Pittsburgh"
        : "departing from Pittsburgh";
    const routePhrase =
      trip.direction === "Arriving to Pittsburgh" ? "from the airport" : "to the airport";
    const matchName = match.profile?.name ?? "there";
    const currentName = profile?.name ?? "A fellow CMU student";

    return `Hi ${matchName},\n\nI saw that we matched on TartanTrips and that we’re both ${directionPhrase}\naround ${tripTime} on ${formattedDate}.\n\nWould you be interested in sharing a ride ${routePhrase}?\nIf so, I’m happy to coordinate details.\n\nBest,\n${currentName}\n`;
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (copyError) {
      setError("Unable to copy to clipboard. Please copy manually.");
    }
  };

  const requestMatch = async (tripId: string, matchedTripId: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      setError("We couldn't confirm your session. Please log in again.");
      return false;
    }

    const response = await fetch("/api/match-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        action: "request",
        tripId,
        matchedTripId
      })
    });

    if (!response.ok) {
      const data = await response.json();
      setError(data?.error || "Unable to request match.");
      return false;
    }

    return true;
  };

  const handleConfirmMatch = async () => {
    if (!confirmingMatch || !email) {
      return;
    }

    const { tripId, matchId } = confirmingMatch;
    const trip = trips.find((item) => item.id === tripId);
    const filledSlots = trip
      ? [0, 1, 2, 3, 4, 5].filter((slot) => {
          const key = `match_email_${slot}` as keyof TripRecord;
          return Boolean(trip[key]);
        }).length
      : 0;

    if (filledSlots >= 6) {
      setError("Rideshare services only allow up to 6 riders. That’s the maximum.");
      setConfirmingMatch(null);
      return;
    }
    const requested = await requestMatch(tripId, matchId);
    if (!requested) {
      return;
    }

    setConfirmingMatch(null);
    fetchTrips(email);
  };

  const updateMatchRequestStatus = async (
    tripId: string,
    matchedTripId: string,
    action: "withdraw" | "accept" | "deny" | "remove"
  ) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      setError("We couldn't confirm your session. Please log in again.");
      return;
    }

    const response = await fetch("/api/match-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        action,
        tripId,
        matchedTripId
      })
    });

    if (!response.ok) {
      const data = await response.json();
      setError(data?.error || "Unable to update match status.");
      return;
    }

    fetchTrips(email);
  };

  const leavePool = async (trip: TripRecord, poolMembers: MatchRecord[]) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      setError("We couldn't confirm your session. Please log in again.");
      return;
    }

    for (const member of poolMembers) {
      const response = await fetch("/api/match-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          action: "remove",
          tripId: trip.id,
          matchedTripId: member.id
        })
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data?.error || "Unable to remove match.");
        return;
      }
    }

    fetchTrips(email);
  };

  const handleJoinPool = async (trip: TripRecord, poolMembers: MatchRecord[]) => {
    if (!email) {
      return;
    }

    const filledSlots = [0, 1, 2, 3, 4, 5].filter((slot) => {
      const key = `match_email_${slot}` as keyof TripRecord;
      return Boolean(trip[key]);
    }).length;

    if (filledSlots + poolMembers.length > 6) {
      setError("Rideshare services only allow up to 6 riders. That’s the maximum.");
      return;
    }

    for (const member of poolMembers) {
      const success = await requestMatch(trip.id, member.id);
      if (!success) {
        return;
      }
    }

    fetchTrips(email);
  };

  const [futureTrips, pastTrips] = useMemo(() => {
    const now = new Date();
    const future: TripRecord[] = [];
    const past: TripRecord[] = [];

    trips.forEach((trip) => {
      const tripTime = toDateTimeEST(trip.flight_date, normalizeTime(trip.flight_time));
      if (!Number.isNaN(tripTime.getTime()) && tripTime < now) {
        past.push(trip);
      } else {
        future.push(trip);
      }
    });

    const sortByTime = (a: TripRecord, b: TripRecord) => {
      const aTime = toDateTimeEST(a.flight_date, normalizeTime(a.flight_time));
      const bTime = toDateTimeEST(b.flight_date, normalizeTime(b.flight_time));
      return aTime.getTime() - bTime.getTime();
    };

    future.sort(sortByTime);
    past.sort((a, b) => sortByTime(b, a));

    return [future, past];
  }, [trips]);

  const renderTripsList = (tripList: TripRecord[], emptyMessage: string) => {
    if (tripList.length === 0) {
      return <p className="mt-3 text-sm text-slate-600">{emptyMessage}</p>;
    }

    return (
      <div className="mt-4 space-y-4">
        {tripList.map((trip) => {
          const tripMatches = (matchesByTrip[trip.id] ?? []).slice().sort((a, b) => {
            const aDiff = diffMinutes(trip.flight_date, trip.flight_time, a.flight_time);
            const bDiff = diffMinutes(trip.flight_date, trip.flight_time, b.flight_time);
            return aDiff - bDiff;
          });
          const tripOwnerName = profile?.name ? `${profile.name}` : "Your trip";
          const hasConfirmedMatch = [0, 1, 2, 3, 4, 5].some((slot) => {
            const key = `match_status_${slot}` as keyof TripRecord;
            return trip[key] === "matched";
          });
          const completeCutoffTime = normalizeTime(
            trip.willing_to_wait_until_time || trip.flight_time
          );
          const tripComplete =
            !Number.isNaN(toDateTimeEST(trip.flight_date, completeCutoffTime).getTime()) &&
            toDateTimeEST(trip.flight_date, completeCutoffTime) < new Date();
          const derivedTripStatus = hasConfirmedMatch
            ? trip.trip_status === "Matched and satisfied"
              ? "Matched and satisfied"
              : "Matched and still looking"
            : "Unmatched (looking for matches)";
          const confirmedMatches = tripMatches.filter(
            (match) => getMatchStatus(trip, match.user_email) === "matched"
          );
          const potentialMatches = tripMatches.filter(
            (match) => getMatchStatus(trip, match.user_email) !== "matched"
          );
          const matchGroups = buildMatchGroups(potentialMatches);

          const renderMatchCard = (match: MatchRecord, isReadOnly = false) => (
            <div key={match.id} className="rounded-md border border-slate-200 bg-white p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-3">
                  <div className="h-12 w-12 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                    {match.profile?.avatar_path ? (
                      <img
                        src={
                          supabase.storage
                            .from("avatars")
                            .getPublicUrl(match.profile.avatar_path).data.publicUrl
                        }
                        alt={match.profile?.name || "Profile"}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {match.profile?.name || "CMU student"}
                    </p>
                    <p className="text-xs text-slate-600">
                      {match.direction} · {match.flight_date} at {normalizeTime(match.flight_time)}
                    </p>
                    <p className="text-xs text-slate-600">
                      Sex: {match.profile?.sex || "Not provided"}
                    </p>
                    <p className="text-xs text-slate-600">
                      Major: {match.profile?.major || "Not provided"} · Year:{" "}
                      {match.profile?.graduation_year || "N/A"}
                    </p>
                    <p className="text-xs text-slate-600">
                      Phone: {match.profile?.phone || "Not provided"}
                    </p>
                    <p className="text-xs text-slate-600">
                      Willing to wait until:{" "}
                      {match.willing_to_wait_until_time
                        ? formatTime12h(normalizeTime(match.willing_to_wait_until_time))
                        : "Not provided"}
                    </p>
                  </div>
                </div>
                {isReadOnly ? null : (
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-white"
                      onClick={() =>
                        setExpandedMatchId(expandedMatchId === match.id ? null : match.id)
                      }
                    >
                      Send an email
                    </button>
                    {(() => {
                      const status = getMatchStatus(trip, match.user_email);

                      if (!status) {
                        return (
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-white"
                            onClick={() =>
                              setConfirmingMatch({
                                tripId: trip.id,
                                matchId: match.id,
                                matchName: match.profile?.name || "this match"
                              })
                            }
                          >
                            Confirm match
                          </button>
                        );
                      }

                      if (status === "request_sent") {
                        return (
                          <>
                            <span className="rounded-md bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                              Match request sent
                            </span>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-white"
                              onClick={() =>
                                updateMatchRequestStatus(trip.id, match.id, "withdraw")
                              }
                            >
                              Withdraw match
                            </button>
                          </>
                        );
                      }

                      if (status === "request_received") {
                        return (
                          <>
                            <span className="rounded-md bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                              Match request received
                            </span>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-white"
                              onClick={() => updateMatchRequestStatus(trip.id, match.id, "accept")}
                            >
                              Accept match
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-white"
                              onClick={() => updateMatchRequestStatus(trip.id, match.id, "deny")}
                            >
                              Deny match
                            </button>
                          </>
                        );
                      }

                      if (status === "matched") {
                        return (
                          <>
                            <span className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                              Confirmed match!
                            </span>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-white"
                              onClick={() =>
                                setRemovingMatch({
                                  tripId: trip.id,
                                  matchId: match.id,
                                  matchName: match.profile?.name || "this match"
                                })
                              }
                            >
                              Remove match
                            </button>
                          </>
                        );
                      }

                      return null;
                    })()}
                  </div>
                )}
              </div>
              {!isReadOnly && expandedMatchId === match.id ? (
                <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <div className="flex flex-col gap-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-600">Email</p>
                      <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          type="text"
                          value={match.user_email}
                          readOnly
                          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                          onFocus={(event) => event.target.select()}
                        />
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-900 hover:bg-white"
                          onClick={() => handleCopy(match.user_email)}
                        >
                          Copy email
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-600">Message</p>
                      <textarea
                        readOnly
                        rows={6}
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-xs text-slate-900"
                        value={buildEmailBody(match, trip)}
                      />
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-900 hover:bg-white"
                          onClick={() => handleCopy(buildEmailBody(match, trip))}
                        >
                          Copy message
                        </button>
                        <a
                          className="inline-flex items-center justify-center rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-900 hover:bg-white"
                          href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
                            match.user_email
                          )}&su=${encodeURIComponent(buildEmailSubject(trip.flight_date))}&body=${encodeURIComponent(
                            buildEmailBody(match, trip)
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open in Gmail
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );

          return (
            <div
              key={trip.id}
              id={`trip-${trip.id}`}
              className="rounded-lg border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {tripOwnerName} · {trip.direction}
                  </p>
                  <p className="text-xs text-slate-600">
                    {trip.flight_date} at {normalizeTime(trip.flight_time)}
                  </p>
                  <p className="text-xs text-slate-600">
                    Partner filter: {trip.allowed_partner_sex}
                  </p>
                </div>
                <div className="flex gap-2">
                  {tripComplete ? null : (
                    <Link
                      className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-white"
                      href={`/plan?tripId=${trip.id}`}
                    >
                      Edit
                    </Link>
                  )}
                  <button
                    type="button"
                    className={`inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-xs font-medium ${
                      tripComplete
                        ? "border-slate-200 text-slate-400"
                        : "border-red-200 text-red-600 hover:bg-red-50"
                    }`}
                    onClick={() => {
                      if (tripComplete) {
                        return;
                      }
                      handleDeleteTrip(trip.id);
                    }}
                    disabled={tripComplete}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-200 pt-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Trip status
                  </label>
                  {tripComplete ? (
                    <p className="mt-2 text-sm font-semibold text-slate-700">Trip complete</p>
                  ) : (
                    <>
                      <div className="mt-2 w-full rounded-full border border-slate-200 bg-slate-100 p-1">
                        <div className="grid grid-cols-3 gap-1">
                          {TRIP_STATUS_STEPS.map((step) => {
                            const isActive = derivedTripStatus === step.value;
                            const isDisabled =
                              updatingTripId === trip.id ||
                              (!hasConfirmedMatch && step.value !== "Unmatched (looking for matches)") ||
                              (hasConfirmedMatch && step.value === "Unmatched (looking for matches)");

                            return (
                              <button
                                key={step.value}
                                type="button"
                                className={`rounded-full px-2 py-1.5 text-[11px] font-semibold transition ${
                                  isActive
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                                } ${isDisabled ? "cursor-not-allowed opacity-60" : ""}`}
                                onClick={() => {
                                  if (isDisabled) {
                                    return;
                                  }
                                  updateTripStatus(trip.id, { trip_status: step.value });
                                }}
                              >
                                {step.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {hasConfirmedMatch ? (
                        <p className="mt-2 text-xs text-slate-500">
                          Your matched status syncs with your match. If you&apos;re not aligned, remove the
                          match and find others instead.
                        </p>
                      ) : null}
                    </>
                  )}
                </div>

              {confirmedMatches.length > 0 ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Confirmed matches
                  </p>
                  {confirmedMatches.length > 1 ? (
                    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Pool
                          </p>
                          <p className="text-xs text-slate-500">
                            You&apos;re confirmed with multiple travelers.
                          </p>
                        </div>
                        {tripComplete ? null : (
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-white"
                            onClick={() => leavePool(trip, confirmedMatches)}
                          >
                            Leave pool
                          </button>
                        )}
                      </div>
                      <div className="mt-3 space-y-2">
                        {confirmedMatches.map((match) => renderMatchCard(match, tripComplete))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {confirmedMatches.map((match) => renderMatchCard(match, tripComplete))}
                    </div>
                  )}
                </div>
              ) : tripComplete ? (
                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  There were no confirmed matches for this trip.
                </div>
              ) : null}
                {derivedTripStatus === "Matched and satisfied" || tripComplete ? null : (
                  <>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Potential matches
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      When another traveler adds a trip that overlaps your time window, we’ll email
                      you a heads-up so you can connect quickly.
                    </p>
                    {loadingMatches ? (
                      <p className="mt-2 text-sm text-slate-600">Loading matches...</p>
                    ) : potentialMatches.length === 0 ? (
                      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                        <p className="text-base font-semibold">Don&apos;t worry!</p>
                        <p className="mt-1 text-sm text-emerald-900">
                          We&apos;ll keep an eye out and email you as soon as someone&apos;s trip lines up
                          with your window.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {matchGroups.map((group) => {
                          if (group.kind === "pair") {
                            const [first, second] = group.members;
                            const poolStatuses = [
                              getMatchStatus(trip, first.user_email),
                              getMatchStatus(trip, second.user_email)
                            ];
                            const poolMatched = poolStatuses.every((status) => status === "matched");
                            const poolHasAnyStatus = poolStatuses.some(Boolean);
                            const poolCanJoin = poolStatuses.every((status) => !status);
                            const groupKey = `pool-${first.user_email}-${second.user_email}`;

                            return (
                              <div
                                key={groupKey}
                                className="rounded-md border border-slate-200 bg-slate-50 p-3"
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                      Matched pool
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      These travelers already confirmed a match together.
                                    </p>
                                  </div>
                                  <div className="flex flex-col items-start gap-2 sm:items-end">
                                    {poolMatched ? (
                                      <span className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                                        Pool confirmed
                                      </span>
                                    ) : poolHasAnyStatus ? (
                                      <span className="text-xs text-slate-500">
                                        Pool confirmed once both accept.
                                      </span>
                                    ) : poolCanJoin ? (
                                      <>
                                        <button
                                          type="button"
                                          className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-white"
                                          onClick={() => handleJoinPool(trip, group.members)}
                                        >
                                          Join the pool
                                        </button>
                                        <span className="text-xs text-slate-500">
                                          Pool confirmed once both accept.
                                        </span>
                                      </>
                                    ) : null}
                                  </div>
                                </div>
                            <div className="mt-3 space-y-2">
                              {group.members.map((member) =>
                                renderMatchCard(member, tripComplete)
                              )}
                            </div>
                          </div>
                        );
                      }

                      const [solo] = group.members;
                      return (
                        <div key={solo.user_email}>
                          {renderMatchCard(solo, tripComplete)}
                        </div>
                      );
                    })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-12">
      {confirmingMatch ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-6">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-slate-900">Confirm match</h2>
            <p className="mt-2 text-sm text-slate-600">
              Confirm you have communicated with {confirmingMatch.matchName} and both parties have
              agreed to this match.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                onClick={() => setConfirmingMatch(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                onClick={handleConfirmMatch}
              >
                Confirm match
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {removingMatch ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-6">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-slate-900">Remove match</h2>
            <p className="mt-2 text-sm text-slate-600">
              This will remove the confirmed match with {removingMatch.matchName} for both parties.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                onClick={() => setRemovingMatch(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                onClick={() => {
                  updateMatchRequestStatus(removingMatch.tripId, removingMatch.matchId, "remove");
                  setRemovingMatch(null);
                }}
              >
                Remove match
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <AppNav />
          <h1 className="text-2xl font-semibold text-slate-900">My Trips</h1>
          {loading ? (
            <p className="text-sm text-slate-600">Loading your session...</p>
          ) : (
            <p className="text-sm text-slate-700">
              Signed in as <span className="font-medium">{email}</span>
            </p>
          )}
        </div>

        {loading ? null : (
          <div className="mt-6 space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Link
                className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                href="/plan"
              >
                Plan a trip
              </Link>
              <button
                type="button"
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
                onClick={() => fetchTrips(email)}
                disabled={loadingTrips}
              >
                {loadingTrips ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {error ? (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}

            <section className="border-t border-slate-200 pt-6">
              {loadingTrips ? (
                <p className="mt-3 text-sm text-slate-600">Loading trips...</p>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Upcoming trips</h2>
                    {renderTripsList(
                      futureTrips,
                      "No upcoming trips yet. Plan one to get started."
                    )}
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Past trips</h2>
                    {renderTripsList(pastTrips, "No past trips yet.")}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
