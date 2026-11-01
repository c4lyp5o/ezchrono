# ezchrono

A multi-tenant cron service. Users schedule HTTP calls on a cron expression and see every run. Admins see all tenants, their usage against quota, and can adjust limits.

- **Backend:** Bun, Elysia, `bun:sqlite`, croner.
- **Frontend:** Vite, React 19, motion, three.js.
- **Version:** 0.1.0 (see [CHANGELOG.md](CHANGELOG.md)).

## What it does not do

ezchrono calls URLs. It does not run shell commands, scripts or containers for tenants. Running arbitrary code for many tenants on one host is a different threat model, and this project does not take it on.

## Quick start

Requires Bun 1.4 or newer.

```bash
bun run install:all
EZCHRONO_ADMIN_EMAIL=you@example.com \
EZCHRONO_ADMIN_PASSWORD='a-long-passphrase' \
EZCHRONO_ALLOW_PRIVATE_TARGETS=1 \
EZCHRONO_OPEN_SIGNUP=1 \
bun run dev:backend     # API on :5100

bun run dev:frontend    # UI on :3100, proxies /api
```

Set `EZCHRONO_ALLOW_PRIVATE_TARGETS` only for local development. Never set it on a deployment that serves other people.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `5100` | HTTP port |
| `EZCHRONO_DB` | `data/ezchrono.db` (repo root) | SQLite file |
| `EZCHRONO_TZ` | `UTC` | Timezone for cron expressions |
| `EZCHRONO_TICK_MS` | `15000` | Scheduler interval |
| `EZCHRONO_RUN_RETENTION_DAYS` | `30` | Run history retention. `0` keeps runs forever |
| `EZCHRONO_ADMIN_EMAIL` / `_PASSWORD` | unset | Creates the first admin when none exists (password at least 10 characters) |
| `EZCHRONO_OPEN_SIGNUP` | off | `1` allows self sign-up. Off means accounts are created by an admin |
| `EZCHRONO_SECRET` | generated, stored in DB | Session signing key |
| `EZCHRONO_ALLOW_PRIVATE_TARGETS` | off | `1` disables the private address guard. Development only |

Default quota for new users: 5 jobs, 288 runs per 24 hours, 300 seconds minimum interval. Admins change these per user.

## Docker

```bash
cp compose.example.yml compose.yml   # set admin email and password
docker compose up -d
```

The image listens on 5100 and stores data under `/app/data`. The health check is `GET /api/v1/health`.

## Security notes

- Passwords are hashed with Argon2id. Login failures return the same message whether the email exists or not.
- Targets are checked before every call. DNS is resolved at check time, redirects are not followed, and the response body is discarded.
- Job and run reads and writes are scoped to the owner. Other tenants' IDs return 404.
- Session cookies are HttpOnly and SameSite=Strict. Set `NODE_ENV=production` behind HTTPS to add the Secure flag.
- Users can change their own password; admins can set a new password for any user. Sessions are signed tokens, so a cookie issued before the change stays valid until it expires (7 days).
- Known limit: the target check and the actual request resolve DNS separately, so a DNS rebinding attack with a very short TTL could slip through. Run ezchrono behind an egress firewall that also blocks private ranges for defence in depth.

## Tests and checks

```bash
bun run test          # backend tests
bun run typecheck     # backend types
cd frontend && bun run check && bun run test:unit && bun run build
```

CI runs the same checks. See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch flow and release steps.

## License

MIT. See [LICENSE](LICENSE).
