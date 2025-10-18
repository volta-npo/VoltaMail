# Stage 1 – install dependencies & build
FROM node:20-alpine AS build
WORKDIR /app

RUN corepack enable
RUN apk add --no-cache openssl libstdc++ python3 make g++

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig*.json ./
COPY apps apps
COPY packages packages

# Install all dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# Generate Prisma Client in build stage (run in database package directory)
RUN cd packages/database && npx prisma generate

# Build the shared and database packages first (required dependencies for API)
RUN pnpm --filter @email-automation/database build
RUN pnpm --filter @email-automation/shared build

# Build the API
RUN pnpm --filter @email-automation/api build

# Stage 2 – runtime image
FROM node:20-alpine
WORKDIR /app

RUN corepack enable
RUN apk add --no-cache openssl libstdc++

# Copy the entire monorepo structure
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/packages packages
COPY --from=build /app/apps/api/node_modules apps/api/node_modules

ENV NODE_ENV=production
EXPOSE 4000

# Use node directly instead of pnpm for better signal handling
CMD ["node", "apps/api/dist/main.js"]
