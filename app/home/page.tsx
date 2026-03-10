"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import AppNav from "../components/AppNav";

const PREFILL_DIRECTION_KEY = "tartantrips:prefill_direction";
const VALUE_POINTS = [
  {
    title: "Verified rider pool",
    description: "Every match starts with a confirmed CMU email, so you know your ride partner belongs in the community."
  },
  {
    title: "Smarter recommendations",
    description: "Your profile and trip window help us rank the best partner instead of showing every possible traveler."
  },
  {
    title: "More comfortable meetups",
    description: "Profiles, phone numbers, and saved details make it easier to trust the person you are coordinating with."
  }
];

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [profileComplete, setProfileComplete] = useState(false);
  const [profileName, setProfileName] = useState("");

  useEffect(() => {
    const loadUser = async () => {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data?.user) {
        router.replace("/login");
        return;
      }

      setEmail(data.user.email ?? "");
      const { data: profileData } = await supabase
        .from("profiles")
        .select("name,major,graduation_year,sex,phone")
        .eq("user_id", data.user.id)
        .single();

      setProfileName(profileData?.name ?? "");
      setProfileComplete(
        Boolean(
          profileData?.name &&
            profileData?.major &&
            profileData?.graduation_year &&
            profileData?.sex &&
            profileData?.phone
        )
      );
      setLoading(false);
    };

    loadUser();
  }, [router]);

  const handleChoice = (direction: "Arriving to Pittsburgh" | "Departing Pittsburgh") => {
    try {
      window.localStorage.setItem(PREFILL_DIRECTION_KEY, direction);
    } catch (storageError) {
      // If storage is blocked, continue without prefill.
    }
    router.push("/plan");
  };

  return (
    <main className="page-shell">
      <div className="page-content space-y-6">
        <AppNav />

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="glass-panel rounded-[2.25rem] p-8 md:p-10">
            <span className="section-chip">Consumer web dashboard</span>
            <h1 className="mt-5 text-4xl font-semibold leading-tight text-slate-900 md:text-5xl">
              Get a safer, better-matched ride to or from PIT.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">
              We use verified identity, profile data, and travel timing to help you find the best
              CMU rider for your trip, not just the nearest traveler with a similar flight date.
            </p>

            {loading ? (
              <p className="mt-6 text-sm text-slate-600">Loading your session...</p>
            ) : (
              <div className="mt-6 rounded-[1.7rem] border border-white/70 bg-white/65 px-5 py-4">
                <p className="text-sm text-slate-600">Signed in as</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{email}</p>
                <p className="mt-2 text-sm text-slate-600">
                  {profileComplete
                    ? `${profileName || "Your"} profile is ready, so matching can use your saved preferences and trust details.`
                    : "Finish your profile before planning so our matching algorithm can run and future ride partners can feel comfortable meeting you."}
                </p>
              </div>
            )}

            {loading ? null : (
              <>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <button type="button" className="primary-cta w-full" onClick={() => handleChoice("Departing Pittsburgh")}>
                    I&apos;m leaving Pittsburgh
                  </button>
                  <button type="button" className="secondary-cta w-full" onClick={() => handleChoice("Arriving to Pittsburgh")}>
                    I&apos;m arriving at PIT
                  </button>
                </div>

                <div className="mt-8 grid gap-3 md:grid-cols-3">
                  {VALUE_POINTS.map((point) => (
                    <div key={point.title} className="info-card">
                      <p className="text-sm font-semibold text-slate-900">{point.title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{point.description}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <aside className="space-y-6">
            <div className="glass-panel rounded-[2rem] p-6 md:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Your next step
              </p>
              <h2 className="mt-3 text-3xl font-semibold text-slate-900">
                {loading
                  ? "Preparing your account"
                  : profileComplete
                    ? "Plan your next shared ride"
                    : "Finish your rider profile"}
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-700">
                {loading
                  ? "We are checking your rider session."
                  : profileComplete
                    ? "Your profile is already doing the trust work. Add your trip window and review the best rider matches."
                    : "Profiles are not busywork here. They power better matching and help both students know who they are coordinating with."}
              </p>
              <Link className="secondary-cta mt-6 w-full" href={profileComplete ? "/plan" : "/profile"}>
                {profileComplete ? "Go to trip planner" : "Complete my profile"}
              </Link>
            </div>

            <div className="glass-panel rounded-[2rem] p-6 md:p-8">
              <span className="section-chip">Need a ride right now?</span>
              <h2 className="mt-4 text-3xl font-semibold text-slate-900">Already landed at PIT?</h2>
              <p className="mt-4 text-base leading-7 text-slate-700">
                If plans changed or you did not get matched in time, open the live arrival flow and
                we will look for riders who are already at the airport or landing soon.
              </p>
              <button type="button" className="primary-cta mt-6 w-full" onClick={() => router.push("/pit-unmatched")}>
                Open live arrival matching
              </button>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
