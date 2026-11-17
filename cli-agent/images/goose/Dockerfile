FROM node:22.23.4-trixie-slim@sha256:be1e2a3dc2c4fd68cdfadad2a696a280e0d2749098bee509230174d72fb768c6
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends ca-certificates curl bzip2 \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://github.com/block/goose/releases/latest/download/goose-aarch64-unknown-linux-gnu.tar.bz2 \
    -o /tmp/goose.tar.bz2 \
  && tar -xjf /tmp/goose.tar.bz2 -C /tmp \
  && install -m 0755 /tmp/goose /usr/local/bin/goose \
  && rm -rf /tmp/goose /tmp/goose.tar.bz2 \
  && command -v goose \
  && command -v node
WORKDIR /workspace
ENTRYPOINT []
CMD ["goose"]
