"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/home", label: "Home" },
  { href: "/plan", label: "Plan a Trip" },
  { href: "/trips", label: "My Trips" },
  { href: "/profile", label: "Profile" },
  { href: "/pit-unmatched", label: "Already at PIT?" }
];

export default function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="glass-panel rounded-[2rem] p-4 md:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <Link className="flex items-center gap-3" href="/">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white shadow-lg shadow-slate-900/15">
            TT
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">TartanTrips</p>
            <p className="text-xs text-slate-500">Verified ride matching for CMU students</p>
          </div>
        </Link>

        <div className="flex flex-wrap gap-2">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-slate-900 text-white shadow-lg shadow-slate-900/15"
                    : "bg-white/70 text-slate-700 hover:bg-white hover:text-slate-900"
                }`}
                href={item.href}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
