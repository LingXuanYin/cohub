# Board

A Board is one document with three collections. Everything visible is an **item**,
everything that moves is an **animation**, and a keyframe names the property it
drives by its JSON path inside the item.

```json
{
  "board": { "background": { "kind": "dots" }, "grid": { "visible": true, "size": 24 }, "enter": { "preset": "deal" } },
  "items": {
    "s3":   { "type": "frame", "position": { "x": 1700, "y": 1000 }, "size": { "width": 1600, "height": 900 }, "props": { "label": "Length contraction" } },
    "ship": { "type": "shape", "parent": "s3", "position": { "x": 200, "y": 400 }, "size": { "width": 320, "height": 80 }, "props": { "geometry": "rounded" }, "style": { "fill": "blue" } },
    "t3":   { "type": "text", "parent": "s3", "position": { "x": 80, "y": 60 }, "props": { "text": "Moving rulers get shorter", "fontSize": 48 } }
  },
  "animations": {
    "scene-3": {
      "duration": 7000,
      "tracks": {
        "ship-scale": { "target": "ship", "property": "scale", "keyframes": [{ "at": 1000, "value": 1 }, { "at": 6800, "value": { "x": 0.6, "y": 1 }, "ease": "ease-in-out" }] },
        "t3-reveal":  { "target": "t3", "property": "props.reveal", "keyframes": [{ "at": 0, "value": 0 }, { "at": 800, "value": 1 }] }
      }
    }
  }
}
```

## Items

Common fields: `type`, `parent`, `z`, `position`, `size`, `rotation` (degrees),
`scale`, `origin` (normalized transform origin, default center), `opacity`,
`style`, `props`, `locked`, `metadata`.

- `position` is relative to `parent`; a root item is in world space.
- Children inherit the parent's transform and opacity. Only `frame` items can be parents.
- Draw points and unbound arrow endpoints use item-local coordinates, transformed
  by the item's position and parent frame. Bound endpoints follow the referenced item.
  Shape paths are fitted to the shape's size.
- `z` orders siblings; a new item without `z` goes on top.
- `size` is authored for boxes (`frame`, `shape`, media, `task`, `effect`, `sketch`)
  and derived for `text` (from `fontSize`, optional `props.width` wraps), `draw`
  (from points) and `arrow` (from endpoints).
- `style`: `fill`, `fillOpacity`, `stroke`, `strokeWidth`, `dash`, `radius`, `trim`.
  A color is a palette token (`brand`, `neutral`, `blue`, …, follows the theme),
  any CSS color, or `{ "light": …, "dark": … }`.

| type | props |
|---|---|
| `frame` | `label`, `clip`, optional `decoration` (`frame` or `none`) |
| `text` | `text`, `fontSize`, `fontWeight`, `font`, `align`, `lineHeight`, `width`, `reveal` |
| `shape` | `geometry` (`rectangle` `rounded` `ellipse` `diamond` `triangle` `path`), `path`, `text`, `fontSize`, `align` |
| `draw` | `points` (`{x, y, p}` relative to `position`) |
| `arrow` | `start`, `end` (a point, or `{ "item": id, "anchor"?, "port"? }`), `route`, `bend`, `waypoints`, `arrowStart`, `arrowEnd`, `label`, `fontSize`, `relation` |
| `image` `video` `audio` `file` | `src` (Space file path), `crop` (image), `snapshot` (cached file facts) |
| `task` | `taskRunId`, `snapshot` |
| `effect` | `kind` (`particles` `trail` `impact` `flash` `glow`) and its parameters |
| `sketch` | `src` (a JS module in the Space), `params` |
| `vendor.kind` | any; an extension type, namespaced like `acme.order` |

An extension type is stored as written. A client that registers it (see
`defineBoardItem` in the SDK) checks its props on edit and draws it; any other
client shows a placeholder that still moves and keeps every field.

Background pattern lives in `board.background.kind` (`dots` or `grid`); `board.grid.visible` toggles its overlay and `board.grid.size` sets spacing in board units. The Appearance panel edits all three. Use `cohub boards schema effect` to see which parameters apply to each effect kind.

Deleting an item that is still referenced fails and lists the references; `cascade`
also deletes children and the tracks that target it. Arrows bound to a deleted item
keep their place and fall back to a point. A media item whose `src` is not a usable
Space path is a `legacy.<type>` item: it keeps its place, its snapshot and whatever
else it carried, and it is not edited or exported as media.

### Plain containers

Use `props.decoration: "none"` on a frame to hide its title, border and background.
One position, scale or rotation track on the frame then moves its children together.
The frame remains selectable; clipping is independent of decoration. Set `clip: false`
when children may extend outside it. The web selection toolbar can toggle its appearance.

```json
{"items":{"train":{"type":"frame","props":{"decoration":"none","clip":false},"position":{"x":100,"y":200},"size":{"width":400,"height":180}},"body":{"type":"shape","parent":"train","size":{"width":400,"height":180}}}}
```

## Animations

An animation is a timeline: `duration`, `play` (`manual`, `auto`, `always`),
`delay`, `loop`, `end` (`hold`, `reset`), `markers`, `tracks`. A new animation
written without `duration` lasts until its last keyframe.

A track drives one property of one target:

- `target`: an item id, `camera`, or another animation id.
- `property`: the JSON path in the target (`position`, `position.x`, `opacity`,
  `style.fill`, `props.text`, …). Camera: `focus` (item id or rect), `zoom`, `shake`.
  Animation: `time` (nesting, speed, reverse and hold are all time remapping).
- `keyframes`: `{ at, value, ease? }`. Easing defaults to linear; the destination
  keyframe's CSS easing controls the incoming segment. Before the first keyframe
  and after the last, the property holds its boundary value.
