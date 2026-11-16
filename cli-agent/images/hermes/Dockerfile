FROM node:22.23.4-trixie-slim@sha256:be1e2a3dc2c4fd68cdfadad2a696a280e0d2749098bee509230174d72fb768c6
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends ca-certificates git python3 \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @nousresearch/hermes-cli@latest || npm install -g hermes-cli@latest || true
COPY images/hermes/hermes-wrapper.py /usr/local/bin/hermes-wrapper.py
RUN set -eux; \
  if [ -x /usr/local/bin/hermes ]; then mv /usr/local/bin/hermes /usr/local/bin/hermes.real; \
  elif [ -x /usr/bin/hermes ]; then mv /usr/bin/hermes /usr/local/bin/hermes.real; \
  else echo "hermes binary missing" >&2; exit 1; fi; \
  cp /usr/local/bin/hermes-wrapper.py /usr/local/bin/hermes; \
  chmod 755 /usr/local/bin/hermes
WORKDIR /workspace
ENTRYPOINT ["hermes"]
