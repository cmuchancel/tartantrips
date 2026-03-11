# Vercel Deployment Settings

## Required Vercel Environment Variables

Add these in the Vercel project settings for Production, Preview, and Development as needed:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `NEXT_PUBLIC_ALLOW_ANY_EMAIL`
- `CRON_SECRET`

## Optional Environment Variables

- `NOTIFICATION_JOB_SECRET`
  - Optional manual trigger secret for `POST /api/notification-jobs/process`.
  - If you set it, manual callers can send `x-notification-job-secret: <value>`.
  - Vercel cron should use `CRON_SECRET`, not this header.

## Notification Job Scheduler

This repo now includes `vercel.json` with a daily cron:

- path: `/api/notification-jobs/process`
- schedule: `0 10 * * *`

That is a safe default for Hobby plans. If you upgrade and want faster retries, change the cron schedule.

## How Cron Auth Works

- Vercel cron calls the route with `GET`.
- Vercel sends `Authorization: Bearer <CRON_SECRET>`.
- The backend route accepts that bearer token for scheduled processing.

## Manual Processing

You can also trigger processing manually:

```bash
curl -X POST https://your-domain.vercel.app/api/notification-jobs/process \
  -H "Content-Type: application/json" \
  -H "x-notification-job-secret: YOUR_NOTIFICATION_JOB_SECRET" \
  -d '{"limit":25}'
```

Or with `CRON_SECRET` as bearer auth on the `GET` route:

```bash
curl https://your-domain.vercel.app/api/notification-jobs/process?limit=25 \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```
