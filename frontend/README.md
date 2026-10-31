# ezchrono frontend

Vite + React 19, motion, three.js. Built into `../client`, which the backend serves.

- `bun run dev` for the dev server (proxies `/api` to `EZCHRONO_API`, default `http://localhost:5100`).
- `bun run check` runs Biome. `bun run test:unit` runs the unit tests. `bun run build` produces the bundle.

Design notes: operator console, not a marketing page. Slate neutrals, one green accent for status and the primary action, Fira Sans for UI, Fira Code for schedules and URLs. No glass, no gradients. Motion is short and tied to state; reduced-motion users get static frames.
