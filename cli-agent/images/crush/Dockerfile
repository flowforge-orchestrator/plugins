FROM node:22.23.4-trixie-slim@sha256:be1e2a3dc2c4fd68cdfadad2a696a280e0d2749098bee509230174d72fb768c6
ARG CRUSH_VERSION=0.98.1
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends ca-certificates curl tar \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL "https://github.com/charmbracelet/crush/releases/download/v${CRUSH_VERSION}/crush_${CRUSH_VERSION}_Linux_arm64.tar.gz" \
    -o /tmp/crush.tar.gz \
  && tar -xzf /tmp/crush.tar.gz -C /tmp \
  && install -m 0755 "/tmp/crush_${CRUSH_VERSION}_Linux_arm64/crush" /usr/local/bin/crush \
  && rm -rf /tmp/crush.tar.gz "/tmp/crush_${CRUSH_VERSION}_Linux_arm64" \
  && command -v crush \
  && command -v node
WORKDIR /workspace
ENTRYPOINT []
CMD ["crush"]
