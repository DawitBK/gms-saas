FROM node:22-alpine AS deps

WORKDIR /app
RUN apk add --no-cache python3 make g++
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

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src/core/db/migrations ./src/core/db/migrations
COPY --from=builder /app/src/seeders ./src/seeders
COPY --from=builder /app/src/core/db/config ./src/core/db/config
COPY --from=builder /app/.sequelizerc ./.sequelizerc
COPY --from=builder /app/eng.traineddata ./
RUN mkdir -p logs && chown -R node:node logs

EXPOSE ${PORT:-5000}
USER node

CMD ["node", "scripts/run-with-env.js", "production", "dist/main.js"]
