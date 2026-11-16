FROM node:22.23.4-trixie-slim@sha256:be1e2a3dc2c4fd68cdfadad2a696a280e0d2749098bee509230174d72fb768c6
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends ca-certificates git curl \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @qwen-code/qwen-code@0.25.1 \
  && command -v qwen
WORKDIR /workspace
ENTRYPOINT []
CMD ["qwen"]
