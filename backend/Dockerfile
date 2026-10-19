# package.json depends on "file:../vendor/xlsx-0.20.3.tgz"; from /app npm resolves that to
# /vendor/. The directory is outside the ./backend build context, so it comes in as
# the named build context `vendor` (compose: additional_contexts; CLI:
# --build-context vendor=./vendor). Without it `npm ci` fails with ENOENT.
FROM node:22-alpine AS deps

WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY --from=vendor xlsx-0.20.3.tgz /vendor/xlsx-0.20.3.tgz
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=vendor xlsx-0.20.3.tgz /vendor/xlsx-0.20.3.tgz
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src/core/db/migrations ./src/core/db/migrations
COPY --from=builder /app/src/seeders ./src/seeders
COPY --from=builder /app/src/core/db/config ./src/core/db/config
COPY --from=builder /app/.sequelizerc ./.sequelizerc
# eng.traineddata is not tracked in git (tesseract.js fetches and caches it itself), so
# a build from a clean checkout has no such file. The glob copies it when present
# and is a no-op when not; a literal path failed every CI build.
COPY --from=builder /app/eng.trained[d]ata* ./
RUN mkdir -p logs && chown -R node:node logs

EXPOSE ${PORT:-5000}
USER node

CMD ["node", "scripts/run-with-env.js", "production", "dist/main.js"]
