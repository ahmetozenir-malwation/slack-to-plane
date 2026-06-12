# syntax=docker/dockerfile:1.6

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci --include=dev --registry=https://registry.npmjs.org/
COPY tsconfig.json biome.json ./
COPY src ./src
COPY migrations ./migrations
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini && \
    addgroup -S app && adduser -S app -G app
COPY package.json package-lock.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ && \
    npm ci --omit=dev --registry=https://registry.npmjs.org/ && \
    npm rebuild better-sqlite3 && \
    apk del .build-deps && \
    find /app/node_modules \( -name "*.md" -o -name "*.ts" -o -name "test" -type d \) -prune -exec rm -rf {} + && \
    rm -rf /var/cache/apk/* /root/.npm
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
RUN mkdir -p /data && chown app:app /data
USER app
ENV NODE_ENV=production
ENV DB_PATH=/data/bridge.db
ENV PORT=9292
EXPOSE 9292
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:9292/health || exit 1
