"use client";

import { useEffect, useState } from "react";

const IOS_AUTH_CALLBACK_URL =
  process.env.NEXT_PUBLIC_IOS_AUTH_CALLBACK_URL || "tartantrips://auth/callback";

function buildAppLink(currentURL) {
  const appURL = new URL(IOS_AUTH_CALLBACK_URL);
  appURL.search = currentURL.search;
  appURL.hash = currentURL.hash;
  return appURL.toString();
}

export default function IOSAuthConfirmPage() {
  const [appLink, setAppLink] = useState(IOS_AUTH_CALLBACK_URL);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const currentURL = new URL(window.location.href);
    const searchParams = new URLSearchParams(currentURL.search);
    const hashParams = new URLSearchParams(currentURL.hash.replace(/^#/, ""));

    const authError =
      searchParams.get("error_description") ||
      hashParams.get("error_description") ||
      searchParams.get("error") ||
      hashParams.get("error");

    if (authError) {
      setErrorMessage(authError);
      return;
    }

    if (!currentURL.search && !currentURL.hash) {
      setErrorMessage("This confirmation link is missing sign-in data. Request a new link from the app.");
      return;
    }

    const nextAppLink = buildAppLink(currentURL);
    setAppLink(nextAppLink);

    const timer = window.setTimeout(() => {
      window.location.assign(nextAppLink);
    }, 600);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="page-shell">
      <div className="page-content flex min-h-screen items-center justify-center">
        <div className="glass-panel w-full max-w-md rounded-[2.25rem] p-8 text-center">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-slate-500">
            TartanTrips
          </p>
          <h1 className="mt-4 text-2xl font-semibold text-slate-900">
            {errorMessage ? "Confirmation failed" : "Email confirmed"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {errorMessage
              ? errorMessage
              : "Continue in the iPhone app to finish signing in. If it does not open automatically, use the button below."}
          </p>

          {!errorMessage ? (
            <a href={appLink} className="primary-cta mt-6 w-full">
              Open TartanTrips
            </a>
          ) : null}

          <p className="mt-4 text-xs leading-5 text-slate-500">
            If the app is already open, return to it and tap{" "}
            <span className="font-medium text-slate-700">I already tapped the link, refresh session</span>.
          </p>
        </div>
      </div>
    </main>
  );
}
