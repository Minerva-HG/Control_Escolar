# ---------- Etapa 1: dependencias de produccion ----------
FROM node:22-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; else npm install --omit=dev --no-audit --no-fund; fi \
    && npm cache clean --force

# ---------- Etapa 2: imagen final ----------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# dumb-init reenvia SIGTERM correctamente para que el cierre sea limpio.
RUN apk add --no-cache dumb-init

WORKDIR /app

# El usuario "node" ya viene en la imagen base. Se asigna la propiedad durante el COPY
# porque un "RUN chown -R" posterior duplicaria node_modules en otra capa.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
