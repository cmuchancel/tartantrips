"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

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

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getUser();
      setIsAuthenticated(Boolean(data?.user));
      setCheckingSession(false);
    };

    checkSession();
  }, []);

  return (
    <main className="page-shell">
      <div className="page-content space-y-6">
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
              <Link className="primary-cta" href={isAuthenticated ? "/home" : "/login"}>
                {checkingSession ? "Checking session..." : isAuthenticated ? "Open my dashboard" : "Verify my email"}
              </Link>
            </div>
          </div>
        </div>

        <section className="glass-panel overflow-hidden rounded-[2.4rem] p-6 md:p-8 lg:p-10">
          <div className="grid gap-8 xl:grid-cols-[1.03fr_0.97fr] xl:items-center">
            <div className="space-y-7">
              <span className="section-chip">Shared rides between PIT and CMU</span>
              <div className="space-y-5">
                <h1 className="display-title">
                  Too expensive to Uber between PIT and CMU?
                </h1>
                <p className="max-w-2xl text-xl leading-9 text-slate-700">
                  Ride with a trusted campusmate, split the cost, and feel better about who you
                  are meeting. TartanTrips matches verified CMU students using timing, profile fit,
                  and comfort filters built for real airport pickups.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link className="primary-cta" href={isAuthenticated ? "/plan" : "/login"}>
                  {isAuthenticated ? "Plan my next airport ride" : "Start with secure sign-in"}
                </Link>
                <Link className="secondary-cta" href="#how-it-works">
                  See how matching works
                </Link>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {HERO_POINTS.map((point) => (
                  <div key={point.title} className="info-card">
                    <p className="text-sm font-semibold text-slate-900">{point.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{point.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1.08fr_0.92fr]">
              <div className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-white/75 shadow-2xl shadow-slate-900/10 md:row-span-2">
                <Image
                  src="/landing/hero-ride-scene.svg"
                  alt="Students coordinating a shared ride from the airport to campus."
                  width={1200}
                  height={880}
                  className="h-full w-full object-cover"
                  priority
                />
                <div className="absolute inset-x-4 bottom-4 rounded-[1.4rem] bg-white/88 px-4 py-4 shadow-lg shadow-slate-900/10 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Built for the actual problem
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Late arrivals, early departures, awkward solo Ubers, and the question of who
                    you are getting in the car with.
                  </p>
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

              <div className="overflow-hidden rounded-[1.8rem] border border-white/80 bg-white/75 shadow-xl shadow-slate-900/10">
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
                  <Link className="primary-cta border border-white/10" href={isAuthenticated ? "/home" : "/login"}>
                    {checkingSession ? "Checking session..." : isAuthenticated ? "Open my dashboard" : "Verify my email"}
                  </Link>
                  <Link className="secondary-cta border-white/20 bg-white/10 text-white hover:bg-white/16" href={isAuthenticated ? "/profile" : "/login"}>
                    {isAuthenticated ? "Update my rider profile" : "See why profiles matter"}
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
