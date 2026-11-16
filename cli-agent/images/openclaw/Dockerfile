FROM node:24.22.2-trixie-slim@sha256:0820eaa85e07d0490446dd01d14707e17e6108a36988cf374899cd057eb3812d
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends ca-certificates git curl \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g openclaw@latest \
  && command -v openclaw
WORKDIR /workspace
ENTRYPOINT []
CMD ["openclaw"]
