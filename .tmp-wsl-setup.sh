#!/usr/bin/env bash
set -euo pipefail
export PATH="/home/rellopn/.local/share/fnm/node-versions/v24.3.0/installation/bin:$PATH"
cd /home/rellopn

echo "=== dsh bin ==="
DSH_BIN=$(ls -d /home/rellopn/.npm/_npx/*/node_modules/.bin/dsh 2>/dev/null | head -1)
echo "DSH_BIN=$DSH_BIN"

echo "=== plugin help ==="
"$DSH_BIN" plugin --help 2>&1 | head -30 || true

echo "=== restore env from running web proc ==="
tr '\0' '\n' < /proc/1632783/environ > /tmp/dsh-env-lines.txt 2>/dev/null || echo "cannot read environ"
while IFS= read -r line; do
  key="${line%%=*}"
  val="${line#*=}"
  printf 'export %s=%q\n' "$key" "$val"
done < /tmp/dsh-env-lines.txt > /home/rellopn/.dsh/env.restore
wc -l /home/rellopn/.dsh/env.restore
echo "=== key envs ==="
grep -E 'OPENCODE|DEEPSEEK|API_KEY|HTTP_PROXY|HTTPS_PROXY' /home/rellopn/.dsh/env.restore | sed 's/export //; s/=.*/=<set>/' | head -10 || true
