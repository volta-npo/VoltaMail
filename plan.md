# VoltaMail – Execution Plan

## 1. Guiding Principles
- **Speed to v1**: Deliver end-to-end “connect → import → generate → approve → send” flow within 8 weeks while leaving hooks for later enhancements.
- **Security & Compliance first**: Token handling, least-privileged scopes, auditability, and CAN-SPAM compliance are non-negotiable from the start.
- **Composable architecture**: Shared TypeScript types and utilities across app, API, and workers to reduce drift and simplify testing.
- **Observability baked-in**: Logging, metrics, and error tracking wired in with the first features to avoid retrofits.

## 2. Workstreams & Milestones

| Week | Milestone | Key Deliverables |
| --- | --- | --- |
| 1–2 | Foundation | Monorepo scaffold, auth baseline, org/project model, initial UI shell, CI |
| 3–4 | Gmail & Leads | OAuth handshake, secure token storage, CSV import pipeline, validation UI |
| 5–6 | AI & Campaigns | Template editor, generation worker, queue orchestration, scheduling |
| 7 | Compliance & Analytics | Unsubscribe flow, suppression, analytics dashboard MVP |
| 8–9 | Polishing | Reply polling (optional), A/B testing v1, branding, role-based access |
| 10 | Hardening | Security review, performance pass, backups, documentation |

## 3. Technical Stack Overview
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui component baseline.
- **Backend API**: NestJS + TypeScript, PostgreSQL via Prisma ORM, tRPC/REST hybrid for internal calls, Zod validation.
- **Worker**: BullMQ + Redis (Upstash/local), shared job schema package.
- **Infra**: Vercel (web), Fly.io (API/worker), Neon Postgres, AWS S3-compatible bucket, Doppler for secrets.
- **Testing**: Vitest for unit tests, Playwright for E2E, Prisma test harness, MSW for API mocking.
- **Observability**: Sentry, OpenTelemetry instrumentation, Prometheus exporters.

## 4. Slice Breakdown (High Level)
1. **Repo & Auth Foundation** *(Weeks 1–2)*
   - Monorepo setup, shared configs, lint/prettier, GitHub Actions CI.
   - DB schema for orgs/users/projects; email/password auth & Google OAuth for app login.
   - Basic Next.js shell with auth-protected routes and organization/project switcher scaffold.
2. **Gmail Connectivity**
   - Google Cloud project setup guidance; backend OAuth endpoints (`oauth/url`, `oauth/callback`).
   - Refresh token encryption with KMS abstraction; connection management UI.
   - Health indicator for connection status.
3. **Lead Import Pipeline**
   - File upload to object storage, CSV parsing, column mapping wizard.
   - Validation rules, dedupe, suppression cross-check.
   - Persist leads, surface import summary and errors.
4. **Template, Generation & Review**
   - Template CRUD, variable management, prompt presets.
   - Generation worker jobs, diff UI, approval workflows.
5. **Scheduling & Sending**
   - Throttling settings, business-hour windows, queue orchestration for sends.
   - Gmail API send (and optional draft mode) with idempotency + retries.
6. **Compliance & Analytics**
   - Unsubscribe landing page, suppression list uploads.
   - Analytics dashboards, exports, reply polling (optional).
7. **Hardening & Ops**
   - Role-based permissions, audit logs, observability dashboards, backups.

## 5. Current Sprint Goals (Week 1–2 Focus)
1. **Monorepo Scaffolding**
   - TurboRepo or pnpm workspace with packages: `web`, `api`, `worker`, `shared`.
   - Base dependencies, TypeScript configs, eslint/prettier, Husky & lint-staged.
   - CI pipeline running lint, typecheck, unit tests.
2. **Auth & Multi-Tenancy Foundation**
   - Database migrations for `users`, `organizations`, `projects`, `sessions`.
   - Auth service with bcrypt password hashing, JWT/NextAuth session handling.
   - Google sign-in (OAuth) for app access; session propagation to API.
   - Multi-tenant guard middleware on API routes and matching client context.
3. **UI Shell**
   - Sign-in/sign-up pages, onboarding wizard to create organization + project.
   - App layout with organization/project switcher placeholders and protected routes.

## 6. First Slice Definition
**Goal**: Deliver repo scaffolding with shared tooling plus baseline auth models and endpoints to enable login with email/password and Google OAuth, along with a minimal authenticated UI shell.

### Scope
- Initialize monorepo and package structure (`web`, `api`, `worker`, `shared`).
- Configure pnpm workspace, Turborepo, linting, formatting, and shared TS config.
- Set up Prisma schema covering `organizations`, `users`, `projects`, and `sessions`.
- Implement NestJS auth module with:
  - Email/password signup + login endpoints.
  - Google OAuth login (OAuth client placeholders, token validation stubs).
  - Multi-tenant context guard.
- Integrate Next.js `web` app with NextAuth (or custom handler) bridging to API.
- Minimal UI: auth pages, dashboard placeholder listing org/project info.
- CI workflow (GitHub Actions) running lint and typecheck for all packages.

### Out-of-Scope (Deferred)
- Worker package functionality beyond placeholder.
- Detailed RBAC roles, audit logging, Gmail-specific data models.
- Production-ready OAuth secrets/KMS integration (stub interface only).
- Complete design system and navigation polish.

### Acceptance Criteria
- `pnpm install`, `pnpm lint`, `pnpm test`, and `pnpm build` run successfully.
- Creating a user via API -> logging in via web works, session persists.
- Google OAuth flow reachable (dev credentials stubbed), logs in user when configured.
- Authenticated web dashboard shows org/project data seeded via migration or fixture.
- CI pipeline validates lint/typecheck on PR.

## 7. Dependencies & Open Questions
- **Secrets management**: Decide on development strategy for KMS abstraction (likely env-based stub until Doppler integration).
- **Session strategy**: Establish whether we lean on NextAuth with Credentials + Google providers or custom solution; plan assumes NextAuth with Prisma adapter shared across API and web.
- **OAuth credentials**: Need Google Cloud project with OAuth client IDs; placeholder env vars until available.
- **Hosting**: Determine deployment pipeline (Vercel/Fly) post-foundation.

## 8. Risk Mitigations for First Slice
- Use pnpm & Turborepo templates to avoid misconfigured workspace; include skeleton tests ensuring commands run in CI.
- Enforce TypeScript path aliases via shared tsconfig to prevent drift.
- Abstract Google token verification behind interface to allow later replacement with production-grade validation.
