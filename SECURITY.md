# Security Policy

VoltaMail handles lead data, Gmail OAuth credentials, and AI provider keys. Please report suspected vulnerabilities privately to `volta.npo@outlook.com`.

## Supported branches

Security fixes target `main` first.

## Handling sensitive data

- Store secrets only in Vercel, local `.env`, or an approved secret manager.
- `TOKEN_ENCRYPTION_KEY` must be a 64-character hex string and must not be rotated without a token migration plan.
- Gmail refresh tokens and provider keys must remain encrypted at rest.
- Do not include lead lists, customer data, screenshots with emails, OAuth payloads, or logs with tokens in issues or PRs.

## Baseline checks

Run:

```bash
pnpm lint
pnpm build
pnpm test
pnpm db:validate
```