- `composite`: `replace` (default) or `add`. Adds sum positions and rotations and
  multiply scale and opacity. When several `replace` tracks drive the same property
  at once, the one that started later wins, then the lexicographically larger track ID.
  Before any start, the nearest upcoming track wins. Track keys have their own namespace:
  `camera` is a valid key, while `target: "camera"` addresses the animation camera.
- `interpolation`: `auto` (numbers, vectors and colors blend; text, booleans and
  ids step), `step`, or `spline` for smooth position paths; `orient` turns the item
  along the path.

A marker with `pause: true` stops playback there until `next`.

A `focus` track holds its current target until the next focus keyframe.
Use `boards schema track`, `boards schema animation` and `boards schema effect`
for field definitions and behavior.

### Compose chapters

Write each chapter's keyframes relative to its own start, then compile a sequence:

```json
{"chapters":[{"animation":"intro","frame":"cover","label":"Introduction","pause":true},{"animation":"experiment","frame":"lab","label":"Experiment","gap":300,"pause":true}]}
```

```sh
cohub boards sequence lesson.board --animation lecture -i boards/chapters.json > boards/lecture-patch.json
cohub boards apply lesson.board -i boards/lecture-patch.json --dry-run
cohub boards apply lesson.board -i boards/lecture-patch.json --base-version 12
```

`sequence` prints a patch without writing. It offsets source keyframes into an ordinary
parent timeline; source animations remain unchanged. Keep the chapter description and
recompile after changing durations or order. Recompiling the same parent removes stale
generated tracks.

- Each chapter must be a distinct manual animation without nested time tracks.
- Chapters cannot share an additive track's target property, including vector/component
  overlaps. Use distinct items or combine those tracks first.
- Optional, distinct frames control chapter visibility and camera focus. Other camera
  tracks are retained; without a frame, the helper does not infer chapter membership.
- Child markers are promoted. End pauses retain the outgoing chapter, with a 1 ms
  boundary before the next chapter.

The web timeline offers **Combine chapters**, ordering, frame selection and pauses.
Labeled markers provide local chapter navigation without seeking shared playback.
The SDK exposes `boardSequence` and `boardSequencePatch` for the same compilation.

### Sample paths

```json
{"points":[{"x":0,"y":0},{"x":100,"y":0},{"x":100,"y":300}],"duration":2000,"samples":64,"orient":true}
```

```sh
cohub boards path ship -i boards/path.json > boards/path-track.json
```

`boardPathTrack` / `boards path` returns a standard position track sampled by polyline
distance. Original vertices are retained so interpolation does not cut corners.
It creates no live dependency on another item. Use sketch/scripts for procedural
meshes, physics and specialized drawings.

## Writing

`apply` is the only write. It takes a JSON Merge Patch of the document: fields you
write merge, `null` deletes, anything unmentioned stays. `replace` makes the
document equal to the input. Each apply is one transaction holding the before and
after state of every entity it changed, so history can be replayed and restored.
It also keeps the patch as it was reported — `replace` and `cascade` recorded as
`$replace` and `$cascade`, since they are directives rather than document values —
and a write that changed nothing records that patch alone. Versions are ordered
but not contiguous. Without `baseVersion` concurrent writers merge
field by field; with it a stale write fails.

## Export

Use `--frame`, `--items` or `--rect` for a fixed region, or `--camera` for the animation's
view at a specified time:

```sh
cohub boards export lesson.board --frame lab -o lab.png
cohub boards export lesson.board --animation lecture --at 10s --camera --size 1600x900 -o preview.png
cohub boards export lesson.board --animation lecture --at 1s,5s,9s --camera -o /tmp/preview-%d.png
cohub boards export lesson.board --animation lecture --at 0:30s:100ms --camera -o lesson.mp4
```

Camera and fixed region options are mutually exclusive. `--size` determines camera
output dimensions; `--scale` applies to fixed regions. In the web export dialog, choose
an animation and time, then **Follow camera**. Export does not change shared playback.

Trails reconstruct recent target positions when seeking or exporting directly at a time.
`follow` applies to trails only; use a shared parent frame to move a particle emitter
with another item.

Image sequences are written one frame at a time. Video export checks ffmpeg first,
uses one document snapshot, stores frames on temporary disk, and publishes the encoded
result after success. Ctrl+C cancels work. Replacing an existing output requires
`--force`. Frame rate is inferred from the range step; an explicit `--fps` must agree,
and video times must be evenly spaced.

For batch rendering, reuse `createBoardRenderSampler(document, animation, theme)` from
`@neta-art/cohub/board/render` with `exportBoardImageBytes` or `renderBoardExport`.
It resolves theme tokens and CSS alpha consistently with rendering. Use
`createBoardAnimationSampler` for geometry sampling or with an explicit color resolver.
Caches are bounded and scoped to the document snapshot.

The CLI's `runBoardExport` accepts an asynchronous `onFrame(frame, index)` consumer
with backpressure, `signal` and `onProgress`. Contact sheets, reports and encoders can
consume frames without adding layout policies to the renderer. Images are selected
for the current viewport; sequence export releases textures that leave it.

## Inspect and measure

```sh
cohub boards inspect lesson.board --animation lecture --at 1s,5s,9s --json
cohub boards inspect lesson.board --items title,formula --json
```

Results include world bounds, text dimensions and lines, and item-specific hints.
`measureBoardText` uses the rendering font stack and layout rules. `inspectBoardScene`
reports possible clipped or overlapping text, unavailable glyphs and unused `follow`
parameters. Checks have work/output limits; hints are advisory and never block saving.
Font availability affects measurements and glyph coverage.

In the web export dialog, **Check layout** inspects the selected time. Select a hint
to locate its item. This is a local inspection, not a shared playback command.
