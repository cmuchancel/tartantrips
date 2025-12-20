"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

const SEX_OPTIONS = ["Male", "Female", "Non-binary"] as const;
const DIRECTION_OPTIONS = ["Arriving to Pittsburgh", "Departing Pittsburgh"] as const;
const PARTNER_OPTIONS = ["Any", "Male only", "Female only", "Non-binary only"] as const;

type TripFormState = {
  name: string;
  sex: string;
  direction: string;
  flightDate: string;
  flightTime: string;
  graduationYear: string;
  major: string;
  allowedPartnerSex: string;
  willingToWaitUntil: string;
  minHoursBefore: string;
  maxHoursBefore: string;
};

type TripRecord = {
  id: string;
  user_email: string;
  name: string;
  sex: string;
  direction: string;
  flight_date: string;
  flight_time: string;
  graduation_year: string | null;
  major: string | null;
  allowed_partner_sex: string;
  willing_to_wait_until_time: string | null;
  min_hours_before: number | null;
  max_hours_before: number | null;
  window_start: string | null;
  window_end: string | null;
  created_at: string;
};

const initialFormState: TripFormState = {
  name: "",
  sex: "",
  direction: "",
  flightDate: "",
  flightTime: "",
  graduationYear: "",
  major: "",
  allowedPartnerSex: "",
  willingToWaitUntil: "",
  minHoursBefore: "",
  maxHoursBefore: ""
};

const parseHours = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
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

