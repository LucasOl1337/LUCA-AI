#!/usr/bin/env bash
# Startup can briefly refuse connections after restart; never reinstall on that signal.
set -euo pipefail
url="${1:?informe health URL}"
version="${2:?informe versao esperada}"
timeout="${3:-30}"
[[ "$timeout" =~ ^[1-9][0-9]*$ ]]
deadline=$((SECONDS + timeout))
while (( SECONDS < deadline )); do
  remaining=$((deadline - SECONDS))
  (( remaining <= 2 )) || remaining=2
  if body="$(curl -fsS --max-time "$remaining" "$url" 2>/dev/null)" &&
    printf '%s' "$body" | node -e '
      const fs = require("fs");
      try {
        const h = JSON.parse(fs.readFileSync(0, "utf8"));
        process.exit(h.ok === true && h.service === "luca-ai" && h.version === process.argv[1] ? 0 : 1);
      } catch { process.exit(1); }
    ' "$version"; then
    printf '%s\n' "$body"
    exit 0
  fi
  (( SECONDS >= deadline )) || sleep 1
done
echo "health indisponível/incompatível após ${timeout}s: $url" >&2
exit 1
