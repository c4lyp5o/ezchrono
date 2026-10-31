# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
