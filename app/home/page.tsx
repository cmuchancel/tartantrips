"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import AppNav from "../components/AppNav";

const PREFILL_DIRECTION_KEY = "tartantrips:prefill_direction";

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");

  useEffect(() => {
    const loadUser = async () => {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data?.user) {
        router.replace("/login");
        return;
      }

      setEmail(data.user.email ?? "");
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
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <AppNav />
          <h1 className="text-2xl font-semibold text-slate-900">Plan a trip</h1>
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
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className="w-full rounded-md bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800"
                onClick={() => handleChoice("Departing Pittsburgh")}
              >
                Departing Pittsburgh
              </button>
              <button
                type="button"
                className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
                onClick={() => handleChoice("Arriving to Pittsburgh")}
              >
                Arriving in Pittsburgh
              </button>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                Forgot to plan ahead? Didn&apos;t find a match in time?
              </p>
              <button
                type="button"
                className="mt-3 w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
                onClick={() => router.push("/pit-unmatched")}
              >
                Landed at PIT with no match
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
