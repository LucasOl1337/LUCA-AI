#!/usr/bin/env bash
# Preview com probe de cena (fixture.scene/camera/renderer expostos).
set -u
for p in $(pgrep -f "sompo-preview/serve"); do kill "$p" 2>/dev/null || true; done
sleep 1
cd /home/lol/Projects/LUCA-AI
SOMPO_PREVIEW_INSPECT=1 nohup node scripts/sompo-preview/serve.mjs >/tmp/sompo-preview.log 2>&1 &
disown
sleep "${1:-8}"
tail -3 /tmp/sompo-preview.log
