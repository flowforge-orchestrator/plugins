FROM python:3.12-slim-trixie@sha256:4840d514c583a4d3d8cad3940e68dee6f0f6f3635c12fcd0a3d74c21a5b93a54
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/* \
  && pip install --no-cache-dir openhands-ai \
  && (command -v openhands || command -v openhands-cli || pip show openhands-ai) \
  && python -c "import importlib.util; print('ok')"
WORKDIR /workspace
ENTRYPOINT []
CMD ["openhands"]
