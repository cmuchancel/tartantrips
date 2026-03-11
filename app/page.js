"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const CMU_EMAIL_REGEX = /@([a-z0-9-]+\.)*cmu\.edu$/i;
const ALLOW_ANY_EMAIL = process.env.NEXT_PUBLIC_ALLOW_ANY_EMAIL === "true";

const HERO_POINTS = [
  {
    title: "Trusted campus-only access",
    description: "Every rider verifies a CMU email before entering the network, which makes shared rides feel much safer."
  },
  {
    title: "Split the airport fare",
    description: "Instead of eating the whole ride cost between PIT and campus, match with another student headed the same way."
  },
  {
    title: "Meet with context",
    description: "Profiles and matching details help both riders know who they are coordinating with before pickup."
  }
];

const STORY_CARDS = [
  {
    title: "Why it feels better than a random split",
    body: "TartanTrips keeps the network inside a verified CMU community, so the person sharing your ride is not just another stranger from the internet."
  },
  {
    title: "Why we ask for a profile",
    body: "Your profile helps our matching algorithm rank stronger partners and gives both riders more confidence before meeting in person."
  }
];

const HOW_IT_WORKS = [
  {
    label: "Verify your CMU email",
    body: "We do this for security and safe rides. It keeps the ride pool tied to real campus identities."
  },
  {
    label: "Create your rider profile",
    body: "This is how our matching algorithm finds the best partner and how future riders get comfortable meeting you."
  },
  {
    label: "Share your trip window",
    body: "We compare timing, wait tolerance, and comfort filters so you get matches that are practical, not random."
  }
];

const BENEFIT_STRIP = [
  "Too expensive to Uber between PIT and CMU?",
  "Ride with a trusted campusmate.",
  "Split the cost without guessing who you are meeting."
];

