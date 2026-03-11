"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import AppNav from "../components/AppNav";

const PREFILL_DIRECTION_KEY = "tartantrips:prefill_direction";

type TripFormState = {
  direction: string;
  flightDate: string;
  flightTime: string;
  allowedPartnerSex: string;
  willingToWaitUntil: string;
  minHoursBefore: string;
  maxHoursBefore: string;
};

type TripRecord = {
  id: string;
  user_email: string;
  direction: string;
  flight_date: string;
};

type ProfileData = {
  name: string;
  major: string;
  graduationYear: string;
  sex: string;
  phone: string;
  email: string;
};

const initialFormState: TripFormState = {
  direction: "",
  flightDate: "",
  flightTime: "",
  allowedPartnerSex: "",
  willingToWaitUntil: "",
  minHoursBefore: "",
  maxHoursBefore: ""
};

const initialProfileState: ProfileData = {
  name: "",
  major: "",
  graduationYear: "",
  sex: "",
  phone: "",
  email: ""
};

const FORM_INPUT_CLASS =
  "mt-1 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 shadow-sm shadow-slate-900/5 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-200/60";

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

function PlanTripPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tripId = searchParams.get("tripId");

  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [form, setForm] = useState<TripFormState>(initialFormState);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileData>(initialProfileState);

  const isArrival = form.direction === "Arriving to Pittsburgh";
  const isDeparture = form.direction === "Departing Pittsburgh";
  const isProfileComplete = Boolean(
    profile.name &&
      profile.major &&
      profile.graduationYear &&
      profile.sex &&
      profile.phone &&
      (profile.email || email)
  );
  const hasCompleteProfile = profileSaved && isProfileComplete;
  const allowedPartnerOptions = (() => {
    if (profile.sex === "Male") {
      return ["Any", "Male only"];
    }
    if (profile.sex === "Female") {
      return ["Any", "Female only"];
    }
    if (profile.sex === "Non-binary") {
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

      setUserId(data.user.id);
      setEmail(data.user.email ?? "");

      const { data: profileData } = await supabase
        .from("profiles")
        .select("email,name,major,graduation_year,sex,phone")
        .eq("user_id", data.user.id)
        .single();

      setProfile({
        name: profileData?.name ?? "",
        major: profileData?.major ?? "",
        graduationYear: profileData?.graduation_year ?? "",
        sex: profileData?.sex ?? "",
        phone: profileData?.phone ?? "",
        email: profileData?.email ?? data.user.email ?? ""
      });
      const savedComplete = Boolean(
        profileData?.name &&
          profileData?.major &&
          profileData?.graduation_year &&
          profileData?.sex &&
          profileData?.phone &&
          (profileData?.email ?? data.user.email)
      );
      setProfileSaved(savedComplete);
      if (savedComplete) {
        setProfileNotice("Profile ready. Matching can use your saved details.");
      }
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
    if (loading || tripId) {
      return;
    }

    try {
      const prefill = window.localStorage.getItem(PREFILL_DIRECTION_KEY);
      if (prefill && (prefill === "Arriving to Pittsburgh" || prefill === "Departing Pittsburgh")) {
        setForm((prev) => ({ ...prev, direction: prefill }));
        window.localStorage.removeItem(PREFILL_DIRECTION_KEY);
      }
    } catch (storageError) {
      // If storage is blocked, skip prefill.
    }
  }, [loading, tripId]);

  useEffect(() => {
    if (tripId) {
      return;
    }

    if (isArrival) {
      setForm((prev) => ({
        ...prev,
        minHoursBefore: "",
        maxHoursBefore: ""
      }));
    } else if (isDeparture) {
      setForm((prev) => ({
        ...prev,
        willingToWaitUntil: ""
      }));
    }
  }, [isArrival, isDeparture, tripId]);

  useEffect(() => {
    if (!email || !tripId) {
      return;
    }

    const fetchTrip = async () => {
      setError("");
      const { data, error: fetchError } = await supabase
        .from("trips")
        .select(
          "id,user_email,direction,flight_date,flight_time,allowed_partner_sex,willing_to_wait_until_time,min_hours_before,max_hours_before"
        )
        .eq("id", tripId)
        .eq("user_email", email)
        .single();

      if (fetchError || !data) {
        setError(fetchError?.message || "Unable to load that trip.");
        return;
      }

      setForm({
        direction: data.direction,
        flightDate: data.flight_date,
        flightTime: normalizeTime(data.flight_time),
        allowedPartnerSex: data.allowed_partner_sex,
        willingToWaitUntil: normalizeTime(data.willing_to_wait_until_time),
        minHoursBefore: data.min_hours_before?.toString() ?? "",
        maxHoursBefore: data.max_hours_before?.toString() ?? ""
      });
      setEditingTripId(data.id);
    };

    fetchTrip();
  }, [email, tripId]);

  const fetchTrips = async (userEmail: string) => {
    if (!userEmail) {
      return;
    }

    const { data, error: fetchError } = await supabase
      .from("trips")
      .select("id,user_email,direction,flight_date")
      .eq("user_email", userEmail)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    setTrips([...(data ?? [])]);
  };

  const updateForm = (key: keyof TripFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateProfile = (key: keyof ProfileData, value: string) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const getAccessToken = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    return sessionData?.session?.access_token ?? "";
  };

  const handleProfileSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileError("");
    setProfileSuccess("");

    if (!isProfileComplete) {
      setProfileError("Please complete all required profile fields.");
      return;
    }

    if (!userId) {
      setProfileError("We couldn't confirm your session. Please log in again.");
      return;
    }

    setProfileSaving(true);
    const { error: updateError } = await supabase.from("profiles").upsert(
      {
        user_id: userId,
        email: profile.email || email,
        name: profile.name,
        major: profile.major,
        graduation_year: profile.graduationYear,
        sex: profile.sex,
        phone: profile.phone
      },
      { onConflict: "user_id" }
    );

    if (updateError) {
      setProfileError(updateError.message);
      setProfileSaving(false);
      return;
    }

    setProfileSuccess("Profile saved. You are ready for matching.");
    setProfileNotice("Profile ready. Matching can use your saved details.");
    setProfileSaved(true);
    setProfileSaving(false);
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

    if (!hasCompleteProfile) {
      setError("Please complete your profile before saving a trip.");
      return;
    }

    if (!email) {
      setError("We couldn't confirm your session. Please log in again.");
      return;
    }

    if (!form.direction) {
      setError("Please choose a direction to continue.");
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

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setError("We couldn't confirm your session. Please log in again.");
      return;
    }

    setSaving(true);
    const payload = {
      direction: form.direction,
      flight_date: form.flightDate,
      flight_time: form.flightTime,
      allowed_partner_sex: form.allowedPartnerSex || "Any",
      willing_to_wait_until_time: computed.willingToWaitUntil,
      min_hours_before: computed.minHoursBefore,
      max_hours_before: computed.maxHoursBefore
    };

    const endpoint = editingTripId ? `/api/trips/${editingTripId}` : "/api/trips";
    const response = await fetch(endpoint, {
      method: editingTripId ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      setError(result?.error || "Unable to save trip.");
      setSaving(false);
      return;
    }

    const savedTripId = result?.tripId || editingTripId;

    if (editingTripId) {
      setSuccess("Trip updated.");
      setEditingTripId(null);
    }

    setForm(initialFormState);
    fetchTrips(email);
    if (savedTripId) {
      router.replace(`/trips?tripId=${savedTripId}`);
    }
    setSaving(false);
  };

  const cancelEdit = () => {
    setEditingTripId(null);
    setForm(initialFormState);
    setError("");
    setSuccess("");
    router.replace("/plan");
  };

  const dateLabel = isArrival ? "Arrival date" : "Departure date";
  const timeLabel = isArrival ? "Flight arrival time" : "Flight departure time";

  return (
    <main className="page-shell">
      <div className="page-content space-y-6">
        <AppNav />

        <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
          <section className="glass-panel rounded-[2.25rem] p-6 md:p-8">
            <div className="flex flex-col gap-2">
              <span className="section-chip">Trip planning</span>
              <h1 className="mt-2 text-4xl font-semibold leading-tight text-slate-900 md:text-5xl">
                Tell us when you travel and who you would feel comfortable riding with.
              </h1>
              {loading ? (
                <p className="mt-2 text-sm text-slate-600">Loading your session...</p>
              ) : (
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Signed in as <span className="font-semibold text-slate-900">{email}</span>. We
                  use your trip timing, comfort filters, and verified profile to surface better
                  ride matches.
                </p>
              )}
            </div>

            {loading ? null : (
              <div className="mt-8 space-y-6">
                {!profileSaved ? (
                  <div className="space-y-4 rounded-[1.8rem] border border-amber-200 bg-[#fff7ec] px-5 py-5 text-sm text-amber-900">
                    <p className="font-semibold text-amber-950">Create the profile riders will see</p>
                    <p className="leading-6">
                      We need this so the matching algorithm can run and so your future ride
                      partner feels comfortable meeting you.
                    </p>
                    <form className="space-y-3" onSubmit={handleProfileSave}>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-amber-900" htmlFor="inlineName">
                            Name
                          </label>
                          <input
                            id="inlineName"
                            name="inlineName"
                            type="text"
                            value={profile.name}
                            onChange={(event) => updateProfile("name", event.target.value)}
                            className={FORM_INPUT_CLASS}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-amber-900" htmlFor="inlineMajor">
                            Major
                          </label>
                          <input
                            id="inlineMajor"
                            name="inlineMajor"
                            type="text"
                            value={profile.major}
                            onChange={(event) => updateProfile("major", event.target.value)}
                            className={FORM_INPUT_CLASS}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-amber-900" htmlFor="inlineGradYear">
                            Graduation year
                          </label>
                          <input
                            id="inlineGradYear"
                            name="inlineGradYear"
                            type="text"
                            value={profile.graduationYear}
                            onChange={(event) => updateProfile("graduationYear", event.target.value)}
                            className={FORM_INPUT_CLASS}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-amber-900" htmlFor="inlineSex">
                            Sex / Gender
                          </label>
                          <select
                            id="inlineSex"
                            name="inlineSex"
                            value={profile.sex}
                            onChange={(event) => updateProfile("sex", event.target.value)}
                            className={FORM_INPUT_CLASS}
                            required
                          >
                            <option value="">Select one</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Non-binary">Non-binary</option>
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-amber-900" htmlFor="inlinePhone">
                            Phone
                          </label>
                          <input
                            id="inlinePhone"
                            name="inlinePhone"
                            type="tel"
                            value={profile.phone}
                            onChange={(event) => updateProfile("phone", event.target.value)}
                            className={FORM_INPUT_CLASS}
                            required
                          />
                        </div>
                      </div>
                      {profileError ? (
                        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700" role="alert">
                          {profileError}
                        </p>
                      ) : null}
                      {profileSuccess ? (
                        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700" role="status">
                          {profileSuccess}
                        </p>
                      ) : null}
                      <button
                        type="submit"
                        className="primary-cta w-full disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={profileSaving}
                      >
                        {profileSaving ? "Saving profile..." : "Save profile for matching"}
                      </button>
                    </form>
                  </div>
                ) : null}

                {profileSaved && profileNotice ? (
                  <div className="rounded-[1.6rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    {profileNotice}
                  </div>
                ) : null}

                <form className="space-y-6" onSubmit={handleSubmit}>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Trip details
                    </p>
                    <p className="text-sm leading-6 text-slate-600">
                      Share your window so we can find a ride partner whose timing actually fits.
                    </p>
                  </div>
                  {editingTripId ? null : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        className={`rounded-full border px-4 py-3 text-sm font-semibold transition ${
                          isDeparture
                            ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                            : "border-slate-300 bg-white/80 text-slate-900 hover:bg-white"
                        }`}
                        onClick={() => updateForm("direction", "Departing Pittsburgh")}
                      >
                        Departing Pittsburgh
                      </button>
                      <button
                        type="button"
                        className={`rounded-full border px-4 py-3 text-sm font-semibold transition ${
                          isArrival
                            ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                            : "border-slate-300 bg-white/80 text-slate-900 hover:bg-white"
                        }`}
                        onClick={() => updateForm("direction", "Arriving to Pittsburgh")}
                      >
                        Arriving in Pittsburgh
                      </button>
                    </div>
                  )}
                  {form.direction ? (
                    <>
                      <div className="grid gap-4 md:grid-cols-2">
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
                            className={FORM_INPUT_CLASS}
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
                            className={FORM_INPUT_CLASS}
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
                            className={FORM_INPUT_CLASS}
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
                              className={FORM_INPUT_CLASS}
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
                              className={FORM_INPUT_CLASS}
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
                          Strict carpool eligibility
                        </label>
                        <select
                          id="allowedPartnerSex"
                          name="allowedPartnerSex"
                          value={form.allowedPartnerSex}
                          onChange={(event) => updateForm("allowedPartnerSex", event.target.value)}
                          className={FORM_INPUT_CLASS}
                          required
                        >
                          {allowedPartnerOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <p className="mt-2 text-xs text-slate-500">
                          This is a strict safety and comfort filter. Matches outside this
                          selection will be excluded.
                        </p>
                      </div>
                    </>
                  ) : null}

                  {error ? (
                    <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                      {error}
                    </p>
                  ) : null}
                  {success ? (
                    <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
                      {success}
                    </p>
                  ) : null}

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="submit"
                      className="primary-cta w-full disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={saving || !hasCompleteProfile}
                    >
                      {saving
                        ? editingTripId
                          ? "Updating..."
                          : "Saving..."
                        : editingTripId
                          ? "Update trip"
                          : "Save trip and start matching"}
                    </button>
                    {editingTripId ? (
                      <button
                        type="button"
                        className="secondary-cta w-full"
                        onClick={cancelEdit}
                        disabled={saving}
                      >
                        Cancel edit
                      </button>
                    ) : null}
                  </div>
                </form>

                <div className="border-t border-slate-200/70 pt-4">
                  <button
                    type="button"
                    className="secondary-cta w-full"
                    onClick={() => router.push("/trips")}
                  >
                    View my trips
                  </button>
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-6">
            <section className="glass-panel rounded-[2rem] p-6 md:p-8">
              <span className="section-chip">How we help</span>
              <h2 className="mt-4 text-3xl font-semibold text-slate-900">
                We match on timing, trust, and comfort.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-700">
                This planner compares your ride window, your hard comfort filters, and your
                verified rider profile so you see matches that make sense in real life.
              </p>
            </section>

            <section className="glass-panel rounded-[2rem] p-6 md:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Why we ask for this information
              </p>
              <div className="mt-5 space-y-4">
                <div className="soft-card">
                  <p className="text-sm font-semibold text-slate-900">Verified email</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Security starts with knowing each rider belongs to the CMU community.
                  </p>
                </div>
                <div className="soft-card">
                  <p className="text-sm font-semibold text-slate-900">Profile details</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Your profile powers the matching algorithm and helps other riders feel more
                    comfortable before meeting.
                  </p>
                </div>
                <div className="soft-card">
                  <p className="text-sm font-semibold text-slate-900">Trip window</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Flight time and wait tolerance help us avoid weak matches that would fall apart
                    at pickup.
                  </p>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function PlanTripPage() {
  return (
    <Suspense
      fallback={
        <main className="page-shell">
          <div className="page-content flex min-h-screen items-center justify-center">
            <p className="text-sm text-slate-600">Loading trip planner...</p>
          </div>
        </main>
      }
    >
      <PlanTripPageContent />
    </Suspense>
  );
}
