# Crypto-Scalper

A comprehensive cryptocurrency trading application with real-time market data, AI-powered trading signals, and paper trading capabilities.

## Run & Operate

- **Preview** (Recommended) — Select "Preview" workflow to run the mockup-sandbox web interface on port 3000
- **API Server** — `pnpm --filter @workspace/api-server run dev` — run the API server (requires PORT env var)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + TailwindCSS

## Web Preview

The main previewable web interface is the **mockup-sandbox** application. It provides:
- React component library with shadcn/ui components
- Trading chart components
- Market data visualization
- Paper trading interface

To run locally:
```bash
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/mockup-sandbox run dev
```

## Where things live

- `artifacts/api-server/` — Express API server
- `artifacts/mockup-sandbox/` — Main web preview application
- `artifacts/mobile/` — Expo mobile app
- `lib/api-zod/` — Zod schemas for API validation
- `lib/api-client-react/` — React hooks for API calls
- `lib/db/` — Drizzle ORM database schema

## Architecture decisions

- pnpm workspaces for monorepo management
- Catalog versions in pnpm-workspace.yaml for consistent dependency versions
- React 19 with strict TypeScript checking
- esbuild for fast production builds
- Vite for development with hot reload

## Gotchas

- PORT and BASE_PATH environment variables are required for dev server (defaults: PORT=3000, BASE_PATH="/")
- The mobile app requires Expo and is not directly previewable in web
- API server requires DATABASE_URL for database connections
- TypeScript errors in mobile artifact are pre-existing and tracked separately
