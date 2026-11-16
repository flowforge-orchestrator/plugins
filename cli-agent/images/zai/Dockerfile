FROM node:22.23.4-trixie-slim@sha256:be1e2a3dc2c4fd68cdfadad2a696a280e0d2749098bee509230174d72fb768c6
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g zcode-app-cli@latest \
  && if [ -e /usr/local/bin/zcode ]; then mv /usr/local/bin/zcode /usr/local/bin/zcode.real; fi \
  && zcode.real --version
COPY zcode-wrap.sh /usr/local/bin/zcode
RUN chmod +x /usr/local/bin/zcode
WORKDIR /workspace
ENTRYPOINT []
CMD ["zcode"]
