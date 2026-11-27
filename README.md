# Zai Agent

Internal-only AI agent command center for App Sites. Not a public chatbot.

## Architecture
- **App**: TanStack Start (React 19, Vite) — routes in `src/routes`, signed-in screens under `src/routes/_authenticated/`.
- **Backend**: Lovable Cloud (Postgres + auth). Roles (`admin`/`operator`/`viewer`) live in `user_roles`; every table has row-level security, and every server function re-checks the role (`enforceAccess` in `src/lib/workspace.functions.ts`).
- **AI**: Cloudflare Workers AI via a server-only provider (`src/lib/ai/`). Credentials are read from server environment variables only. Without them the app shows a "not configured" setup state; failures are stored as errors, never as assistant replies.
- **Approvals**: deletions and tasks flagged "requires approval" create approval requests that only admins can decide. Changes are recorded in audit logs by database triggers.

## Environment variables (server secrets)
| Name | Purpose |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account that runs Workers AI |
| `CLOUDFLARE_API_TOKEN` | API token with *Workers AI: Read/Run* permission |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Managed by Lovable Cloud |

Add Cloudflare values in Lovable → Project Settings → Secrets. Then, as an admin, open **Setup** and press **Test connection**; the integration is only marked configured if a real completion succeeds.

## Local development
```sh
bun install
bun run dev      # http://localhost:8080
bun run test     # vitest
bun run lint
bun run build
```

## Migrations
Schema changes go through Lovable's database migration workflow (files in `supabase/migrations`). Do not hand-edit applied migrations.

## First admin
An admin role is already assigned (verified Nov 2026). Admins grant other roles in **Settings**.

## Deployment
The app is deployed by Lovable's Publish button (Cloudflare Workers runtime). Self-hosting alternative:
1. **Vercel (frontend + server functions)**: import the repo, framework preset "Other", build `bun run build`, set the env vars above; TanStack Start needs its Vercel/Nitro target configured in `vite.config.ts`.
2. **Cloudflare**: alternatively deploy the built worker with `wrangler deploy`, setting `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` as `wrangler secret`s.
3. Add the deployed URL to the auth redirect URLs.

## Status
Not production-ready until Cloudflare secrets are added, the connection test passes, and signed-in end-to-end checks are done. Chat currently returns full replies (no token streaming in the UI yet).
