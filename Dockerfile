# syntax=docker/dockerfile:1

# ---- build: install everything, compile, then drop dev dependencies ----
FROM node:22.22.0-trixie-slim AS build
# Build tools, only in case a native module has no prebuilt binary for this CPU.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig*.json vite.config.ts drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src ./src
# The app runs as a non-root user: make sure it can read everything it needs,
# whatever permissions the files had on the host (e.g. 600 after a copy).
RUN npm run build && npm prune --omit=dev \
    && chmod -R a+rX dist drizzle node_modules package.json

# Empty, writable folders for the database and backups (the runtime image has no shell to make them).
RUN mkdir -p /out/data /out/backups

# ---- run: Google's "distroless" Node.js image ----
# Only Node.js and the system libraries it needs: no shell, no package manager, no npm, no perl.
# That removes almost everything a vulnerability scanner finds in the full Debian-based Node image.
# Same Debian 13 base as the build stage, so the compiled SQLite module matches.
FROM gcr.io/distroless/nodejs22-debian13
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATA_DIR=/data \
    CONTENT_DIR=/content \
    BACKUP_DIR=/backups \
    WEB_DIR=/app/dist/web \
    MIGRATIONS_DIR=/app/drizzle
WORKDIR /app
COPY --from=build --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/dist ./dist
COPY --from=build --chown=root:root /app/drizzle ./drizzle
COPY --from=build --chown=root:root /app/package.json ./
COPY --from=build --chown=1000:1000 /out/data /data
COPY --from=build --chown=1000:1000 /out/backups /backups
# Same non-root user id as before (1000), so existing data folders keep working.
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# The image's entrypoint is Node itself.
CMD ["dist/server/server/index.js"]
