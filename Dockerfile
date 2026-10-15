# syntax=docker/dockerfile:1.7
#
# monkimoney production image: one image, one process. The API serves the
# Angular PWA from build/public. Build context is the repo root.
#
#   docker build --target runtime -t monkimoney:local .
#
# Dokploy ALWAYS passes --target, so the final stage must stay named
# `runtime` (an unnamed final stage fails the build in about a second).
# Built natively on ARM64 (the server); the Mac rehearses it faithfully.

########################################################################
# gitsha: record the commit being built (needs .git in the build context,
# which is why .dockerignore must NOT exclude it). A GIT_SHA build arg wins.
########################################################################
FROM alpine/git:v2.54.0 AS gitsha
ARG GIT_SHA=""
WORKDIR /src
COPY . .
RUN if [ -n "$GIT_SHA" ]; then echo "$GIT_SHA"; \
    else git rev-parse --verify -q HEAD || echo unknown; fi > /git-sha

########################################################################
# deps: full install (dev dependencies included) for the build.
########################################################################
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/install-git-hooks.mjs scripts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/
RUN npm ci --no-audit --no-fund

########################################################################
# build: shared -> web -> api, then stamp the version and copy the SPA
# into the API's public directory.
########################################################################
FROM deps AS build
COPY apps ./apps
COPY packages ./packages
RUN npm run build -w packages/shared \
 && npm run build -w apps/web \
 && cd apps/api && node ace build
RUN node -p "require('./package.json').version" > apps/api/build/.app-version \
 && mkdir -p apps/api/build/public \
 && cp -R apps/web/dist/web/browser/. apps/api/build/public/

########################################################################
# prod-deps: runtime dependencies only. The workspace layout is kept as is
# (node_modules/@monkimoney/shared -> ../../packages/shared) so that the
# compiled shared package resolves at runtime. Do NOT `npm install` inside
# build/: that breaks the workspace link (ERR_MODULE_NOT_FOUND).
# --omit=optional matters: tools such as playwright, typescript and ts-morph
# are optional peers of runtime packages ("devOptional" in the lockfile) and
# --omit=dev alone keeps them (~130 MB instead of ~40 MB).
########################################################################
FROM node:24-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/install-git-hooks.mjs scripts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/
RUN npm ci --omit=dev --omit=optional -w apps/api -w packages/shared --no-audit --no-fund

########################################################################
# runtime
########################################################################
FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    TZ=UTC \
    HOST=0.0.0.0 \
    PORT=3333 \
    NODE_OPTIONS=--max-old-space-size=384
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
# sharp's prebuilt libvips binaries (@img/sharp-<platform>) are optional
# dependencies, so --omit=optional above drops them. The full install in
# `deps` ran on this same platform: take exactly the ones it resolved.
COPY --from=deps /app/node_modules/@img ./node_modules/@img
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/build ./apps/api/build
COPY --from=gitsha /git-sha ./apps/api/build/.git-sha
# COPY creates root-owned files: the app user (node) can read but not modify
# the code. No chown/chmod layer, which would duplicate node_modules.
COPY docker/entrypoint.mjs ./apps/api/build/entrypoint.mjs
WORKDIR /app/apps/api/build
USER node
EXPOSE 3333
# No curl in the image: probe with Node's fetch.
HEALTHCHECK --interval=10s --timeout=6s --start-period=60s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3333/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "entrypoint.mjs"]
