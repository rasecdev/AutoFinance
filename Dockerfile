FROM node:22-bookworm-slim AS builder
WORKDIR /app

# better-sqlite3-multiple-ciphers já traz binário pré-compilado pra linux-x64
# dentro do próprio pacote — --ignore-scripts evita que o npm tente rodar
# o node-gyp rebuild implícito (por causa do binding.gyp do pacote), que
# falharia sem toolchain de compilação e é desnecessário aqui.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

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
