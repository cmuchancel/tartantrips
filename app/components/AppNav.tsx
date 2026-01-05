"use client";

import Link from "next/link";

export default function AppNav() {
  return (
    <nav className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-600">
      <Link className="hover:text-slate-900" href="/home">
        Home
      </Link>
      <Link className="hover:text-slate-900" href="/plan">
        Plan a trip
      </Link>
      <Link className="hover:text-slate-900" href="/trips">
        My Trips
      </Link>
      <Link className="hover:text-slate-900" href="/profile">
        Profile
      </Link>
      <Link className="hover:text-slate-900" href="/pit-unmatched">
        Already at PIT?
      </Link>
    </nav>
  );
}
