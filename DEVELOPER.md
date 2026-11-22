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

## Commands

| Task | Command |
| --- | --- |
| Install every package | `bun run install:all` |
| Run the test suite | `bun run test` |
| Lint with Biome | `bun run lint` |
| Apply Biome's safe fixes | `bun run lint:fix` |
| Build | `bun run build` |
| Type-check | `bun run typecheck` |
| Start in production (PM2 where configured) | `bun run start` |
| All checks | `bun run check` |

`bun run test` runs the backend `bun:test` suite (in-memory DB). Frontend unit tests: `cd frontend && bun run test:unit`. `bun run typecheck` type-checks the backend.

## Linting

[Biome](https://biomejs.dev) 2.6.8 is the only linter. It is pinned at the repo root, so run it from there: `bun run lint` checks, `bun run lint:fix` applies safe fixes. Configuration is `biome.json`; the root config only lints, while `frontend/biome.json` (a nested config) also enforces formatting there, and CI runs `bunx biome ci frontend`. CI runs the same command.

## Branches and releases

There are two long-lived branches:

| Branch | Role |
| --- | --- |
| `development` | Integration branch. Branch from it (`feat/…`, `fix/…`, `chore/…`) and open every PR against it. |
| `master` | Released code. Only `development` is merged into it, by PR. |

No other long-lived branches (`main`, `dev`, `staging`, …) are kept; delete feature branches once merged.

To release: bump the version in `package.json`, `backend/package.json` and `frontend/package.json`, move the `[Unreleased]` notes in `CHANGELOG.md` under `## [x.y.z] - YYYY-MM-DD`, then merge `development` into `master`. Every push to `master` runs `publish.yml`: `test.yml` first, then `ghcr.io/c4lyp5o/ezchrono:<version>`, `:latest` and `:sha-<commit>`. Tagging `vX.Y.Z` afterwards is optional: it checks the tag matches `package.json`, pushes `:<version>` and creates a GitHub Release from that version's changelog section. `development` publishes nothing.

Commits follow [Conventional Commits](https://www.conventionalcommits.org) (`fix(scope): …`) with a body that explains why. Add a `CHANGELOG.md` line under `[Unreleased]` for anything a user would notice. Every behaviour change needs a test; a bug fix needs one that fails without the fix.

## Docker

The image follows the ez standard Dockerfile: a Bun stage builds the frontend, then `oven/bun:1.4.5-alpine` runs the app as `bun` (uid 1000) with a `HEALTHCHECK` on `/api/v1/health`. Keep the Bun version in step with `bun-version` in `.github/workflows/`. `test.yml` builds the image, boots it and waits for healthy; do the same locally (`docker build -t ezchrono .`, then `docker run`) after changing the Dockerfile.

## Contributing

### Running the checks

```bash
bun run typecheck
bun run test
bun run lint && cd frontend && bun run test:unit && bun run build
```

- Every behaviour change needs a test. A bug fix needs a test that fails without the fix.
- Format the frontend with Biome from the root: `bunx biome check --write frontend`.
- Add a line under `## [Unreleased]` in `CHANGELOG.md` for anything a user would notice.

## Frontend

Vite + React 19, motion, three.js. Built into `../client`, which the backend serves. The dev server proxies `/api` to `EZCHRONO_API` (default `http://localhost:5100`).

Design notes: operator console, not a marketing page. Slate neutrals, one green accent for status and the primary action, Fira Sans for UI, Fira Code for schedules and URLs. No glass, no gradients. Motion is short and tied to state; reduced-motion users get static frames.
