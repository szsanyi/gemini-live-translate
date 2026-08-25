# Session store and recordings library

**Date:** 2026-08-04
**Status:** approved
**Follows:** `2026-08-04-translation-and-speech-toggles-design.md`

## Problem

Everything a session produces — transcript pairs, notes, AI summaries — lives in
React state. A page refresh destroys it. This has already bitten during real use:
a recorded meeting was one accidental `F5` away from being lost, and the only
durable artifact is a manual "Save to Obsidian" export.

There is also no way to look at anything recorded earlier. The app has no memory.

## Goals

1. Nothing is lost to a refresh, a crash, or a closed tab.
2. A list of previous recordings, openable back into the normal interface.
3. Deleting a recording, confirmed, including its Obsidian note.
4. Optionally keep the captured audio alongside the transcript (phase 2).

## Design

### Storage layout

One directory per session under a gitignored data root:

```
data/sessions/<id>/session.json
data/sessions/<id>/audio.webm     (phase 2, optional)
```

A directory rather than a flat file, because the audio recording lands next to its
transcript in phase 2 and deleting a session then means removing one directory.

`<id>` is derived from the creation time (`2026-08-04T19-48-12-<short random>`), so
the directory listing sorts chronologically and two sessions started in the same
second cannot collide.

### Session file

```jsonc
{
  "version": 1,
  "id": "2026-08-04T19-48-12-a3f9",
  "createdAt": "…", "updatedAt": "…",
  "title": "Firmware check for failed hardware upgrade",   // AI subject, or null
  "profile": { "model": "…", "sourceLang": "hu", "targetLang": "en",
               "bidirectional": false, "translate": true, "speak": false,
               "audioSource": "microphone" },
  "elapsedMs": 612000,          // total recorded time, so a resume continues cues
  "pairs": [...], "notes": [...], "summaries": [...],
  "obsidianPath": "/…/2026-08-04 19-48 subject.md",         // or null
  "hasAudio": false
}
```

**Date handling is the one real trap here.** `TranslationPair.timestamp`,
`NoteEntry.timestamp` and `SummaryEntry.timestamp` are `Date` objects; JSON turns
them into strings, and a revived session whose timestamps are strings breaks
`buildTranscriptBlocks` (it calls `.getTime()`) and every export path. So
serialization is not incidental — `serializeSession` / `parseSession` live in
`shared/session.ts` as pure functions with unit tests, and nothing else is allowed
to hand-roll it.

`version` exists so a later format change can migrate instead of guessing.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/sessions` | Listing: id, title, timestamps, counts, profile, `elapsedMs`, `hasAudio`. Never the bodies. |
| `GET` | `/api/sessions/:id` | The full session. |
| `PUT` | `/api/sessions/:id` | Upsert — this is the autosave target. |
| `DELETE` | `/api/sessions/:id` | Remove the directory, and the Obsidian note when asked. |

A session file that fails to parse is skipped in the listing with a server-side
warning. One corrupt file must not make the whole library unreadable.

`:id` is validated against `^[A-Za-z0-9T:_-]+$` and the resolved path is checked to
sit inside the sessions root before any read, write, or delete. Path traversal
through a session id would otherwise be a delete-anything primitive.

### Autosave

Client-side, debounced 3 s after the last change to pairs / notes / summaries /
title / obsidianPath, plus:

- an immediate flush when a recording stops,
- `navigator.sendBeacon` on `pagehide`, because a normal `fetch` during unload is
  routinely cancelled.

The session id is created when a recording starts, or when the first note is added
outside a recording — whichever happens first. Sessions with no content at all are
never written.

### Resuming

Any session in the list can be loaded and recorded into further. Two consequences:

- **Cue offsets continue.** `startMs`/`endMs` are relative to the start of
  recording. On resume, new segments are offset by the stored `elapsedMs`, so
  subtitle cues stay monotonic across sessions instead of restarting at zero.
  `elapsedMs` is updated on every stop.
- **Modes may mix.** Resuming in a different mode leaves interpreter cards and
  recording-only cards in one transcript. This is coherent without extra work
  because each pair already stores its own `sourceLang`, `targetLang` and
  `bidirectional`, and `TranscriptCard` already renders single-column when a pair
  has no translation. The session's stored `profile` reflects the most recent run.

### Deleting

The confirmation dialog names what will be removed, including the Obsidian note's
actual filename when `obsidianPath` is set. Deleting removes the session directory
and that note.

**Deleting the note is deliberately narrow**, because it reaches outside the app's
own data into the user's vault: only the exact path the app recorded itself, and
only when it resolves inside the configured `OBSIDIAN_VAULT_DIR`. The containment
check already used by `saveToObsidian` is reused. Anything else is refused and
reported, leaving the session deletion to succeed on its own.

### UI

- A **Recordings** button in the header opens a drawer listing sessions, newest
  first: title or date, time, duration, a mode badge, segment/note/summary counts,
  and a delete action.
- Selecting one loads it into the normal interface. A bar marks which recording is
  open, with a "New recording" action to start fresh.
- The current session appears in the list as soon as it has content, so a refresh
  mid-meeting means reopening it and carrying on.
- New i18n keys in both EN and HU, as everywhere else.

### Error handling

- **A failed autosave must not interrupt a recording.** It surfaces as an unobtrusive
  "not saved" indicator and retries on the next change; the transcript in memory
  stays authoritative until a write succeeds.
- A failed load leaves the current view untouched and reports the error.
- The sessions directory is created on demand, like the vault directory.

### Testing

- **Unit:** `serializeSession` / `parseSession` round-trip, including that revived
  timestamps are real `Date`s and that a revived session still renders through
  `buildTranscriptBlocks` and the exporters. Rejection of malformed input.
- **Unit:** session id validation rejects traversal attempts (`../`, absolute paths).
- **Manual/HTTP:** create → list → load → delete against the running server;
  refresh mid-recording and confirm the session is listed and resumable.

## Phase 2 — audio recording

Kept separate so phase 1 ships and gets used first.

- `MediaRecorder` on the same `MediaStream` the capture pipeline already opens (mic
  or tab audio), producing WebM/Opus — roughly 11–14 MB per hour, against ~115 MB
  for 16 kHz WAV, which is what makes it safe to keep in a vault.
- Off by default, enabled by a pre-session checkbox alongside the mode toggles.
- Chunks are POSTed to `/api/sessions/:id/audio` as they arrive, so a crash keeps
  what was recorded so far rather than losing an in-memory blob.
- Downloadable from the recordings list. When saving to Obsidian with audio present,
  the file is copied into the vault and embedded as `![[…]]`, which Obsidian renders
  as an inline player.

## Out of scope

- Multi-device sync, or any server-side auth. This is a local-first single-user app.
- Editing transcript text after the fact.
- Full-text search across recordings.
