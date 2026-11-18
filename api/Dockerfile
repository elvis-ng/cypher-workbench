# Native source is enabled only after the pinned provenance manifest passes verification.
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS build
COPY . /build-input
RUN set -eu; \
    grep -qx 'REVISION 77534a68526971ba9ef5b2e77b6e6aeb0ace8a24' /build-input/provenance/source-manifest.sha256; \
    grep -qx 'ARCHIVE_SHA256 d2a35af2493f6802878fc77d0d293b338f9f292a6512e70f3065dee8b3901f9c' /build-input/provenance/source-manifest.sha256; \
    cmp -s /build-input/license.lic.labs /build-input/license.lic; \
    while read -r kind hash path; do \
      case "$kind" in ARCHIVE_SHA256|REVISION) continue;; esac; \
      actual=$(sha256sum "/build-input/$path" | cut -d' ' -f1); \
      test "$actual" = "$hash"; \
    done < /build-input/provenance/source-manifest.sha256
WORKDIR /app
COPY package.json package-lock.json babel.config.json ./
RUN npm ci --omit=optional
COPY src/ ./src/
RUN npm run compile
RUN npm prune --omit=dev

FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
RUN --mount=type=secret,id=build_ca_bundle \
    if [ -f /run/secrets/build_ca_bundle ]; then \
      SSL_CERT_FILE=/run/secrets/build_ca_bundle apk upgrade --no-cache; \
    else apk upgrade --no-cache; fi \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app
ENV HOST_NAME=127.0.0.1 HOST_PROTOCOL=http GRAPHQL_LISTEN_PORT=4000 AUTH_METHOD=proxy
COPY --from=build /app/package.json /app/package-lock.json /app/babel.config.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.compiled ./compiled
# Labs license is bundled; deployment may override LICENSE_FILE or WORKBENCH_LICENSE.
COPY --from=build /build-input/license.lic.labs ./license.lic.labs
ENV LICENSE_FILE=/app/license.lic.labs
USER node
EXPOSE 4000
CMD ["node", "compiled/src/index.js"]
