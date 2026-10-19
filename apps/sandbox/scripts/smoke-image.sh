#!/usr/bin/env bash
set -euo pipefail
profile="${1:-default}"
node --version
python --version
google-chrome --version
log=$(mktemp)
COHUB_SPACE_ID=smoke-test SANDBOX_RPC_TOKEN=smoke-test-token COHUB_SEARCH_ENABLED=false \
  /opt/cohub/internal/cohub-sandbox >"$log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true; cat "$log"; rm -f "$log"' EXIT
for _ in $(seq 1 30); do
  kill -0 "$pid" 2>/dev/null || exit 1
  if curl -fsS http://localhost:8788/healthz >/dev/null; then break; fi
  sleep 1
done
curl -fsS http://localhost:8788/healthz >/dev/null
if [[ "$profile" == game ]]; then
  godot --version
  cmake --version
  xvfb-run -a glxinfo -B
  work=$(mktemp -d)
  printf '[application]\nconfig/name="Sandbox smoke"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n' > "$work/project.godot"
  godot --headless --path "$work" --editor --import --quit
  xvfb-run -a godot --path "$work" --editor --rendering-method gl_compatibility --quit-after 5
  blender --background --factory-startup --python-expr "import bpy; bpy.ops.wm.save_as_mainfile(filepath='$work/smoke.blend'); bpy.context.scene.render.resolution_x=32; bpy.context.scene.render.resolution_y=32; bpy.context.scene.render.engine='CYCLES'; bpy.context.scene.cycles.samples=1; bpy.ops.render.render()"
  test -s "$work/smoke.blend"
fi
