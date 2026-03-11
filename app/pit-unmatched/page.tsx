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

const FORM_INPUT_CLASS =
  "mt-1 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 shadow-sm shadow-slate-900/5 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-200/60";

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
        setProfileNotice("Profile ready. We can use your saved details for live matching.");
      }
      setLoading(false);
    };

    loadUser();
  }, [router]);

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
    setProfileNotice("Profile ready. We can use your saved details for live matching.");
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
    const accessToken = await getAccessToken();

    if (!accessToken) {
      setSubmitError("We couldn't confirm your session. Please log in again.");
      return;
    }

    setSubmitting(true);
    const payload = {
      direction: "Arriving to Pittsburgh",
      flight_date: flightDate,
      flight_time: flightTime,
      allowed_partner_sex: "Any",
      willing_to_wait_until_time: willingToWaitUntil,
      min_hours_before: null,
      max_hours_before: null
    };

    const response = await fetch("/api/trips", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      setSubmitError(result?.error || "Unable to save your arrival window.");
      setSubmitting(false);
      return;
    }

    setSubmitSuccess("Your arrival window is saved. Looking for the best live matches...");
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
    <main className="page-shell">
      <div className="page-content space-y-6">
        <AppNav />

        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <section className="glass-panel rounded-[2.25rem] p-6 md:p-8">
            <div className="flex flex-col gap-2">
              <span className="section-chip">Live arrival help</span>
              <h1 className="mt-2 text-4xl font-semibold leading-tight text-slate-900 md:text-5xl">
                Already at PIT? We can still help you find a safer shared ride.
              </h1>
              {loading ? (
                <p className="mt-2 text-sm text-slate-600">Loading your session...</p>
              ) : (
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Signed in as <span className="font-semibold text-slate-900">{email}</span>. Tell
                  us how long you can wait and we will surface nearby CMU riders with overlapping
                  arrival windows.
                </p>
              )}
            </div>

            {loading ? null : (
              <div className="mt-8 space-y-6">
                {!profileSaved ? (
                  <div className="space-y-4 rounded-[1.8rem] border border-amber-200 bg-[#fff7ec] px-5 py-5 text-sm text-amber-900">
                    <p className="font-semibold text-amber-950">Create the profile riders will see</p>
                    <p className="leading-6">
                      We need this so live matching can work and so the person you may split a ride
                      with knows who they are coordinating with.
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
                      <button
                        type="submit"
                        className="primary-cta w-full disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={profileSaving}
                      >
                        {profileSaving ? "Saving profile..." : "Save profile for live matching"}
                      </button>
                    </form>
                  </div>
                ) : null}

                {profileSaved && profileNotice ? (
                  <div className="rounded-[1.6rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
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
                      className={FORM_INPUT_CLASS}
                      required
                    />
                  </div>

                  {submitError ? (
                    <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                      {submitError}
                    </p>
                  ) : null}
                  {submitSuccess ? (
                    <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
                      {submitSuccess}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    className="primary-cta w-full disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={submitting || !profileSaved}
                  >
                    {submitting ? "Saving..." : "Find my live matches"}
                  </button>
                </form>

                {hasSubmitted ? (
                  <>
                    <div className="border-t border-slate-200/70 pt-6">
                      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Riders already at the airport
                      </h2>
                      {loadingCandidates ? (
                        <p className="mt-3 text-sm text-slate-600">Loading matches...</p>
                      ) : nowCandidates.length === 0 ? (
                        <p className="mt-3 text-sm text-slate-600">No one landed within your window yet.</p>
                      ) : (
                        <div className="mt-3 space-y-3">
                          {nowCandidates.map((candidate) => (
                            <div key={candidate.id} className="rounded-[1.3rem] border border-slate-200 bg-white/70 p-4">
                              <p className="text-sm font-semibold text-slate-900">
                                {candidate.profile?.name || "CMU student"}
                              </p>
                              <p className="mt-1 text-xs text-slate-600">
                                Landed at {candidate.flight_time} on {candidate.flight_date}
                              </p>
                              <p className="mt-1 text-xs text-slate-600">
                                Major: {candidate.profile?.major || "Not provided"} · Year: {candidate.profile?.graduation_year || "N/A"}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="border-t border-slate-200/70 pt-6">
                      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Riders landing soon
                      </h2>
                      {loadingCandidates ? (
                        <p className="mt-3 text-sm text-slate-600">Loading matches...</p>
                      ) : soonCandidates.length === 0 ? (
                        <p className="mt-3 text-sm text-slate-600">No upcoming arrivals within your window yet.</p>
                      ) : (
                        <div className="mt-3 space-y-3">
                          {soonCandidates.map((candidate) => (
                            <div key={candidate.id} className="rounded-[1.3rem] border border-slate-200 bg-white/70 p-4">
                              <p className="text-sm font-semibold text-slate-900">
                                {candidate.profile?.name || "CMU student"}
                              </p>
                              <p className="mt-1 text-xs text-slate-600">
                                Arrives at {candidate.flight_time} on {candidate.flight_date}
                              </p>
                              <p className="mt-1 text-xs text-slate-600">
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
          </section>

          <aside className="space-y-6">
            <section className="glass-panel rounded-[2rem] p-6 md:p-8">
              <span className="section-chip">Why we verify first</span>
              <h2 className="mt-4 text-3xl font-semibold text-slate-900">
                Live matching still starts with trust.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-700">
                Even in a last-minute airport situation, we keep the same safety logic: verified
                identity, a real rider profile, and a clear arrival window.
              </p>
            </section>

            <section className="glass-panel rounded-[2rem] p-6 md:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                What this page is doing
              </p>
              <div className="mt-5 space-y-4">
                <div className="soft-card">
                  <p className="text-sm font-semibold text-slate-900">Security and safe rides</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Email verification helps make sure every live match still comes from a real
                    CMU rider.
                  </p>
                </div>
                <div className="soft-card">
                  <p className="text-sm font-semibold text-slate-900">Comfort before pickup</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Your profile gives both sides more confidence about who they are meeting in the
                    airport pickup flow.
                  </p>
                </div>
                <div className="soft-card">
                  <p className="text-sm font-semibold text-slate-900">Real-time filtering</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    We narrow the list to riders whose arrival times fit the wait window you set.
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
