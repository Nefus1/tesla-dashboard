FROM node:22-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173 \
    DATA_DIR=/app/data

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public

RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

EXPOSE 4173
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1

CMD ["node", "server/index.js"]
