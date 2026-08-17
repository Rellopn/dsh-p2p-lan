# Two-node LAN P2P demo image: node + dsh CLI + the packed @rellopn/dsh-p2p-lan plugin.
FROM node:22-bookworm

ENV DSH_HOME=/root/.dsh

# Build tools so any native dependency (node-pty/koffi/sharp/node-addon) can compile.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# pnpm for profile plugin management, and the dsh CLI itself.
RUN npm install -g pnpm@11.7.0 @deepseek-ai/dsh@0.1.0-rc.6

# socat exposes the loopback-bound web UI to a Docker -p publish; curl fetches
# the landlock-run prebuilt below. Kept as its own layer so the expensive npm
# step above stays cached on edits.
RUN apt-get update \
    && apt-get install -y --no-install-recommends socat curl \
    && rm -rf /var/lib/apt/lists/*

# The prebuilt landlock-run launcher is occasionally dropped from its platform
# package during the global npm install (its bin/ ends up empty), which breaks
# the sandboxed bash tool. Fetch it explicitly so project-task agents can shell.
RUN set -eux; \
    BIN_DIR="/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/node-addon-landlock-run-linux-x64/bin"; \
    if [ ! -x "$BIN_DIR/landlock-run" ]; then \
      curl -fsSL "https://registry.npmjs.org/@deepseek-ai/node-addon-landlock-run-linux-x64/-/node-addon-landlock-run-linux-x64-0.1.1.tgz" -o /tmp/llr.tgz \
      && mkdir -p /tmp/llr && tar -xzf /tmp/llr.tgz -C /tmp/llr \
      && cp /tmp/llr/package/bin/landlock-run "$BIN_DIR/landlock-run" \
      && chmod +x "$BIN_DIR/landlock-run" \
      && rm -rf /tmp/llr /tmp/llr.tgz; \
    fi

WORKDIR /opt/p2p

# The packed plugin and the profile-setup script (run at build time).
COPY dist/rellopn-dsh-p2p-lan-0.1.0-rc.6.tgz /opt/p2p/plugin.tgz
COPY docker/setup-profiles.sh /opt/p2p/setup-profiles.sh
RUN bash /opt/p2p/setup-profiles.sh

# Runtime entrypoint: writes the per-node config, then boots the node.
COPY docker/entrypoint.sh /opt/p2p/entrypoint.sh
RUN chmod +x /opt/p2p/entrypoint.sh

ENTRYPOINT ["/opt/p2p/entrypoint.sh"]
