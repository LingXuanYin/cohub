#!/usr/bin/env bash
# Seat two campers in two tabs of the local preview: ./preview/seat-two.sh [url] [width] [height]
set -euo pipefail

URL="${1:-http://localhost:5199/preview.html}"
WIDTH="${2:-1280}"
HEIGHT="${3:-800}"
S=(agent-browser --session campfire)

"${S[@]}" close >/dev/null 2>&1 && sleep 2 || true
"${S[@]}" open "$URL" --args "--no-sandbox,--disable-dev-shm-usage,--use-fake-device-for-media-stream,--use-fake-ui-for-media-stream,--autoplay-policy=no-user-gesture-required" >/dev/null
"${S[@]}" set viewport "$WIDTH" "$HEIGHT" >/dev/null
"${S[@]}" eval "localStorage.clear(); sessionStorage.clear(); location.reload(); 'ok'" >/dev/null
sleep 3

seat() {
  "${S[@]}" eval "campfire.sit({ name: '$1', color: '$2', code: 'PREVIEW-FIRE', listen: false }).then(() => 'seated')" >/dev/null
}

seat Ana "#f4a261"
sleep 1
"${S[@]}" tab new "$URL" >/dev/null
sleep 3
seat Ben "#8ecae6"
sleep 1
"${S[@]}" eval "JSON.stringify(campfire.members.map((m) => m.name))"
