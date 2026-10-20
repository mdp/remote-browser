FROM node:24-bookworm-slim

ARG AGENT_BROWSER_VERSION=0.39.1
ARG SUPERGATEWAY_VERSION=4.2.0

LABEL org.opencontainers.image.title="Persistent Browser MCP" \
      org.opencontainers.image.description="agent-browser MCP adapter exposed through Supergateway" \
      org.opencontainers.image.licenses="MIT"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl tini \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g --no-fund --no-audit \
        "agent-browser@${AGENT_BROWSER_VERSION}" \
        "supergateway@${SUPERGATEWAY_VERSION}" \
    && npm cache clean --force \
    && agent-browser --version

# Chromium runs in this stack's separate VNC service; never launch a second copy.
WORKDIR /app
COPY supergateway.json /app/supergateway.json
USER node
ENV HOME=/home/node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["supergateway", "--config", "/app/supergateway.json"]
