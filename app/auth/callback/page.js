"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const exchangeCode = async () => {
      const code = searchParams.get("code");

      if (!code) {
        router.replace("/login");
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        router.replace("/login");
        return;
      }

      router.replace("/dashboard");
    };

    exchangeCode();
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="text-center">
        <p className="text-sm text-slate-600">Signing you in...</p>
      </div>
    </main>
  );
}
