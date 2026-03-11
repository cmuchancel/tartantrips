"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const CMU_EMAIL_REGEX = /@([a-z0-9-]+\.)*cmu\.edu$/i;
const ALLOW_ANY_EMAIL = process.env.NEXT_PUBLIC_ALLOW_ANY_EMAIL === "true";

const HERO_PILLS = [
  "Campus-only rider pool",
  "Security-first verification",
  "Profile-backed matching",
  "Comfort-aware ride filters"
];

const PROOF_STRIP = [
  {
    label: "Campus-only",
    text: "Verified CMU riders only"
  },
  {
    label: "Safer meetups",
    text: "Know who you are meeting"
  },
  {
    label: "Better matches",
    text: "Profiles help rank the best fit"
  },
  {
    label: "Less wasted fare",
    text: "Split the airport ride"
  }
];

const REASONS = [
  {
    title: "Why we verify email",
    body: "For security and safe rides. Every account starts with a confirmed CMU identity before it can join the ride pool."
  },
  {
    title: "Why we ask for a profile",
    body: "So our matching algorithm can find the best partner and so both riders feel more comfortable about who they are meeting."
  },
  {
    title: "Why it actually helps",
    body: "You stop paying the whole fare alone, stop coordinating with zero context, and get a ride flow that feels more thought through."
  }
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Explore first",
    body: "The front page explains the value before any login prompt, so the product feels like a real consumer website instead of a gated tool."
  },
  {
    step: "02",
    title: "Verify your CMU email",
    body: "We use email verification for account security and to keep ride sharing inside a trusted campus network."
  },
  {
    step: "03",
    title: "Create your profile and trip",
    body: "Your profile and trip details give the matching flow enough context to find riders who fit your timing and comfort preferences."
  }
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 px-4 py-6 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-xl rounded-[2.35rem] p-6 md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Sign in when you are ready
                </p>
                <h2 className="mt-3 text-3xl font-semibold text-slate-900">
                  Explore the site first. Log in only when you want to match.
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
              rides, and we use your profile so the matching algorithm can find the best ride
              partner and make airport pickup feel more comfortable.
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
                  It keeps ride sharing inside the real CMU community and makes first meetups feel safer.
                </p>
              </div>
              <div className="soft-card">
                <p className="text-sm font-semibold text-slate-900">Why profiles matter</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Profiles help our matching algorithm rank better partners and help both riders trust who they are meeting.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="page-content space-y-8 lg:space-y-10">
        <section className="glass-panel relative overflow-hidden rounded-[2.8rem]">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-14 top-20 h-44 w-44 rounded-full bg-[#efc6ad]/45 blur-3xl" />
            <div className="absolute right-8 top-10 h-48 w-48 rounded-full bg-[#bfe0dc]/45 blur-3xl" />
            <div className="absolute bottom-0 left-1/3 h-56 w-56 rounded-full bg-white/35 blur-3xl" />
          </div>

          <div className="relative z-10 p-5 md:p-6 lg:p-8 xl:p-9">
            <div className="flex flex-col gap-4 border-b border-white/60 pb-5 md:flex-row md:items-center md:justify-between">
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

            <div className="mt-6 grid gap-8 xl:grid-cols-[0.94fr_1.06fr] xl:items-center">
              <div className="space-y-6">
                <span className="section-chip">Built for PIT to CMU rides</span>
                <div className="space-y-4">
                  <h1 className="text-[clamp(3rem,5.2vw,5.6rem)] font-semibold leading-[0.9] tracking-[-0.06em] text-slate-900">
                    The airport ride that should not cost you the whole fare.
                  </h1>
                  <p className="max-w-2xl text-lg leading-8 text-slate-700 xl:text-[1.2rem]">
                    Too expensive to Uber between PIT and CMU? Ride with a trusted campusmate,
                    split the cost, and feel better about who you are meeting before pickup.
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

                <p className="text-sm leading-6 text-slate-500">
                  No password. Verified CMU email. Profile-backed matching. Better first meetups.
                </p>

                <div className="flex flex-wrap gap-2.5">
                  {HERO_PILLS.map((pill) => (
                    <span
                      key={pill}
                      className="rounded-full border border-white/80 bg-white/68 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600"
                    >
                      {pill}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.12fr_0.88fr]">
                <div className="relative min-h-[360px] overflow-hidden rounded-[2.2rem] border border-white/80 bg-white/75 shadow-2xl shadow-slate-900/10 lg:row-span-2">
                  <Image
                    src="/landing/hero-ride-scene.svg"
                    alt="Students coordinating a shared ride from the airport to campus."
                    width={1200}
                    height={880}
                    className="h-full w-full object-cover"
                    priority
                  />

                  <div className="absolute left-4 top-4 rounded-[1.2rem] bg-slate-900 px-4 py-3 text-white shadow-xl shadow-slate-900/20">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                      Solo airport ride
                    </p>
                    <p className="mt-1 text-lg font-semibold">You pay the whole fare.</p>
                  </div>

                  <div className="absolute bottom-4 left-4 right-4 rounded-[1.35rem] bg-white/90 px-4 py-4 shadow-lg shadow-slate-900/10 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      With TartanTrips
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      Split the ride with a verified campusmate and stop guessing who you are meeting.
                    </p>
                  </div>
                </div>

                <div className="rounded-[1.8rem] bg-slate-900 px-5 py-5 text-white shadow-2xl shadow-slate-900/15">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                    Why it feels better
                  </p>
                  <div className="mt-4 space-y-4">
                    <div className="rounded-[1.3rem] border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-sm font-semibold">Verified email first</p>
                      <p className="mt-1 text-sm leading-6 text-slate-200">
                        We do this for security and safe rides.
                      </p>
                    </div>
                    <div className="rounded-[1.3rem] border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-sm font-semibold">Profile-powered matching</p>
                      <p className="mt-1 text-sm leading-6 text-slate-200">
                        So our algorithm can find the best partner and both riders can feel more comfortable.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-[1.8rem] border border-white/80 bg-white/75 shadow-xl shadow-slate-900/10">
                  <Image
                    src="/landing/trust-check-scene.svg"
                    alt="Verified rider profile and trust check illustration."
                    width={760}
                    height={620}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] bg-slate-900 px-6 py-5 text-white shadow-2xl shadow-slate-900/10 md:px-8">
          <div className="grid gap-4 md:grid-cols-4">
            {PROOF_STRIP.map((item) => (
              <div key={item.label} className="rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                  {item.label}
                </p>
                <p className="mt-2 text-sm leading-6 text-white">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.94fr_1.06fr]">
          <div className="glass-panel rounded-[2.2rem] p-6 md:p-8">
            <span className="section-chip">Why students use it</span>
            <h2 className="mt-4 text-4xl font-semibold text-slate-900">
              Feels safer. Feels more worth it. Feels designed for the actual trip.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-700">
              This is not just a cheaper ride split. It is a more comfortable way to coordinate an
              airport pickup with someone who belongs to the same campus community.
            </p>

            <div className="mt-6 space-y-4">
              {REASONS.map((reason) => (
                <div key={reason.title} className="soft-card">
                  <p className="text-sm font-semibold text-slate-900">{reason.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{reason.body}</p>
                </div>
              ))}
            </div>
          </div>

          <section id="how-it-works" className="glass-panel rounded-[2.2rem] p-6 md:p-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <span className="section-chip">How it works</span>
                <h2 className="mt-4 text-4xl font-semibold text-slate-900">
                  A cleaner flow from landing page to airport pickup.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-slate-600">
                You should understand the product before you log in, and you should trust the ride before you book it.
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {HOW_IT_WORKS.map((step) => (
                <div key={step.step} className="soft-card min-h-[240px]">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c56b3a]">
                    Step {step.step}
                  </p>
                  <h3 className="mt-3 text-2xl font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{step.body}</p>
                </div>
              ))}
            </div>
          </section>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.06fr_0.94fr]">
          <div className="overflow-hidden rounded-[2.2rem] border border-white/70 bg-white/70 shadow-2xl shadow-slate-900/10">
            <Image
              src="/landing/split-fare-scene.svg"
              alt="Shared fare and ride split illustration."
              width={760}
              height={620}
              className="h-full w-full object-cover"
            />
          </div>

          <div className="glass-panel rounded-[2.2rem] p-6 md:p-8">
            <span className="section-chip">Ready when you are</span>
            <h2 className="mt-4 text-4xl font-semibold text-slate-900">
              Stop paying the whole airport ride alone.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-700">
              Start with your CMU email, build the rider profile people will trust, and let the
              matching flow do the hard part.
            </p>

            <div className="mt-6 flex flex-col gap-3">
              {isAuthenticated ? (
                <>
                  <Link className="primary-cta w-full" href="/home">
                    {checkingSession ? "Checking session..." : "Open my dashboard"}
                  </Link>
                  <Link className="secondary-cta w-full" href="/profile">
                    Update my rider profile
                  </Link>
                </>
              ) : (
                <>
                  <button type="button" className="primary-cta w-full" onClick={openLoginPrompt}>
                    {checkingSession ? "Checking session..." : "Open sign-in prompt"}
                  </button>
                  <button type="button" className="secondary-cta w-full" onClick={openLoginPrompt}>
                    Log in after exploring
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
