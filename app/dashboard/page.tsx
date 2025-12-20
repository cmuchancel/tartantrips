"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

const SEX_OPTIONS = ["Male", "Female", "Non-binary"] as const;
const DIRECTION_OPTIONS = ["Arrival", "Departure"] as const;
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
  allowedPartnerSex: ""
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

  const fetchTrips = async (userEmail: string) => {
    if (!userEmail) {
      return;
    }

    setLoadingTrips(true);
    const { data, error: fetchError } = await supabase
      .from("trips")
      .select(
        "id,user_email,name,sex,direction,flight_date,flight_time,graduation_year,major,allowed_partner_sex,created_at"
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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!email) {
      setError("We couldn't confirm your session. Please log in again.");
      return;
    }

    setSaving(true);
    if (editingTripId) {
      const { error: updateError } = await supabase
        .from("trips")
        .update({
          name: form.name,
          sex: form.sex,
          direction: form.direction,
          flight_date: form.flightDate,
          flight_time: form.flightTime,
          graduation_year: form.graduationYear || null,
          major: form.major || null,
          allowed_partner_sex: form.allowedPartnerSex
        })
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
      const { error: insertError } = await supabase.from("trips").insert({
        user_email: email,
        name: form.name,
        sex: form.sex,
        direction: form.direction,
        flight_date: form.flightDate,
        flight_time: form.flightTime,
        graduation_year: form.graduationYear || null,
        major: form.major || null,
        allowed_partner_sex: form.allowedPartnerSex
      });

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
      flightTime: trip.flight_time,
      graduationYear: trip.graduation_year ?? "",
      major: trip.major ?? "",
      allowedPartnerSex: trip.allowed_partner_sex
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
                    Flight date
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
                    Flight time
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
              </div>

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
                  <option value="">Select one</option>
                  {PARTNER_OPTIONS.map((option) => (
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
                <div className="mt-4 space-y-3">
                  {trips.map((trip) => (
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
                            {trip.flight_date} at {trip.flight_time}
                          </p>
                          <p className="text-xs text-slate-600">
                            Partner filter: {trip.allowed_partner_sex}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-white"
                          onClick={() => startEdit(trip)}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
