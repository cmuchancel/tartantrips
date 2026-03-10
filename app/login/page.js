"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

const CMU_EMAIL_REGEX = /@([a-z0-9-]+\.)*cmu\.edu$/i;
const ALLOW_ANY_EMAIL = process.env.NEXT_PUBLIC_ALLOW_ANY_EMAIL === "true";
const TRUST_REASONS = [
  {
    title: "Why we verify your email",
    description: "A confirmed CMU email helps keep ride requests inside a real student community and reduces anonymous or unsafe signups."
  },
  {
    title: "Why we ask for a profile",
    description: "Your profile gives our matching algorithm the context it needs to find better partners and helps riders feel more comfortable before they meet."
  }
];

const NEXT_STEPS = [
  "Enter your CMU email and we will send a secure magic link.",
  "Confirm the link from your inbox so your account stays tied to a verified identity.",
  "Finish your rider profile so we can match you based on trust and trip fit."
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const acceptMagicLink = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get("code");

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          setError(exchangeError.message);
          return;
        }

        router.replace("/home");
        return;
      }

      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (!accessToken || !refreshToken) {
        return;
      }

      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });

      if (setSessionError) {
        setError(setSessionError.message);
        return;
      }

      router.replace("/home");
    };

    acceptMagicLink();
  }, [router]);

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
      <div className="page-content">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
          <section className="glass-panel rounded-[2.25rem] p-8 md:p-10">
            <span className="section-chip">Verified access for safer rides</span>
            <h1 className="display-title mt-5">Verify your CMU email before you match.</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">
              TartanTrips uses email verification for account security and a safer ride community.
              When riders know every account is tied to a real CMU email, shared pickups feel far
              less risky.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {TRUST_REASONS.map((reason) => (
                <div key={reason.title} className="info-card">
                  <p className="text-sm font-semibold text-slate-900">{reason.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{reason.description}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-[1.75rem] bg-slate-900 px-6 py-6 text-slate-100 shadow-2xl shadow-slate-900/10">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                What happens next
              </p>
              <div className="mt-4 space-y-3">
                {NEXT_STEPS.map((step, index) => (
                  <div key={step} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f0bf9f]">
                      Step {index + 1}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-100">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="glass-panel rounded-[2.25rem] p-8 md:p-10">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Sign in
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">Get your secure magic link</h2>
            <p className="mt-3 text-base leading-7 text-slate-700">
              Use your CMU email to access verified ride matching. No password needed.
            </p>

            <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
              <label className="block text-sm font-medium text-slate-700" htmlFor="email">
                CMU email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 shadow-sm shadow-slate-900/5 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-200/60"
                placeholder="andrew@andrew.cmu.edu"
                required
              />

              {!ALLOW_ANY_EMAIL ? (
                <p className="text-xs leading-5 text-slate-500">
                  We only accept confirmed emails ending in <span className="font-semibold">.cmu.edu</span> on the consumer web flow.
                </p>
              ) : null}

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

            <div className="mt-8 rounded-[1.6rem] border border-slate-200 bg-white/60 p-5">
              <p className="text-sm font-semibold text-slate-900">Not ready to sign in yet?</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Review how TartanTrips helps riders coordinate safer shared trips before you join.
              </p>
              <Link className="secondary-cta mt-4 w-full" href="/">
                Back to overview
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
