# Native source is enabled only after the pinned provenance manifest passes verification.
FROM node:22.14.0-bookworm-slim@sha256:1c18d9ab3af4585870b92e4dbc5cac5a0dc77dd13df1a5905cea89fc720eb05b AS build
ARG AUTH_METHOD=proxy
ARG PUBLIC_URL=/backoffice/cypher-workbench
ENV REACT_APP_AUTH_METHOD=$AUTH_METHOD PUBLIC_URL=$PUBLIC_URL
COPY . /build-input
RUN set -eu; \
    grep -qx 'REVISION 77534a68526971ba9ef5b2e77b6e6aeb0ace8a24' /build-input/provenance/source-manifest.sha256; \
    grep -qx 'ARCHIVE_SHA256 d2a35af2493f6802878fc77d0d293b338f9f292a6512e70f3065dee8b3901f9c' /build-input/provenance/source-manifest.sha256; \
    while read -r kind hash path; do \
      case "$kind" in ARCHIVE_SHA256|REVISION) continue;; esac; \
      actual=$(sha256sum "/build-input/$path" | cut -d' ' -f1); \
      test "$actual" = "$hash"; \
    done < /build-input/provenance/source-manifest.sha256
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=optional --legacy-peer-deps
COPY public/ ./public/
COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build

FROM nginx:stable-alpine@sha256:901e593c95dc85f5a729f5765516321366ef4ac401821431d408897e95287d0a
RUN --mount=type=secret,id=build_ca_bundle \
    if [ -f /run/secrets/build_ca_bundle ]; then \
      SSL_CERT_FILE=/run/secrets/build_ca_bundle apk upgrade --no-cache; \
    else apk upgrade --no-cache; fi
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 9080
USER nginx
CMD ["nginx", "-g", "daemon off;"]
