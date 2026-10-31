# Contributing to ezchrono

## Running the checks

```bash
bun run typecheck
bun run test
cd frontend && bun run check && bun run test:unit && bun run build
```

- Every behaviour change needs a test. A bug fix needs a test that fails without the fix.
- Format with Biome (`cd frontend && bunx biome check --write`).
- Add a line under `## [Unreleased]` in `CHANGELOG.md` for anything a user would notice.

## Branches and releases

Changes flow **feature branch → `dev` → `staging` → `main`**.

1. Branch from `dev` (`feat/…`, `fix/…`, `chore/…`) and open the PR against `dev`.
2. Promote `dev` to `staging`, then `staging` to `main`, each by PR.
3. To release, bump `version` in `package.json` and the matching `frontend/package.json` and `backend/package.json`. Move the Unreleased notes under a new `## [x.y.z] - YYYY-MM-DD` heading.
4. Tag `vX.Y.Z` on `main`. The release workflow checks the tag matches `package.json` and the changelog, runs the tests, pushes the Docker image and creates the GitHub release.
