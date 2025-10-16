# Environment Variables Documentation

This document provides comprehensive documentation for all environment variables used in the Email Automation platform.

---

## 📋 Table of Contents

- [API (Backend)](#api-backend)
- [Web (Frontend)](#web-frontend)
- [Database](#database)
- [Quick Setup](#quick-setup)

---

## 🔧 API (Backend)

### Core Configuration

```bash
# Server Port
PORT=4000
# The port the API server listens on (default: 4000)

# Node Environment
NODE_ENV=development
# Options: development, production, test

# Global API Prefix
NEST_GLOBAL_PREFIX=api
# URL prefix for all API routes (default: "api")
```

### Database

```bash
# PostgreSQL Connection
DATABASE_URL="postgresql://username:password@host:5432/database_name"
# Required: Full PostgreSQL connection string
# Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE
# Example (local): postgresql://postgres:postgres@localhost:5432/email_automation
# Example (Neon): postgresql://user:pass@ep-xxx-xxx.us-east-1.aws.neon.tech/neondb
```

### Authentication & Security

```bash
# NextAuth Configuration
NEXTAUTH_SECRET="your-secret-key-here"
# Required: Random string for session encryption (generate with: openssl rand -base64 32)

NEXTAUTH_URL="http://localhost:3000"
# Required: Base URL of your web application

# Token Encryption
TOKEN_ENCRYPTION_KEY="your-encryption-key-here"
# Required: 32-byte key for encrypting sensitive tokens (Gmail refresh tokens, etc.)
# Generate with: openssl rand -hex 32
```

### CORS Configuration

```bash
# Web Application URL
WEB_APP_URL="http://localhost:3000"
# Default: http://localhost:3000

# Multiple CORS Origins (comma-separated)
CORS_ORIGIN="http://localhost:3000,http://localhost:3001"
# Optional: Override CORS allowed origins (defaults to localhost:3000-3001)

# Application Base URL
APP_BASE_URL="http://localhost:3000"
# Used for OAuth redirects and email links
```

### Google OAuth (Gmail Integration)

```bash
# Google Client Credentials
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
# Required for Gmail OAuth: Get from Google Cloud Console

GOOGLE_CLIENT_SECRET="your-google-client-secret"
# Required for Gmail OAuth: Get from Google Cloud Console

GOOGLE_API_KEY="your-google-api-key"
# Optional: For additional Google API features

# Gmail OAuth (can override Google OAuth)
GMAIL_OAUTH_CLIENT_ID="your-gmail-client-id.apps.googleusercontent.com"
# Optional: Defaults to GOOGLE_CLIENT_ID

GMAIL_OAUTH_CLIENT_SECRET="your-gmail-client-secret"
# Optional: Defaults to GOOGLE_CLIENT_SECRET

GMAIL_OAUTH_REDIRECT_URI="http://localhost:4000/api/v1/gmail/oauth/callback"
# Optional: OAuth callback URL (auto-configured in most cases)
```

### AI Provider Configuration

```bash
# OpenAI
OPENAI_API_KEY="sk-xxx"
# Optional: For GPT-4, GPT-4o-mini, etc.

# OpenRouter (Fallback/Free Models)
OPENROUTER_API_KEY="sk-or-xxx"
# Optional: For accessing multiple AI models through OpenRouter

# Google Gemini
GEMINI_API_KEY="xxx"
# Optional: For Google Gemini models

# AI Draft Concurrency
AI_DRAFT_CONCURRENCY=4
# Optional: Max concurrent AI requests (default: 2 for OpenRouter, 6 for paid models)
# Adjust based on your API rate limits
```

### Logging & Monitoring

```bash
# Log Level
LOG_LEVEL=info
# Options: error, warn, info, debug, verbose
# Default: info in production, debug in development
```

---

## 🌐 Web (Frontend)

### Core Configuration

```bash
# API Base URL
NEXT_PUBLIC_API_BASE_URL="http://localhost:4000/api"
# Required: Full URL to your API server (with /api prefix)

# NextAuth Configuration
NEXTAUTH_SECRET="your-secret-key-here"
# Required: Must match the API NEXTAUTH_SECRET

NEXTAUTH_URL="http://localhost:3000"
# Required: Base URL of your web application
```

### Google OAuth

```bash
# Google Client Credentials (for NextAuth)
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
# Required: Same as API Google OAuth credentials
```

---

## 💾 Database

### Database Package

```bash
# PostgreSQL Connection
DATABASE_URL="postgresql://username:password@host:5432/database_name"
# Required: Same connection string as API
```

---

## 🚀 Quick Setup

### 1. Local Development (Docker PostgreSQL)

```bash
# Root .env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/email_automation"
TOKEN_ENCRYPTION_KEY="generate-with-openssl-rand-hex-32"

# API .env
PORT=4000
NODE_ENV=development
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"
WEB_APP_URL="http://localhost:3000"
CORS_ORIGIN="http://localhost:3000"

# Google OAuth (get from Google Cloud Console)
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"

# AI Providers (at least one required)
OPENAI_API_KEY="sk-xxx"
# OR
OPENROUTER_API_KEY="sk-or-xxx"
# OR
GEMINI_API_KEY="xxx"

# Web .env.local
NEXT_PUBLIC_API_BASE_URL="http://localhost:4000/api"
NEXTAUTH_SECRET="same-as-api-secret"
NEXTAUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID="same-as-api-client-id"
GOOGLE_CLIENT_SECRET="same-as-api-client-secret"

# Database .env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/email_automation"
```

### 2. Production (Neon + Vercel)

```bash
# Root .env
DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/neondb"
TOKEN_ENCRYPTION_KEY="your-production-encryption-key"

# API Environment Variables (Vercel)
PORT=4000
NODE_ENV=production
DATABASE_URL="your-neon-connection-string"
NEXTAUTH_SECRET="your-production-secret"
NEXTAUTH_URL="https://app.yourdomain.com"
APP_BASE_URL="https://app.yourdomain.com"
WEB_APP_URL="https://app.yourdomain.com"
CORS_ORIGIN="https://app.yourdomain.com,https://api.yourdomain.com"
TOKEN_ENCRYPTION_KEY="your-production-encryption-key"
GOOGLE_CLIENT_ID="your-production-client-id"
GOOGLE_CLIENT_SECRET="your-production-client-secret"
OPENAI_API_KEY="your-production-openai-key"
LOG_LEVEL=info

# Web Environment Variables (Vercel)
NEXT_PUBLIC_API_BASE_URL="https://api.yourdomain.com/api"
NEXTAUTH_SECRET="same-as-api-secret"
NEXTAUTH_URL="https://app.yourdomain.com"
GOOGLE_CLIENT_ID="same-as-api-client-id"
GOOGLE_CLIENT_SECRET="same-as-api-client-secret"
```

---

## 🔐 Security Best Practices

### Secrets Generation

```bash
# Generate NEXTAUTH_SECRET
openssl rand -base64 32

# Generate TOKEN_ENCRYPTION_KEY (32 bytes = 64 hex characters)
openssl rand -hex 32
```

### Important Security Notes

1. **Never commit .env files to version control**
2. **Use different secrets for development and production**
3. **Rotate secrets periodically in production**
4. **Store production secrets in environment variable managers** (Vercel, AWS Secrets Manager, etc.)
5. **Use HTTPS in production** for all external URLs
6. **Enable rate limiting** (already configured with defaults)
7. **Review CORS origins** - never use "*" in production

---

## 🧪 Testing Environment

```bash
# Override for test runs
NODE_ENV=test
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/email_automation_test"
LOG_LEVEL=error
AI_DRAFT_CONCURRENCY=1
```

---

## ⚠️ Common Issues & Solutions

### Issue: "Gmail OAuth not configured"
**Solution:** Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in both API and Web .env files

### Issue: "Database connection failed"
**Solution:** Verify `DATABASE_URL` is correct and database is running (`pnpm db:start` for local)

### Issue: "CORS error from frontend"
**Solution:** Ensure `CORS_ORIGIN` includes your frontend URL and matches `NEXTAUTH_URL`

### Issue: "Session expired immediately"
**Solution:** Ensure `NEXTAUTH_SECRET` matches in both API and Web, and `NEXTAUTH_URL` is correct

### Issue: "AI timeouts"
**Solution:** Reduce `AI_DRAFT_CONCURRENCY` or upgrade to a paid AI provider

---

## 📚 Additional Resources

- [Next.js Environment Variables](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)
- [NestJS Configuration](https://docs.nestjs.com/techniques/configuration)
- [Neon PostgreSQL Setup](https://neon.tech/docs/get-started-with-neon)
- [Google OAuth Setup](https://console.cloud.google.com/apis/credentials)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)

---

**Last Updated:** 2025-10-15
