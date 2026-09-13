FROM node:22-bookworm-slim AS builder
WORKDIR /app

# better-sqlite3-multiple-ciphers já traz binário pré-compilado pra linux-x64
# dentro do próprio pacote — --ignore-scripts evita que o npm tente rodar
# o node-gyp rebuild implícito (por causa do binding.gyp do pacote), que
# falharia sem toolchain de compilação e é desnecessário aqui.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# canvas (via chartjs-node-canvas, Fase 6 parte 10) precisa do próprio
# install script (prebuild-install, com fallback pra node-gyp) — os outros
# pacotes seguem sem rodar script (--ignore-scripts acima), só esse é
# reativado explicitamente.
RUN npm rebuild canvas

COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN cp -r src/db/migrations dist/db/migrations

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# canvas (binário nativo, ver builder acima) linka contra essas libs em
# tempo de execução, não só de build — sem elas o require('canvas') falha
# mesmo com o binário já compilado/baixado.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

RUN mkdir -p /app/data && chown -R node:node /app
VOLUME ["/app/data"]

USER node

CMD ["node", "dist/index.js"]
