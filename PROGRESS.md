# Lazy Mapper — Progress

Living tracker for building the local web projection-mapping app from `lazy-lighting-clone-spec.md`.

**Last updated:** 2026-07-19

## Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| UI stack | Vanilla TypeScript | Minimal deps; WebGL-first |
| Editor ↔ output sync | `BroadcastChannel` | Output window owns its own render loop; no pixel streaming |
| Persistence | `localStorage` + JSON export/import | Media files are references only (re-prompt on load) |

## Phase status

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 0 | Repo bootstrap & public hygiene | ✅ done | Spec + tracker + `.gitignore` on GitHub |
| 1 | Scaffold, state, save/load | ⬜ todo | Vite + TS; in-memory store; localStorage + JSON |
| 2 | WebGL homography + test pattern | ⬜ todo | Single zone; verify extreme trapezoid (no affine seam) |
| 3 | Editor canvas interactions | ⬜ todo | Select, handles, move/scale, add/delete, keyboard nudge |
| 4 | Effects library + source panel | ⬜ todo | All 8 shaders; color/speed/params |
| 5 | Media + compositing | ⬜ todo | Image/video, blend, opacity, feather, zIndex |
| 6 | Output window + sync | ⬜ todo | `window.open`, BroadcastChannel, blackout, fullscreen |
| 7 | Audio reactivity | ⬜ todo | Analyser bands, bindings, level meter |
| 8 | MIDI learn | ⬜ todo | Feature-detect; CC/note mappings in project JSON |
| 9 | Polish + README | ⬜ todo | Subdivide, test/white aids, projector setup notes |

Status legend: `⬜ todo` · `🚧 in progress` · `✅ done` · `⛔ blocked`

## How to update this doc

After finishing a phase (or a meaningful chunk):

1. Set that phase’s status and add a short note (date + what landed).
2. Check off any acceptance items that are now true.
3. Commit with a message that names the phase (e.g. `feat(phase-2): homography warp + test pattern`).

## Acceptance checklist

From the spec — mark when verified:

- [ ] Create 3 zones, corner-pin each to different trapezoids, assign a different effect to each — output window shows all three warped correctly at ~60 fps
- [ ] Perspective correctness: checkerboard in an extreme quad shows straight lines, no affine seam
- [ ] Video plays warped inside a zone; image fits per fit mode
- [ ] Clap test: bass→opacity binding reacts to mic input
- [ ] MIDI CC mapped to zone opacity works live
- [ ] `B` blacks out output instantly; project survives reload via localStorage; JSON export/import round-trips
- [ ] `npm run build` produces a static bundle that works via `npx serve`

## Privacy (public repo)

Do **not** commit:

- `.env` / secrets / API keys / tokens
- Absolute local paths (e.g. `/Users/...`)
- Personal emails, private notes, or machine-specific config
- Media files used for local testing (keep them outside the repo or gitignored)

Safe to commit: source, docs, the clean-room spec, this tracker, public README.

## Blockers / open questions

_None for Phase 0. Add items here as they appear during implementation._
