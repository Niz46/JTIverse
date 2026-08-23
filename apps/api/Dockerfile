# Build Stage
# 1. Pin to a specific, recent Alpine version to avoid stale floating tags
FROM node:22-alpine3.20 AS builder
WORKDIR /app

# 2. Patch the OS layer before doing anything else
RUN apk update && apk upgrade --no-cache

COPY package*.json turbo.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

RUN npm ci
# Generate the Prisma Client before compiling — without this, tsc has
# no type information for @prisma/client and every model access fails.
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npm run build --workspace=apps/api

# Runner Stage
FROM node:22-alpine3.20 AS runner
WORKDIR /app
ENV NODE_ENV=production

# 3. Patch the runner OS and explicitly ensure OpenSSL is updated for Prisma
RUN apk update && apk upgrade --no-cache && \
    apk add --no-cache openssl

COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma

# 4. --only=production skips devDependencies, and `prisma` (the CLI) lives
# there — so a runner-stage `prisma generate` would fail here anyway.
# Copy the client already generated in the builder stage instead of
# regenerating: guarantees both stages use the identical client and
# removes the dependency on a CLI this stage doesn't install.
RUN npm ci --omit=dev

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/node_modules/@prisma/client ./apps/api/node_modules/@prisma/client
COPY --from=builder /app/packages ./packages

WORKDIR /app/apps/api

# 5. Drop root privileges for runtime execution
USER node
EXPOSE 3000
CMD ["npm", "run", "start:prod"]