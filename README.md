# VoltaMail

VoltaMail is a standalone SaaS for AI-assisted outbound operations. It combines Gmail OAuth, lead imports, brand knowledge, template versioning, multi-provider AI draft generation, approval workflows, and bulk sending into one production-ready outreach workspace.

## SaaS capabilities

- Multi-tenant organizations, projects, roles, sessions, and audit logs.
- Gmail OAuth connection management with encrypted refresh tokens.
- Lead import and validation from CSV or source documents.
- Brand knowledge base with website, Google Doc, and manual source ingestion.
- AI template generation with OpenAI, OpenRouter, and Gemini provider support.
- Template versioning, active-version selection, chat iteration, and human approval.
- Bulk send orchestration with Gmail and per-lead outcomes.
- Redis-backed optional caching, request throttling, correlation IDs, and Sentry support.

## Architecture

```
apps/web              Next.js UI and NextAuth routes
apps/api              NestJS API, auth, Gmail, AI, lead, and template services
packages/database     Prisma schema, migrations, and generated client
packages/shared       Shared DTOs, Zod-style contracts, and SaaS launch metrics
```

## Local development

```bash
pnpm install --frozen-lockfile
pnpm db:start
pnpm --filter @email-automation/database db:push
pnpm dev
```

Use `.env.example` as the starting point. For local Docker Postgres, set:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/email_automation"
TOKEN_ENCRYPTION_KEY="$(openssl rand -hex 32)"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
NEXTAUTH_URL="http://localhost:3000"
API_BASE_URL="http://localhost:4000/api"
NEXT_PUBLIC_API_BASE_URL="http://localhost:4000/api"
```

## Required validation

```bash
pnpm lint
pnpm build
pnpm test
pnpm format
pnpm db:validate
```

## Deployment guide

### Prerequisites

- PostgreSQL connection string, preferably Neon pooled connection string.
- Vercel projects for both the web app and API.
- Google OAuth + Gmail OAuth credentials.
- At least one AI provider key (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY`).
- `TOKEN_ENCRYPTION_KEY` generated with `openssl rand -hex 32`.

### Environment variables

Populate the following variables in both Vercel projects unless marked web-only or API-only:

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `API_BASE_URL`
- `NEXT_PUBLIC_API_BASE_URL` (web only)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_API_KEY`
- `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_OAUTH_REDIRECT_URI`
- `TOKEN_ENCRYPTION_KEY`
- Optional: `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `REDIS_URL`, `SENTRY_DSN`

### Web app

1. Create a Vercel project rooted at `apps/web`.
2. Install command: `pnpm install --frozen-lockfile`.
3. Build command: `pnpm --filter @email-automation/web build`.
4. Set `NEXTAUTH_URL` to the deployed web URL.

### API

1. Create a Vercel project rooted at `apps/api`.
2. Install command: `pnpm install --frozen-lockfile`.
3. Build command: `pnpm --filter @email-automation/api build`.
4. Set `API_BASE_URL` and web `NEXT_PUBLIC_API_BASE_URL` to the deployed API `/api` prefix.
5. Run `pnpm --filter @email-automation/database db:migrate` against production after deploy.

## Governance

- See `CONTRIBUTING.md` for local workflow and PR checks.
- See `SECURITY.md` for secret-handling and vulnerability reporting.
- See `CODE_OF_CONDUCT.md` for community expectations.
