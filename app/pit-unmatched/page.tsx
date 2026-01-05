"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import AppNav from "../components/AppNav";

type ProfileData = {
  name: string;
  major: string;
  graduationYear: string;
  sex: string;
  phone: string;
  email: string;
};

type TripRecord = {
  id: string;
  user_email: string;
  direction: string;
  flight_date: string;
  flight_time: string;
  allowed_partner_sex: string;
  window_start: string | null;
  window_end: string | null;
  created_at: string;
};

type ProfileRecord = {
  email: string;
  name: string | null;
  sex: string | null;
  major: string | null;
  graduation_year: string | null;
};

type CandidateRecord = TripRecord & { profile?: ProfileRecord | null };

const initialProfileState: ProfileData = {
  name: "",
  major: "",
  graduationYear: "",
  sex: "",
  phone: "",
  email: ""
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

const formatDateEST = (dateValue: Date) => {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(dateValue);
};

const formatTimeEST = (dateValue: Date) => {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(dateValue);
};

const getNowEST = () => {
  const now = new Date();
  const dateValue = formatDateEST(now);
  const timeValue = formatTimeEST(now);
  return toDateTimeEST(dateValue, timeValue);
};

export default function PitUnmatchedPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData>(initialProfileState);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  const [waitMinutes, setWaitMinutes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const isProfileComplete = Boolean(
    profile.name &&
      profile.major &&
      profile.graduationYear &&
      profile.sex &&
      profile.phone &&
      (profile.email || email)
  );

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

      const nextProfile = {
        name: profileData?.name ?? "",
        major: profileData?.major ?? "",
        graduationYear: profileData?.graduation_year ?? "",
        sex: profileData?.sex ?? "",
        phone: profileData?.phone ?? "",
        email: profileData?.email ?? data.user.email ?? ""
      };

      setProfile(nextProfile);
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
        setProfileNotice("Profile information remembered.");
      }
      setLoading(false);
    };

    loadUser();
  }, [router]);

  const updateProfile = (key: keyof ProfileData, value: string) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const handleProfileSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileError("");

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

    setProfileSaved(true);
    setProfileNotice("Profile information saved.");
    setProfileSaving(false);
  };

  const loadCandidates = async (windowEnd: Date) => {
    if (!email) {
      return;
    }

    setLoadingCandidates(true);

    const dateValue = formatDateEST(windowEnd);
    const { data, error } = await supabase
      .from("trips")
      .select("id,user_email,direction,flight_date,flight_time,allowed_partner_sex,window_start,window_end,created_at")
      .eq("direction", "Arriving to Pittsburgh")
      .eq("flight_date", dateValue)
      .neq("user_email", email);

    if (error) {
      setLoadingCandidates(false);
      return;
    }

    const candidateList = data ?? [];
    if (candidateList.length === 0) {
      setCandidates([]);
      setLoadingCandidates(false);
      return;
    }

    const candidateEmails = candidateList.map((candidate) => candidate.user_email);
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("email,name,sex,major,graduation_year")
      .in("email", candidateEmails);

    const profileMap = new Map<string, ProfileRecord>();
    (profilesData ?? []).forEach((record) => {
      profileMap.set(record.email, {
        email: record.email,
        name: record.name ?? null,
        sex: record.sex ?? null,
        major: record.major ?? null,
        graduation_year: record.graduation_year ?? null
      });
    });

    const filtered = candidateList
      .map((candidate) => ({
        ...candidate,
        profile: profileMap.get(candidate.user_email) ?? null
      }))
      .filter((candidate) => {
        const candidateTime = toDateTimeEST(candidate.flight_date, candidate.flight_time);
        if (Number.isNaN(candidateTime.getTime())) {
          return false;
        }
        const cutoff = new Date(windowEnd.getTime() - 15 * 60 * 1000);
        return candidateTime <= cutoff;
      });

    setCandidates(filtered);
    setLoadingCandidates(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");
    setSubmitSuccess("");

    if (!profileSaved || !isProfileComplete) {
      setSubmitError("Please complete your profile before continuing.");
      return;
    }

    const minutes = Number(waitMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setSubmitError("Please enter how long you're willing to wait (in minutes)." );
      return;
    }

    const nowEST = getNowEST();
    const windowEnd = new Date(nowEST.getTime() + minutes * 60 * 1000);
    const flightDate = formatDateEST(nowEST);
    const flightTime = formatTimeEST(nowEST);
    const willingToWaitUntil = formatTimeEST(windowEnd);

    setSubmitting(true);
    const payload = {
      user_email: email,
      direction: "Arriving to Pittsburgh",
      flight_date: flightDate,
      flight_time: flightTime,
      allowed_partner_sex: "Any",
      willing_to_wait_until_time: willingToWaitUntil,
      min_hours_before: null,
      max_hours_before: null,
      window_start: nowEST.toISOString(),
      window_end: windowEnd.toISOString()
    };

    const { error: insertError } = await supabase.from("trips").insert(payload);

    if (insertError) {
      setSubmitError(insertError.message);
      setSubmitting(false);
      return;
    }

    setSubmitSuccess("We saved your arrival window. Looking for matches...");
    await loadCandidates(windowEnd);
    setHasSubmitted(true);
    setSubmitting(false);
  };

  const nowEST = useMemo(() => getNowEST(), []);

  const nowCandidates = candidates.filter((candidate) => {
    const candidateTime = toDateTimeEST(candidate.flight_date, candidate.flight_time);
    return candidateTime.getTime() <= nowEST.getTime();
  });

  const soonCandidates = candidates.filter((candidate) => {
    const candidateTime = toDateTimeEST(candidate.flight_date, candidate.flight_time);
    return candidateTime.getTime() > nowEST.getTime();
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <AppNav />
          <h1 className="text-2xl font-semibold text-slate-900">Landed at PIT</h1>
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
            {!profileSaved ? (
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                <p className="font-semibold">Complete your profile</p>
                <p>
                  Add your name, major, graduation year, sex, and phone so we can match you safely.
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
                        className="mt-1 w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900"
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
                        className="mt-1 w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900"
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
                        className="mt-1 w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900"
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
                        className="mt-1 w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900"
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
                        className="mt-1 w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900"
                        required
                      />
                    </div>
                  </div>
                  {profileError ? (
                    <p className="text-xs text-red-700" role="alert">
                      {profileError}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    className="w-full rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={profileSaving}
                  >
                    {profileSaving ? "Saving profile..." : "Save profile"}
                  </button>
                </form>
              </div>
            ) : null}

            {profileSaved && profileNotice ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {profileNotice}
              </div>
            ) : null}

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="waitMinutes">
                  How long are you willing to wait for a shared ride? (minutes)
                </label>
                <input
                  id="waitMinutes"
                  name="waitMinutes"
                  type="number"
                  min="1"
                  step="1"
                  value={waitMinutes}
                  onChange={(event) => setWaitMinutes(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
                  required
                />
              </div>

              {submitError ? (
                <p className="text-sm text-red-600" role="alert">
                  {submitError}
                </p>
              ) : null}
              {submitSuccess ? (
                <p className="text-sm text-green-600" role="status">
                  {submitSuccess}
                </p>
              ) : null}

              <button
                type="submit"
                className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={submitting || !profileSaved}
              >
                {submitting ? "Saving..." : "Find matches"}
              </button>
            </form>

            {hasSubmitted ? (
              <>
                <div className="border-t border-slate-200 pt-6">
                  <h2 className="text-sm font-semibold text-slate-900">People who are currently at the airport</h2>
                  {loadingCandidates ? (
                    <p className="mt-3 text-sm text-slate-600">Loading matches...</p>
                  ) : nowCandidates.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-600">No one landed within your window yet.</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {nowCandidates.map((candidate) => (
                        <div key={candidate.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                          <p className="text-sm font-semibold text-slate-900">
                            {candidate.profile?.name || "CMU student"}
                          </p>
                          <p className="text-xs text-slate-600">
                            Landed at {candidate.flight_time} on {candidate.flight_date}
                          </p>
                          <p className="text-xs text-slate-600">
                            Major: {candidate.profile?.major || "Not provided"} · Year: {candidate.profile?.graduation_year || "N/A"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-200 pt-6">
                  <h2 className="text-sm font-semibold text-slate-900">People who land soon</h2>
                  {loadingCandidates ? (
                    <p className="mt-3 text-sm text-slate-600">Loading matches...</p>
                  ) : soonCandidates.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-600">No upcoming arrivals within your window yet.</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {soonCandidates.map((candidate) => (
                        <div key={candidate.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                          <p className="text-sm font-semibold text-slate-900">
                            {candidate.profile?.name || "CMU student"}
                          </p>
                          <p className="text-xs text-slate-600">
                            Arrives at {candidate.flight_time} on {candidate.flight_date}
                          </p>
                          <p className="text-xs text-slate-600">
                            Major: {candidate.profile?.major || "Not provided"} · Year: {candidate.profile?.graduation_year || "N/A"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
