FROM node:22.23.4-trixie-slim@sha256:be1e2a3dc2c4fd68cdfadad2a696a280e0d2749098bee509230174d72fb768c6
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://cursor.com/install | bash \
  && mkdir -p /opt/cursor-agent \
  && cp -a /root/.local/share/cursor-agent/. /opt/cursor-agent/ \
  && AGENT_BIN="$(find /opt/cursor-agent -type f -name cursor-agent | head -n1)" \
  && test -n "$AGENT_BIN" \
  && ln -sf "$AGENT_BIN" /usr/local/bin/cursor-agent.real \
  && ln -sf "$AGENT_BIN" /usr/local/bin/agent \
  && /usr/local/bin/agent --version
COPY cursor-agent-wrap.sh /usr/local/bin/cursor-agent
RUN chmod +x /usr/local/bin/cursor-agent
ENV PATH="/usr/local/bin:${PATH}"
WORKDIR /workspace
ENTRYPOINT []
CMD ["cursor-agent"]
