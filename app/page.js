"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const routeUser = async () => {
      const { data } = await supabase.auth.getUser();

      if (data?.user) {
        router.replace("/home");
        return;
      }

      router.replace("/login");
    };

    routeUser();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <p className="text-sm text-slate-600">Checking your session...</p>
    </main>
  );
}
