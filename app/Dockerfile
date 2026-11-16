# The Steelman service as one container (M1-14a; plans/architecture.md §4):
# the API, sign-in, and the built web app at one address. The same image runs
# the migrations and the daily call as Cloud Run jobs, with another command:
#
#   node server/dist/main.mjs          the service (the default)
#   node server/dist/migrate-cli.mjs   brings the database up to date
#   node server/dist/daily-cli.mjs     the daily clean-up
#
# Built from the repository's root, since the web app takes its look from the
# prototype in docs/:  docker build -f app/Dockerfile -t steelman .

# 1. Build: install everything, then bundle the service and build the web app.
# Node 22, pinned to one image (its digest) so a build is repeatable; moved forward deliberately.
FROM node:22.23.5-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS build
WORKDIR /src/app
COPY app/package.json app/package-lock.json ./
COPY app/shared/package.json shared/
COPY app/server/package.json server/
COPY app/web/package.json web/
RUN npm ci --ignore-scripts
COPY docs/prototype/source /src/docs/prototype/source
COPY docs/design /src/docs/design
COPY app .
RUN npm run build

# 2. Run: only the packages the service needs at run time, and what was built.
FROM node:22.23.5-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee
WORKDIR /srv
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    WEB_DIRECTORY=/srv/web/dist \
    MIGRATIONS_DIRECTORY=/srv/server/migrations
COPY app/package.json app/package-lock.json ./
COPY app/shared/package.json shared/
COPY app/server/package.json server/
COPY app/web/package.json web/
RUN npm ci --omit=dev --ignore-scripts --workspace @steelman/server --include-workspace-root=false && npm cache clean --force
COPY --from=build /src/app/server/dist server/dist
COPY --from=build /src/app/web/dist web/dist
COPY app/server/migrations server/migrations
# Not as root.
USER node
EXPOSE 8080
CMD ["node", "server/dist/main.mjs"]