export default function LandingPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getUser();
      setIsAuthenticated(Boolean(data?.user));
      setCheckingSession(false);
    };

    checkSession();
  }, []);

  const openLoginPrompt = () => {
    setError("");
    setMessage("");
    setLoginOpen(true);
  };

  const closeLoginPrompt = () => {
    if (loading) {
      return;
    }

    setLoginOpen(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!ALLOW_ANY_EMAIL && !CMU_EMAIL_REGEX.test(normalizedEmail)) {
      setError("Please use a CMU email ending in .cmu.edu.");
      return;
    }

    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (signInError) {
      setError(signInError.message);
    } else {
      setMessage("Check your inbox. We sent a secure sign-in link to your CMU email.");
    }

    setLoading(false);
  };

  return (
    <main className="page-shell">
      {loginOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-6 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg rounded-[2.2rem] p-6 md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Sign in when you&apos;re ready
                </p>
                <h2 className="mt-3 text-3xl font-semibold text-slate-900">
                  Explore first. Log in only when you want to match.
                </h2>
              </div>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-white"
                onClick={closeLoginPrompt}
              >
                Close
              </button>
            </div>

            <p className="mt-4 text-base leading-7 text-slate-700">
              Use your CMU email to unlock verified matching. We verify email for security and safe
              rides, and we use your profile later so the algorithm can find the best ride partner.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="landingEmail">
                  CMU email
                </label>
                <input
                  id="landingEmail"
                  name="landingEmail"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 shadow-sm shadow-slate-900/5 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-200/60"
                  placeholder="andrew@andrew.cmu.edu"
                  required
                />
              </div>

              {error ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                  {error}
                </p>
              ) : null}
              {message ? (
                <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
                  {message}
                </p>
              ) : null}

              <button
                type="submit"
                className="primary-cta w-full disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading}
              >
                {loading ? "Sending..." : "Send secure login link"}
              </button>
            </form>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <div className="soft-card">
                <p className="text-sm font-semibold text-slate-900">Why email verification matters</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  It keeps ride matching inside a real CMU community and makes airport meetups feel safer.
                </p>
              </div>
              <div className="soft-card">
                <p className="text-sm font-semibold text-slate-900">Why profiles matter</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Profiles help our matching algorithm rank better partners and help riders trust who they are meeting.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="page-content space-y-8">
        <section className="flex flex-col gap-5 lg:min-h-[calc(100vh-4rem)]">
          <div className="glass-panel rounded-[2rem] p-5 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">TartanTrips</p>
                <p className="text-sm text-slate-600">
                  Safer, smarter shared rides between CMU students and PIT.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link className="secondary-cta" href="#how-it-works">
                  How it works
                </Link>
                {isAuthenticated ? (
                  <Link className="primary-cta" href="/home">
                    {checkingSession ? "Checking session..." : "Open my dashboard"}
                  </Link>
                ) : (
                  <button type="button" className="primary-cta" onClick={openLoginPrompt}>
                    {checkingSession ? "Checking session..." : "Sign in to start matching"}
                  </button>
                )}
              </div>
            </div>
          </div>

          <section className="glass-panel overflow-hidden rounded-[2.4rem] p-6 md:p-8 lg:flex-1 lg:p-8 xl:p-9">
            <div className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr] xl:items-center">
              <div className="flex flex-col justify-center space-y-5 lg:py-4">
                <span className="section-chip">Shared rides between PIT and CMU</span>
                <div className="space-y-4">
                  <h1 className="text-[clamp(2.7rem,4.7vw,4.9rem)] font-semibold leading-[0.92] tracking-[-0.055em] text-slate-900">
                    Too expensive to Uber between PIT and CMU?
                  </h1>
                  <p className="max-w-2xl text-lg leading-8 text-slate-700 xl:text-[1.18rem]">
                    Ride with a trusted campusmate, split the cost, and feel better about who you
                    are meeting. TartanTrips matches verified CMU students using timing, profile
                    fit, and comfort filters built for real airport pickups.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  {isAuthenticated ? (
                    <Link className="primary-cta" href="/plan">
                      Plan my next airport ride
                    </Link>
                  ) : (
                    <button type="button" className="primary-cta" onClick={openLoginPrompt}>
                      Start with secure sign-in
                    </button>
                  )}
                  <Link className="secondary-cta" href="#how-it-works">
                    See how matching works
                  </Link>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  {HERO_POINTS.map((point) => (
                    <div key={point.title} className="rounded-[1.35rem] border border-white/80 bg-white/65 px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">{point.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{point.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[1.1fr_0.9fr] lg:h-full">
                <div className="relative min-h-[280px] overflow-hidden rounded-[2rem] border border-white/80 bg-white/75 shadow-2xl shadow-slate-900/10 md:row-span-2 lg:min-h-[420px] xl:min-h-0">
                  <Image
                    src="/landing/hero-ride-scene.svg"
                    alt="Students coordinating a shared ride from the airport to campus."
                    width={1200}
                    height={880}
                    className="h-full w-full object-cover"
                    priority
                  />
                  <div className="absolute inset-x-4 bottom-4 rounded-[1.25rem] bg-white/88 px-4 py-3 shadow-lg shadow-slate-900/10 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Built for the actual problem
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-700">
                      Expensive solo rides, late arrivals, early departures, and not knowing who
                      you are meeting.
                    </p>
                  </div>
                </div>

                <div className="hidden overflow-hidden rounded-[1.8rem] border border-white/80 bg-white/75 shadow-xl shadow-slate-900/10 md:block">
                  <Image
                    src="/landing/trust-check-scene.svg"
                    alt="Verified rider profile and trust check illustration."
                    width={760}
                    height={620}
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="hidden overflow-hidden rounded-[1.8rem] border border-white/80 bg-white/75 shadow-xl shadow-slate-900/10 md:block">
                  <Image
                    src="/landing/split-fare-scene.svg"
                    alt="Shared fare and ride split illustration."
                    width={760}
                    height={620}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            </div>
          </section>
        </section>

        <section className="glass-panel rounded-[2rem] px-6 py-5 md:px-8">
          <div className="flex flex-col gap-3 text-center md:flex-row md:flex-wrap md:items-center md:justify-center md:gap-6">
            {BENEFIT_STRIP.map((item, index) => (
              <div key={item} className="flex items-center justify-center gap-3">
                {index > 0 ? <span className="hidden h-2 w-2 rounded-full bg-[#d17849] md:inline-flex" /> : null}
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">
                  {item}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[0.94fr_1.06fr] lg:items-start">
          <aside className="space-y-6">
            {STORY_CARDS.map((card) => (
              <section key={card.title} className="glass-panel rounded-[2rem] p-6 md:p-8">
                <span className="section-chip">Why students use it</span>
                <h2 className="mt-4 text-3xl font-semibold text-slate-900">{card.title}</h2>
                <p className="mt-4 text-base leading-7 text-slate-700">{card.body}</p>
              </section>
            ))}
          </aside>

          <section id="how-it-works" className="glass-panel rounded-[2.2rem] p-6 md:p-8 lg:p-10">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <span className="section-chip">How it works</span>
                <h2 className="mt-4 text-4xl font-semibold text-slate-900">
                  A safer ride flow from inbox to pickup.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-slate-600">
                The whole product is designed to reduce cost without making the ride feel sketchy.
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {HOW_IT_WORKS.map((step, index) => (
                <div key={step.label} className="soft-card min-h-[220px]">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c56b3a]">
                    Step {index + 1}
                  </p>
                  <h3 className="mt-3 text-2xl font-semibold text-slate-900">{step.label}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{step.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-[2rem] bg-slate-900 px-6 py-6 text-slate-100 shadow-2xl shadow-slate-900/10 md:px-8">
              <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr] md:items-center">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                    Ready to stop paying for the whole ride alone?
                  </p>
                  <p className="mt-3 text-lg leading-8 text-slate-100">
                    Start with your CMU email, create the profile riders will trust, and let the
                    matching flow find the best partner for your next airport trip.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  {isAuthenticated ? (
                    <>
                      <Link className="primary-cta border border-white/10" href="/home">
                        {checkingSession ? "Checking session..." : "Open my dashboard"}
                      </Link>
                      <Link className="secondary-cta border-white/20 bg-white/10 text-white hover:bg-white/16" href="/profile">
                        Update my rider profile
                      </Link>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="primary-cta border border-white/10"
                        onClick={openLoginPrompt}
                      >
                        {checkingSession ? "Checking session..." : "Open sign-in prompt"}
                      </button>
                      <button
                        type="button"
                        className="secondary-cta border-white/20 bg-white/10 text-white hover:bg-white/16"
                        onClick={openLoginPrompt}
                      >
                        Log in after exploring
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
