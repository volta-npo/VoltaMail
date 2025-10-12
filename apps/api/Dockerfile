# Stage 1 – install dependencies & build
FROM node:20-alpine AS build
WORKDIR /app

# Enable pnpm
RUN corepack enable

# Copy workspace metadata
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig*.json ./
COPY apps apps
COPY packages packages

# Install dependencies (with workspace support) and build only the API
RUN pnpm install --frozen-lockfile && \
    pnpm --filter @email-automation/api build

# Stage 2 – runtime image
FROM node:20-alpine
WORKDIR /app
RUN corepack enable

# Copy root package metadata and workspace packages
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages packages

# Install production deps for the API only
RUN pnpm install --filter @email-automation/api --prod --frozen-lockfile

# Copy built output
COPY --from=build /app/apps/api/dist apps/api/dist

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "apps/api/dist/main.js"]
