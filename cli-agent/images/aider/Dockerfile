# Debian nodejs pulls unfixed node-undici. Node itself comes from the official image.
ARG NODE_IMAGE=node:22.23.4-trixie-slim@sha256:be1e2a3dc2c4fd68cdfadad2a696a280e0d2749098bee509230174d72fb768c6
FROM ${NODE_IMAGE} AS nodebin
FROM python:3.12-slim-trixie@sha256:4840d514c583a4d3d8cad3940e68dee6f0f6f3635c12fcd0a3d74c21a5b93a54
COPY --from=nodebin /usr/local/bin/node /usr/local/bin/node
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/* \
  && pip install --no-cache-dir aider-chat
WORKDIR /workspace
# No ENTRYPOINT — adapters may wrap with `sh -c` for pack prefetch.
CMD ["aider"]
