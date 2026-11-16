FROM node:22.23.4-trixie-slim@sha256:be1e2a3dc2c4fd68cdfadad2a696a280e0d2749098bee509230174d72fb768c6
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g opencode-ai@latest \
  && if [ -e /usr/local/bin/opencode ]; then mv /usr/local/bin/opencode /usr/local/bin/opencode.real; fi
COPY opencode-wrap.sh /usr/local/bin/opencode
RUN chmod +x /usr/local/bin/opencode
WORKDIR /workspace
ENTRYPOINT []
CMD ["opencode"]
