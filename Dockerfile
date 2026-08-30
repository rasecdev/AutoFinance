FROM node:22-bookworm-slim AS builder
WORKDIR /app

# python3/make/g++ são exigidos pelo node-gyp do better-sqlite3 (módulo nativo)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

RUN mkdir -p /app/data
VOLUME ["/app/data"]

CMD ["node", "dist/index.js"]
