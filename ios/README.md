# TartanTrips iOS App

This folder contains a native SwiftUI iOS app that mirrors the core web flows:

- Magic-link login (Supabase)
- Profile management
- Trip planning (arrival/departure windows)
- My Trips with match actions (request/withdraw/accept/deny/remove)
- Trip status sync via `/api/trip-status-sync`
- Landed-at-PIT flow

## Structure

- `TartanTrips/` Swift source files
- `project.yml` XcodeGen project spec

## Setup

1. Install XcodeGen if needed:
   - `brew install xcodegen`
2. Generate Xcode project from this folder:
   - `cd ios`
   - `xcodegen generate`
3. Open `TartanTrips.xcodeproj`.
4. In `TartanTrips/Config/Info.plist`, set:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `API_BASE_URL` (set to your deployed Next.js app, for example `https://tartantrips.vercel.app`)
   - `MAGIC_LINK_REDIRECT_URL` (set to `${API_BASE_URL}/auth/confirm`, for example `https://tartantrips.vercel.app/auth/confirm`)
5. In Supabase Auth settings, add your confirmation page URL to allowed redirect URLs.
   - Example: `https://tartantrips.vercel.app/auth/confirm`
6. Build and run.

## Notes

- The app uses Supabase directly for table CRUD and uses your existing Next.js routes for match workflow/status sync.
- The confirmation page at `/auth/confirm` forwards the Supabase callback back into the `tartantrips://auth/callback` app scheme after showing a user-facing confirmation screen.
- If you switch back to local development later, remember that `127.0.0.1` only works in the iOS simulator, not on a physical iPhone.
- For production, move keys out of plaintext Info.plist and use xcconfig/CI secrets.
