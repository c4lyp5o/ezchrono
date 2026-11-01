# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Change password for signed-in users; admins can set a new password for any user from the admin console.
- Run history retention (`EZCHRONO_RUN_RETENTION_DAYS`, default 30 days; `0` keeps every run).

### Fixed
- The daily run quota now counts in-flight runs, so a burst of due jobs or concurrent "Run now" clicks can no longer exceed it.
- `?limit=` on run history and the admin job list: non-numeric values return the default instead of a 500, and negative values no longer bypass the row cap.
- A URL path with malformed percent-encoding returns 400 instead of 500.
- Two simultaneous signups for the same email return 409 instead of 500.
- The admin overview no longer counts quota skips as failed runs, and "runs, 24h" now means the same on every admin view.
- The default database path is anchored to the repository root instead of the caller's working directory.
- Failed sign-in counters are pruned instead of growing forever.

## [0.1.0] - 2026-11-01

### Added
- Multi-tenant job scheduling: users add, pause, run, edit and delete cron jobs that call a public HTTP(S) URL.
- Per-user quotas: maximum jobs, maximum runs per rolling 24 hours, and minimum interval between runs. Quota-skipped runs are recorded.
- Admin console: overview counts, all users with live quota usage, edit quotas, role, disable and delete, and a view of recent jobs across tenants.
- Run history per job with status, HTTP code, duration and error.
- Target guard: only http and https, no embedded credentials, no private, loopback, link-local or metadata addresses, no redirects, checked at creation and at every run.
- Session cookies (HMAC-signed, HttpOnly, SameSite=Strict), Argon2id password hashing, per-email lockout after 10 failures in 15 minutes.
- Sign-in backdrop in three.js, paused when the tab is hidden and static under reduced motion.
- Dockerfile, reusable test workflow, and a tag-driven release workflow.
