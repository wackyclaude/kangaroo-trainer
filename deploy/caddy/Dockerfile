# syntax=docker/dockerfile:1
# Caddy, for HTTPS on the home network.
#
# The official Caddy image is built on Alpine Linux, with a shell, curl, OpenSSL and more, and its
# program is compiled with whatever Go version was current on release day. We compile the same Caddy
# release ourselves with the latest patched Go and network library, and run it on Google's minimal
# "static" image: no shell, no package manager, no OpenSSL.

# The official release image is only used to know which Caddy version to build.
# Dependabot proposes a new tag here when Caddy releases one.
FROM caddy:2.11.7 AS release

FROM golang:1.26-bookworm AS build
# Fail instead of silently downloading another Go version.
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
WORKDIR /src
COPY --from=release /usr/bin/caddy /tmp/official-caddy
COPY main.go ./
# Module downloads are checked against Go's public checksum database (sum.golang.org).
RUN set -eu; \
    version="$(/tmp/official-caddy version | cut -d' ' -f1)"; \
    echo "Building Caddy ${version} with $(go version)"; \
    go mod init kangaroo-caddy; \
    go get "github.com/caddyserver/caddy/v2@${version}" golang.org/x/net@v0.60.0; \
    go mod tidy; \
    go build -trimpath -ldflags "-s -w" -o /out/caddy .; \
    /out/caddy version; \
    /out/caddy list-modules > /tmp/ours.txt; /tmp/official-caddy list-modules > /tmp/official.txt; \
    diff /tmp/official.txt /tmp/ours.txt

FROM gcr.io/distroless/static-debian13
# Same folders as the official image, so the existing certificate authority in the
# caddy_data volume is reused and the Mac and iPad keep trusting it.
ENV XDG_CONFIG_HOME=/config \
    XDG_DATA_HOME=/data
COPY --from=build /out/caddy /usr/bin/caddy
WORKDIR /srv
EXPOSE 80 443 443/udp
# Runs as root inside the container, like the official image (the certificate files in the
# volume belong to root). docker-compose.yml drops every capability except binding to
# ports 80/443, and makes the filesystem read-only.
ENTRYPOINT ["/usr/bin/caddy"]
CMD ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
