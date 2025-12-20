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

  useEffect(() => {
    const loadUser = async () => {
      const { data, error: userError } = await supabase.auth.getUser();

      if (userError || !data?.user) {
        router.replace("/login");
        return;
      }

      setEmail(data.user.email ?? "");
      setLoading(false);
    };

    loadUser();
  }, [router]);

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
    setForm(initialFormState);
    setSaving(false);
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
          <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
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
                <label className="block text-sm font-medium text-slate-700" htmlFor="graduationYear">
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
                {saving ? "Saving..." : "Save trip"}
              </button>
              <button
                type="button"
                className="w-full rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                onClick={handleSignOut}
              >
                Sign out
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
