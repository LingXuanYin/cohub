---
name: score-editor
description: Write, check and hand over song2 `.abc` scores in Cohub, edit a score the user points at, or generate a song with a score. Use when the user asks for a score, lead sheet or chord chart; to change bars, chords, tempo, key, sections or lyrics; to fix a score that does not read; or when a score handoff arrives with a change report.
---

# Scores in Cohub

A score in Cohub is a `.abc` file in the Space, opened by the score editor App. Agents write the file, check it with the song2 dialect package, and hand it over as a `/workspace/` link. A generated song's score lives in its task record; write it to a `.abc` before handing it to the user.

Use this skill to write a new score, edit a `.abc` the user points at, regenerate a song from a handed-off score, or explain how a score opens.

The editing itself — reading, note ids, one command, diagnostics, writing back, the change report — is the skill in `@neta-art/score-editor`. Read it and follow it; this page only adds Cohub's part: where a song and its score live, the handoff, the write rules and generation.

## Start here

Install the latest packages in a scratch directory:

```bash
mkdir -p /tmp/score-work && cd /tmp/score-work
npm init -y
npm install @neta-art/score-editor@latest @neta-art/score-dialect-song2@latest
```

Read `node_modules/@neta-art/score-editor/skills/score-editor/SKILL.md` and its `references/edit-a-score.md`. The skill ships inside the package, so its version is the package version: check that both packages are the same version and reread the skill whenever you install. For the text itself, read `node_modules/@neta-art/score-dialect-song2/WRITING.md` (how to write a correct score) and its `RULES.md`.

## Where the score is

| The source | Where to read it |
| --- | --- |
| A score file | A `.abc` in the Space, often under `scores/`. Read it with the file tools, or `cohub spaces files cat <path>`. It is the document: edit it and save back to the same path. |
| A generated song | `cohub tasks get <taskRunId> --json` prints `{ run, progress }`. The score is `.run.result.output[]` where `type == "text"` and `meta.role == "abc"`; if that is empty or absent, take the `abc` role from `.run.payload.data.content[]` (or `.run.payload.content[]`). Style is the `prompt` role and lyrics the `lyrics` role from the same input. Seed is `seed` and score mode is song2's `abc_mode`, both in `.run.payload.data.parameters`; `cohub models show song2 --json` names the mode's values. |

The task record is the original; never write to it. A change to a generated score is a new `.abc`, or a draft in the editor App.

List before guessing: `cohub tasks ls --space "$COHUB_SPACE_ID" --json`, `cohub spaces files ls`, or ask the user. `COHUB_SPACE_ID` and `COHUB_SESSION_ID` are the current Space and chat. Never build a task id, Space id or path from a name.

## Write a score by hand

Write the text with the file tools at the path the user named; if there is none, use `scores/<short-name>.abc` and do not overwrite an existing file. Create `scores/` first when it does not exist. For another Space, `cohub -s <spaceId> spaces files write <path> -c "<score>"`.

Start from the smallest correct score in `WRITING.md`, not from a blank page: song2 needs its header, two voices (`Vocal`, `Ins`) and the rules there. Then read the text back with the dialect and run `check`; fix every diagnostic before handing it over. Do not paste a score into chat.

## Hand a score to the user

Give the file as a Markdown link:

```markdown
[Morning train](/workspace/scores/morning-train.abc)
```

The link opens the file with the Space's default `.abc` App, which is the score editor. If the Space uses another App, tell the user to choose the score editor under **Open with…** (and, if they want, **Always open `.abc` files this way**). If no editor App is available, the link opens the built-in text view; say so instead of claiming the score opened in the editor. A `/workspace/` link only works in the Space it belongs to.

When the user asks for a generated song's score, write that score to a new `.abc` in the Space and link it. The task's score item opens the App on the generation, but the `.abc` is the artifact.

## Generate a song with a score

When the request includes a score, pass the score roles and ask for the score back:

```bash
cohub generate -m song2 \
  --text "prompt=<style>" \
  --text "lyrics=<lyrics>" \
  --param return_abc=true \
  --json
# Optional input score, add: --text "abc=<score>"
```

`prompt` (style) and `lyrics` are required; `abc` is the optional input score. With `return_abc=true`, the output has a text block with `meta.role == "abc"`; write it to a new `.abc`, check it, and link it. If the output has no `abc` block, report that instead of writing a score from memory. Keep the seed and score mode when the request gives them. For every other generate option, see the `cohub-generate` skill.

When the user hands over an edited score to regenerate, use the final style, lyrics, seed and score mode from the handoff:

```bash
cohub generate -m song2 \
  --text "prompt=<final style>" \
  --text "lyrics=<final lyrics>" \
  --text "abc=$SCORE" \
  --param seed=<seed> \
  --param abc_mode=<mode> \
  --param return_abc=true \
  --json
```

Change only what the change report asks for; do not rewrite the lyrics or style.

## When the editor hands off

The editor writes the score to a `.abc` and puts a chip in the chat input with the change report, final style, lyrics, seed, score mode and the file path. It does not send. When the user sends it:

1. Read the `.abc` at the path in the chip.
2. Read it with the dialect; if it does not read, report the diagnostics and stop.
3. Regenerate with the values from the chip: `--text "prompt=..."`, `--text "lyrics=..."`, `--text "abc=$SCORE"`, `--param seed=<seed>`, `--param abc_mode=<mode>` and `--param return_abc=true`.
4. Write the returned score to a new `.abc`, check it, and link it. Leave the handed-off file as it was.

## The editor App's launch convention

For an App author, or when the user asks how a score opens:

- **A score file** is opened by the App that declares `.abc`: `<meta name="cohub:file-handlers" content=".abc" />`. The host passes the file in `client.app.onLaunch(({ file }) => ...)` and `invocation.file`; save back to `file.path`.
- **A generated score** is opened with the task run id as a query parameter: `<app-url>?taskRun=<taskRunId>`. The host passes parameters that do not start with `cohub_` to the App unchanged. With `taskRun`, the App reads `client.tasks.get(taskRunId)` and treats it as a generated score; without it, the file is a score file.

## Rules

- **Look ids up.** Task run ids and paths come from commands or the user; note ids from `noteId(voice, start)` or the parsed model; App refs from `cohub apps get` or the App's public URL; command and refusal names from the editor skill. Never build one from memory.
- **Read before you write.** Read the score or task first. Keep the file's version (`mtimeMs` and `size`) when you have it; if the file changed since you read it, or a write answers `409 file_conflict`, stop and ask which version to keep. Do not overwrite.
- **Only the change asked for.** Send one command through the editor skill, write back the project it returns, and keep every other bar and line byte for byte. Do not reformat, rebuild or "improve" the rest.
- **Report the change.** Name the bars and notes, chords, tempo, key, sections or lyrics that changed, the notices, and what you left alone. If a check fails, give the diagnostics and the unchanged score.
- **Generate with the given values.** Do not invent lyrics or style, drop the seed, or change the score mode. `abc` must pass the dialect check before it goes into a generation.
- **Do not use generation as the edit.** Apply the edit to the score with a command; generate a new song only when the user asks for one.

## What this skill does not do

It does not replace the editor skill's editing interface or the package's API; read those. It does not export MIDI or PDF, or write App manifests, `.cohub/apps.json` or permissions. It does not grant access to a Space or change its defaults. There is no MCP interface; use the CLI, the file tools and the two packages.
