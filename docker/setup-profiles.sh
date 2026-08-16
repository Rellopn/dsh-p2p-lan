#!/usr/bin/env bash
set -euo pipefail

# Build two profiles at image time:
#   node   -> @deepseek-ai/dsh-web-app  (persistent receiver / gate panel)
#   sender -> @deepseek-ai/dsh-headless (transient one-shot sender)
# In-box bundles (@deepseek-ai/*) resolve from the dsh installation's own
# node_modules at boot via the profiles/node_modules symlink fallback; only the
# third-party plugin tarball is installed into each profile.

make_profile() {
  local profile="$1" app_bundle="$2"
  local dir="$DSH_HOME/profiles/$profile"
  mkdir -p "$dir"

  cat > "$dir/package.json" <<EOF
{
  "name": "dsh-profile-${profile}",
  "private": true,
  "dependencies": {
    "@rellopn/dsh-p2p-lan": "file:/opt/p2p/plugin.tgz"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "${app_bundle}",
        "@rellopn/dsh-p2p-lan"
      ]
    }
  }
}
EOF

  cat > "$dir/pnpm-workspace.yaml" <<'EOF'
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
EOF

  printf '[]\n' > "$dir/cordis.patch.yml"

  (cd "$dir" && pnpm install --silent)
}

make_profile "node"   "@deepseek-ai/dsh-web-app"
make_profile "sender" "@deepseek-ai/dsh-headless"

echo "profiles ready:"
ls -1 "$DSH_HOME/profiles"
