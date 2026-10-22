#!/usr/bin/env bash
# Build output is public; tar preserves the builder's possibly private umask.
# Only normalize packaged code/assets. Never touch env, state, or backups.
set -euo pipefail
release="${1:?uso: prepare-release-files.sh RELEASE_DIR}"
test -d "$release/dist"
test -f "$release/dist/index.html"
for entry in dist bin cli server shared deploy public src docs; do
  if [[ -d "$release/$entry" ]]; then
    find "$release/$entry" -type d -exec chmod 755 {} +
    find "$release/$entry" -type f -exec chmod a+rX,u+w,go-w {} +
  fi
done
for entry in package.json package-lock.json index.html vite.config.ts tsconfig.json \
  tsconfig.node.json postcss.config.js tailwind.config.js AGENTS.md README.md \
  INDEX.md heartbeat_monitor.py; do
  [[ ! -f "$release/$entry" ]] || chmod a+rX,u+w,go-w "$release/$entry"
done
