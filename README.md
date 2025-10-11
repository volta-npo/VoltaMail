# VoltaMail

## Deployment Guide

### Prerequisites
- Neon connection string (already wired into `.env` files).
- Vercel projects for both the web app and API (Hobby tier is fine while usage stays light).
- `pnpm` installed locally.

### Environment Variables
Populate the following variables in both Vercel projects (web + API):
- `DATABASE_URL` (Neon pooled connection string; store only in Vercel/secret manager)
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `API_BASE_URL`
- `NEXT_PUBLIC_API_BASE_URL` (web only, points to the API’s `/api` prefix)
- Google OAuth credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_API_KEY`)
- Gmail OAuth credentials (`GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_OAUTH_REDIRECT_URI`)
- Any AI provider keys you intend to use (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`)
- `TOKEN_ENCRYPTION_KEY`

### Web App (Next.js)
1. In Vercel, create a new project pointing to `apps/web` as the root directory.
2. Build command: `pnpm --filter @email-automation/web build`
3. Install command: `pnpm install --frozen-lockfile`
4. Output: `.next`
5. Configure domains (e.g. `app.yourdomain.com`) and ensure `NEXTAUTH_URL` matches the deployed URL.

### API (NestJS on Vercel)
1. Create a second Vercel project pointing to `apps/api`.
2. Install command: `pnpm install --frozen-lockfile`
3. Build command: `pnpm --filter @email-automation/api build`
4. Vercel automatically detects the `api/` directory; the new `api/index.mjs` file wraps the NestJS express instance so requests to `/api/*` run through the serverless handler.
5. Set `API_BASE_URL` and `NEXT_PUBLIC_API_BASE_URL` in the web project to the deployed API URL (e.g. `https://voltamail-api.vercel.app/api`).
6. After the first deploy, run Prisma migrations via `pnpm --filter @email-automation/database db:migrate` locally (or wire a GitHub Action) pointing at the Neon database to keep schemas in sync.

### Local Development
1. Copy `.env.example` to `.env` (if not already) and ensure the Neon `DATABASE_URL` is present.
2. Start Postgres is no longer required locally; Prisma will connect directly to Neon.
3. Run `pnpm install`, then `pnpm dev` for the monorepo experience, or target individual apps with `pnpm --filter @email-automation/web dev` / `pnpm --filter @email-automation/api dev`.
# VoltaMail
