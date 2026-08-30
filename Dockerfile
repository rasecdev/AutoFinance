FROM node:22-bookworm-slim AS builder
WORKDIR /app

# better-sqlite3-multiple-ciphers já traz binário pré-compilado pra linux-x64 —
# sem precisar de toolchain de compilação (python3/make/g++) na imagem.
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
