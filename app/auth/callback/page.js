"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const exchangeCode = async () => {
      const code = searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          router.replace("/login");
          return;
        }
      } else {
        const auth = supabase.auth;

        if (typeof auth.getSessionFromUrl === "function") {
          const { error } = await auth.getSessionFromUrl();

          if (error) {
            router.replace("/login");
            return;
          }
        } else {
          const hash = window.location.hash.replace(/^#/, "");
          const params = new URLSearchParams(hash);
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");

          if (accessToken && refreshToken && typeof auth.setSession === "function") {
            const { error } = await auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
            });

            if (error) {
              router.replace("/login");
              return;
            }
          } else {
            router.replace("/login");
            return;
          }
        }
      }

      router.replace("/home");
    };

    exchangeCode();
  }, [router, searchParams]);

  return null;
}

export default function AuthCallbackPage() {
  return (
    <main className="page-shell">
      <div className="page-content flex min-h-screen items-center justify-center">
        <div className="glass-panel rounded-[2rem] px-8 py-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Secure sign-in
          </p>
          <p className="mt-3 text-base text-slate-600">Signing you in...</p>
        </div>
        <Suspense fallback={null}>
          <AuthCallbackContent />
        </Suspense>
      </div>
    </main>
  );
}
