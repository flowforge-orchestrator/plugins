FROM node:22.23.4-trixie-slim@sha256:be1e2a3dc2c4fd68cdfadad2a696a280e0d2749098bee509230174d72fb768c6
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @anthropic-ai/claude-code@latest \
  && useradd -m -u 10001 -d /home/agent agent \
  && mkdir -p /home/agent \
  && chown -R agent:agent /home/agent
WORKDIR /workspace
USER agent
ENTRYPOINT []
CMD ["claude"]
