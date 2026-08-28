# ---------------------------------------------------------------------------
# NetFlow — imagen de producción
#
# Tres etapas para que la imagen final no cargue con el toolchain de compilación.
# better-sqlite3 es un módulo nativo: se compila en la etapa `deps` y se copia
# ya compilado, por eso la imagen final no necesita python ni make.
# ---------------------------------------------------------------------------

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Dependencias de compilación solo en esta etapa
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci


FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# SESSION_SECRET real se inyecta en runtime; en build solo hace falta que exista.
ENV SESSION_SECRET=build-time-placeholder-no-se-usa-en-runtime
RUN npm run build


FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_PATH=/data/netflow.db

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 netflow \
    && useradd --system --uid 1001 --gid netflow netflow

# Salida standalone: server.js + solo las dependencias que realmente se usan
COPY --from=builder --chown=netflow:netflow /app/.next/standalone ./
COPY --from=builder --chown=netflow:netflow /app/.next/static ./.next/static
COPY --from=builder --chown=netflow:netflow /app/public ./public

# El esquema se lee en runtime desde disco, así que viaja con la imagen.
COPY --from=builder --chown=netflow:netflow /app/src/lib/schema.sql ./src/lib/schema.sql

# Scripts de seed y respaldo, para poder correrlos dentro del contenedor
COPY --from=builder --chown=netflow:netflow /app/scripts ./scripts
COPY --from=builder --chown=netflow:netflow /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder --chown=netflow:netflow /app/node_modules/bcryptjs ./node_modules/bcryptjs

# La base vive en un volumen: el contenedor es descartable, los datos no.
RUN mkdir -p /data && chown netflow:netflow /data
VOLUME ["/data"]

USER netflow
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
