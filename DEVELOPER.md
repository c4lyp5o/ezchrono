# Developer notes

## Layout

```
backend/src/
  index.ts         entrypoint: admin bootstrap, scheduler loop, listen
  app.ts           Elysia app: error mapping, routes, SPA fallback
  config.ts        env-driven settings and default quota
  db.ts            SQLite open, migrations (PRAGMA user_version), settings
  http.ts          ApiError, current user, role guards
  session.ts       HMAC-signed session tokens
  ssrf.ts          public-target check
  schedule.ts      cron validation and minimum-interval enforcement
  runner.ts        performs a run, records it, scheduler tick
  routes/          auth, jobs, admin
backend/tests/     bun:test suite (in-memory DB, local fake target)
frontend/src/      React app: App, components/, api.js, format.js
```

## Scheduler

`tick()` runs every `EZCHRONO_TICK_MS`. It claims due jobs with a compare-and-set on `next_run_at`, so a second pass can't fire the same slot. Each run checks the owner's rolling 24-hour quota first. A skipped run is written with status `quota`.

## Migrations

Append a new string to `MIGRATIONS` in `db.ts`. Never edit one that has shipped.

## Adding a route

Put it in `routes/`, scope every query by `user_id` from `requireUser()`, and return 404 for rows the caller doesn't own.