const addHours = (dateValue: Date, hours: number) => {
  return new Date(dateValue.getTime() + hours * 60 * 60 * 1000);
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

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TripFormState>(initialFormState);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [matchesByTrip, setMatchesByTrip] = useState<Record<string, TripRecord[]>>({});
  const [loadingMatches, setLoadingMatches] = useState(false);

  const isArrival = form.direction === "Arriving to Pittsburgh";
  const isDeparture = form.direction === "Departing Pittsburgh";
  const allowedPartnerOptions = (() => {
    if (form.sex === "Male") {
      return ["Any", "Male only"];
    }
    if (form.sex === "Female") {
      return ["Any", "Female only"];
    }
    if (form.sex === "Non-binary") {
      return ["Any", "Non-binary only"];
    }
    return ["Any"];
  })();

  useEffect(() => {
    const loadUser = async () => {
      const { data, error: userError } = await supabase.auth.getUser();

      if (userError || !data?.user) {
        router.replace("/login");
        return;
      }

      setEmail(data.user.email ?? "");
      setLoading(false);
      fetchTrips(data.user.email ?? "");
    };

    loadUser();
  }, [router]);

  useEffect(() => {
    if (!allowedPartnerOptions.includes(form.allowedPartnerSex)) {
      setForm((prev) => ({ ...prev, allowedPartnerSex: "Any" }));
    }
  }, [allowedPartnerOptions, form.allowedPartnerSex]);

  useEffect(() => {
    const fetchMatchesForTrips = async () => {
      if (!email || trips.length === 0) {
        setMatchesByTrip({});
        return;
      }

      setLoadingMatches(true);

      const results = await Promise.all(
        trips.map(async (trip) => {
          const { data, error: matchError } = await supabase
            .from("trips")
            .select(
              "id,user_email,name,sex,direction,flight_date,flight_time,allowed_partner_sex,window_start,window_end,created_at"
            )
            .eq("direction", trip.direction)
            .eq("flight_date", trip.flight_date)
            .neq("user_email", email);

          if (matchError) {
            return [trip.id, []] as const;
          }

          const filtered = (data ?? []).filter((candidate) => {
            if (!windowsOverlap(trip.window_start, trip.window_end, candidate.window_start, candidate.window_end)) {
              return false;
            }

            const currentAllowsCandidate = allowsSex(trip.allowed_partner_sex, candidate.sex);
            const candidateAllowsCurrent = allowsSex(candidate.allowed_partner_sex, trip.sex);

            return currentAllowsCandidate && candidateAllowsCurrent;
          });

          return [trip.id, filtered] as const;
        })
      );

      const mapped: Record<string, TripRecord[]> = {};
      results.forEach(([tripId, matches]) => {
        mapped[tripId] = matches;
      });

      setMatchesByTrip(mapped);
      setLoadingMatches(false);
    };

    fetchMatchesForTrips();
  }, [email, trips]);

  const fetchTrips = async (userEmail: string) => {
    if (!userEmail) {
      return;
    }

    setLoadingTrips(true);
    const { data, error: fetchError } = await supabase
      .from("trips")
      .select(
        "id,user_email,name,sex,direction,flight_date,flight_time,graduation_year,major,allowed_partner_sex,willing_to_wait_until_time,min_hours_before,max_hours_before,window_start,window_end,created_at"
      )
      .eq("user_email", userEmail)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setLoadingTrips(false);
      return;
    }

    setTrips(data ?? []);
    setLoadingTrips(false);
  };

  const updateForm = (key: keyof TripFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validateAndComputeWindow = () => {
    const flightDate = form.flightDate;
    const flightTime = form.flightTime;
    const direction = form.direction;

    if (!flightDate || !flightTime || !direction) {
      return { error: "Please complete the required trip details." };
    }

    const flightDateTime = toDateTimeEST(flightDate, flightTime);

    if (Number.isNaN(flightDateTime.getTime())) {
      return { error: "Please enter a valid flight date and time." };
    }

    if (direction === "Arriving to Pittsburgh") {
      if (!form.willingToWaitUntil) {
        return { error: "Please enter how long you're willing to wait." };
      }

      const waitUntil = toDateTimeEST(flightDate, form.willingToWaitUntil);
      if (Number.isNaN(waitUntil.getTime())) {
        return { error: "Please enter a valid wait-until time." };
      }

      if (waitUntil < flightDateTime) {
        waitUntil.setDate(waitUntil.getDate() + 1);
      }

      return {
        windowStart: flightDateTime,
        windowEnd: waitUntil,
        willingToWaitUntil: form.willingToWaitUntil,
        minHoursBefore: null,
        maxHoursBefore: null
      };
    }

    const minHours = parseHours(form.minHoursBefore);
    const maxHours = parseHours(form.maxHoursBefore);

    if (!Number.isFinite(minHours) || !Number.isFinite(maxHours)) {
      return { error: "Please enter valid hour ranges for departures." };
    }

    if (minHours < 0 || maxHours < 0) {
      return { error: "Hours before flight must be positive." };
    }

    if (maxHours < minHours) {
      return { error: "Maximum hours before flight must be greater than minimum hours." };
    }

    const windowStart = addHours(flightDateTime, -maxHours);
    const windowEnd = addHours(flightDateTime, -minHours);

    return {
      windowStart,
      windowEnd,
      willingToWaitUntil: null,
      minHoursBefore: minHours,
      maxHoursBefore: maxHours
    };
  };

  const hasDuplicateTrip = () => {
    if (!form.direction || !form.flightDate) {
      return false;
    }

    return trips.some((trip) => {
      if (editingTripId && trip.id === editingTripId) {
        return false;
      }

      return trip.direction === form.direction && trip.flight_date === form.flightDate;
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!email) {
      setError("We couldn't confirm your session. Please log in again.");
      return;
    }

    if (hasDuplicateTrip()) {
      setError(
        "You already have a trip for this direction and date. Please edit the existing trip instead."
      );
      return;
    }

    const computed = validateAndComputeWindow();
    if (computed.error) {
      setError(computed.error);
      return;
    }

    setSaving(true);
    const payload = {
      user_email: email,
      name: form.name,
      sex: form.sex,
      direction: form.direction,
      flight_date: form.flightDate,
      flight_time: form.flightTime,
      graduation_year: form.graduationYear || null,
      major: form.major || null,
      allowed_partner_sex: form.allowedPartnerSex,
      willing_to_wait_until_time: computed.willingToWaitUntil,
      min_hours_before: computed.minHoursBefore,
      max_hours_before: computed.maxHoursBefore,
      window_start: computed.windowStart?.toISOString(),
      window_end: computed.windowEnd?.toISOString()
    };

    if (editingTripId) {
      const { error: updateError } = await supabase
        .from("trips")
        .update(payload)
        .eq("id", editingTripId)
        .eq("user_email", email);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }

      setSuccess("Trip updated.");
      setEditingTripId(null);
    } else {
      const { error: insertError } = await supabase.from("trips").insert(payload);

      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }

      setSuccess("Trip saved. We'll use these details for matching later.");
    }

    setForm(initialFormState);
    fetchTrips(email);
    setSaving(false);
  };

  const startEdit = (trip: TripRecord) => {
    setForm({
      name: trip.name,
      sex: trip.sex,
      direction: trip.direction,
      flightDate: trip.flight_date,
      flightTime: normalizeTime(trip.flight_time),
      graduationYear: trip.graduation_year ?? "",
      major: trip.major ?? "",
      allowedPartnerSex: trip.allowed_partner_sex,
      willingToWaitUntil: normalizeTime(trip.willing_to_wait_until_time),
      minHoursBefore: trip.min_hours_before?.toString() ?? "",
      maxHoursBefore: trip.max_hours_before?.toString() ?? ""
    });
    setEditingTripId(trip.id);
    setSuccess("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingTripId(null);
    setForm(initialFormState);
    setError("");
    setSuccess("");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/");
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

    if (editingTripId === tripId) {
      cancelEdit();
    }

    fetchTrips(email);
  };

  const dateLabel = isArrival ? "Arrival date" : "Departure date";
  const timeLabel = isArrival ? "Flight arrival time" : "Flight departure time";

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">
            TartanTrips Dashboard
          </h1>
          {loading ? (
            <p className="text-sm text-slate-600">Loading your session...</p>
          ) : (
            <p className="text-sm text-slate-700">
              Signed in as <span className="font-medium">{email}</span>
            </p>
          )}
        </div>

        {loading ? null : (
          <div className="mt-6 space-y-8">
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={email}
                    disabled
                    className="mt-1 w-full cursor-not-allowed rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700" htmlFor="name">
                    Name
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700" htmlFor="sex">
                    Sex / Gender
                  </label>
                  <select
                    id="sex"
                    name="sex"
                    value={form.sex}
                    onChange={(event) => updateForm("sex", event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
                    required
                  >
                    <option value="">Select one</option>
                    {SEX_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    className="block text-sm font-medium text-slate-700"
                    htmlFor="graduationYear"
                  >
                    Graduation year (optional)
                  </label>
                  <input
                    id="graduationYear"
                    name="graduationYear"
                    type="text"
                    value={form.graduationYear}
                    onChange={(event) => updateForm("graduationYear", event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700" htmlFor="major">
                    Major (optional)
                  </label>
                  <input
                    id="major"
                    name="major"
                    type="text"
                    value={form.major}
                    onChange={(event) => updateForm("major", event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700" htmlFor="direction">
                    Direction
                  </label>
                  <select
                    id="direction"
                    name="direction"
                    value={form.direction}
                    onChange={(event) => updateForm("direction", event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
                    required
                  >
                    <option value="">Select one</option>
                    {DIRECTION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700" htmlFor="flightDate">
                    {dateLabel}
                  </label>
                  <input
                    id="flightDate"
                    name="flightDate"
                    type="date"
                    value={form.flightDate}
                    onChange={(event) => updateForm("flightDate", event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700" htmlFor="flightTime">
                    {timeLabel}
                  </label>
                  <input
                    id="flightTime"
                    name="flightTime"
                    type="time"
                    value={form.flightTime}
                    onChange={(event) => updateForm("flightTime", event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    required
                  />
                </div>
              </div>

              {isArrival ? (
                <div>
                  <label
                    className="block text-sm font-medium text-slate-700"
                    htmlFor="willingToWaitUntil"
                  >
                    Willing to wait until
                  </label>
                  <input
                    id="willingToWaitUntil"
                    name="willingToWaitUntil"
                    type="time"
                    value={form.willingToWaitUntil}
                    onChange={(event) => updateForm("willingToWaitUntil", event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                    required
                  />
                </div>
              ) : null}

              {isDeparture ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label
                      className="block text-sm font-medium text-slate-700"
                      htmlFor="minHoursBefore"
                    >
                      Minimum hours before flight
                    </label>
                    <input
                      id="minHoursBefore"
                      name="minHoursBefore"
                      type="number"
                      min="0"
                      step="0.5"
                      value={form.minHoursBefore}
                      onChange={(event) => updateForm("minHoursBefore", event.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                      required
                    />
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium text-slate-700"
                      htmlFor="maxHoursBefore"
                    >
                      Maximum hours before flight
                    </label>
                    <input
                      id="maxHoursBefore"
                      name="maxHoursBefore"
                      type="number"
                      min="0"
                      step="0.5"
                      value={form.maxHoursBefore}
                      onChange={(event) => updateForm("maxHoursBefore", event.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                      required
                    />
                  </div>
                </div>
              ) : null}

              <div>
                <label
                  className="block text-sm font-medium text-slate-700"
                  htmlFor="allowedPartnerSex"
                >
                  Strict carpool eligibility (allowed partner sex)
                </label>
                <select
                  id="allowedPartnerSex"
                  name="allowedPartnerSex"
                  value={form.allowedPartnerSex}
                  onChange={(event) => updateForm("allowedPartnerSex", event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
                  required
                >
                  {allowedPartnerOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-500">
                  This is a strict filter. Matches outside this selection will be excluded.
                </p>
              </div>

              {error ? (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              ) : null}
              {success ? (
                <p className="text-sm text-green-600" role="status">
                  {success}
                </p>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={saving}
                >
                  {saving
                    ? editingTripId
                      ? "Updating..."
                      : "Saving..."
                    : editingTripId
                      ? "Update trip"
                      : "Save trip"}
                </button>
                {editingTripId ? (
                  <button
                    type="button"
                    className="w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                    onClick={cancelEdit}
                    disabled={saving}
                  >
                    Cancel edit
                  </button>
                ) : null}
                <button
                  type="button"
                  className="w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                  onClick={handleSignOut}
                >
                  Sign out
                </button>
              </div>
            </form>

            <section className="border-t border-slate-200 pt-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">My trips</h2>
                <button
                  type="button"
                  className="text-sm font-medium text-slate-600 hover:text-slate-900"
                  onClick={() => fetchTrips(email)}
                  disabled={loadingTrips}
                >
                  {loadingTrips ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              {loadingTrips ? (
                <p className="mt-3 text-sm text-slate-600">Loading trips...</p>
              ) : trips.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">
                  No trips yet. Submit the form above to add your first trip.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {trips.map((trip) => {
                    const tripMatches = matchesByTrip[trip.id] ?? [];

                    return (
                      <div
                        key={trip.id}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-col gap-1">
                            <p className="text-sm font-semibold text-slate-900">
                              {trip.name} · {trip.direction}
                            </p>
                            <p className="text-xs text-slate-600">
                              {trip.flight_date} at {normalizeTime(trip.flight_time)}
                            </p>
                            <p className="text-xs text-slate-600">
                              Partner filter: {trip.allowed_partner_sex}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-white"
                              onClick={() => startEdit(trip)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                              onClick={() => handleDeleteTrip(trip.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 border-t border-slate-200 pt-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Potential matches
                          </p>
                          {loadingMatches ? (
                            <p className="mt-2 text-sm text-slate-600">Loading matches...</p>
                          ) : tripMatches.length === 0 ? (
                            <p className="mt-2 text-sm text-slate-600">No matches yet.</p>
                          ) : (
                            <div className="mt-3 space-y-2">
                              {tripMatches.map((match) => (
                                <div
                                  key={match.id}
                                  className="rounded-md border border-slate-200 bg-white p-3"
                                >
                                  <p className="text-sm font-semibold text-slate-900">
                                    {match.name}
                                  </p>
                                  <p className="text-xs text-slate-600">
                                    {match.direction} · {match.flight_date} at {normalizeTime(match.flight_time)}
                                  </p>
                                  <p className="text-xs text-slate-600">Sex: {match.sex}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
