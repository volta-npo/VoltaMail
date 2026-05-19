# Contributing to VoltaMail

VoltaMail is a production SaaS for AI-assisted outreach. Keep changes small, tested, and safe for organizations that connect Gmail and store lead data.

## Local setup

```bash
pnpm install --frozen-lockfile
pnpm db:start
pnpm --filter @email-automation/database db:push
pnpm dev
```

## Required checks

Run these before opening a PR:

```bash
pnpm lint
pnpm build
pnpm test
pnpm format
pnpm db:validate
```

## Development standards

- Never commit real `.env` values, API keys, OAuth secrets, or Gmail tokens.
- Add Prisma migrations for schema changes; do not rely on `db:push` outside local development.
- Add tests for API services, shared contracts, and critical UI logic.
- Keep customer-facing docs in `README.md` or `docs/`; remove one-off debug notes once resolved.
- Treat AI output as user-reviewed drafts, not automatically approved communications.
