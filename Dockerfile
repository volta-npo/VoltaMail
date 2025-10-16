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

# Build the API
RUN pnpm --filter @email-automation/api build

# Stage 2 – runtime image
FROM node:20-alpine
WORKDIR /app

RUN corepack enable
RUN apk add --no-cache openssl libstdc++

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages packages

# Install production dependencies only
RUN pnpm install --filter @email-automation/api --prod --frozen-lockfile

# Copy generated Prisma Client from build stage
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

# Generate Prisma Client in runtime stage (run in database package directory)
RUN cd packages/database && npx prisma generate

# Copy built application from build stage
COPY --from=build /app/apps/api/dist apps/api/dist

# Copy Prisma schema for runtime migrations
COPY --from=build /app/packages/database/prisma packages/database/prisma

ENV NODE_ENV=production
EXPOSE 4000

# Use node directly instead of pnpm for better signal handling
CMD ["node", "apps/api/dist/main.js"]
