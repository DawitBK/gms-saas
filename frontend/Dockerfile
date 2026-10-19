FROM node:22-alpine AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_BASE_PATH=""
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

# package.json depends on "xlsx": "file:../vendor/xlsx-0.20.3.tgz"; from /app that is /vendor/. The directory is outside the
# ./frontend build context, so it comes in as the named build context `vendor` (compose: additional_contexts;
# CLI: --build-context vendor=./vendor), exactly as for the backend image.
COPY --from=vendor xlsx-0.20.3.tgz /vendor/xlsx-0.20.3.tgz
COPY package*.json ./
RUN npm ci

COPY . .
RUN mkdir -p public

# CI runners have no gitignored .env.production; materialize from template + build-args.
RUN node scripts/write-docker-env.js

RUN npm run env:check:prod && npm run build:docker

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# The platform reserves 7201 for the GMS browser client, in dev and prod alike
# (see the port convention in the root CLAUDE.md). EXPOSE is documentation, but
# 3000 was left over from before that convention and read as the real port.
EXPOSE 7201
USER node

CMD ["node", "server.js"]
