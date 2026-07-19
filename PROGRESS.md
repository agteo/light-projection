# Lazy Mapper — Progress

Living tracker for building the local web projection-mapping app from `lazy-lighting-clone-spec.md`.

**Last updated:** 2026-07-19 (Phase 3)

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
| 1 | Scaffold, state, save/load | ✅ done | Vite + TS; `ProjectStore`; auto localStorage; JSON export/import; zone add/rename/dup/delete |
| 2 | WebGL homography + test pattern | ✅ done | `quadToUnitSquare` + WebGL2 warp; procedural test pattern; corner drag with convexity guard |
| 3 | Editor canvas interactions | ✅ done | Edge midpoints; move; Shift-scale; double-click add; arrow nudge (Shift=10px) |
| 4 | Effects library + source panel | ⬜ todo | All 8 shaders; color/speed/params |
| 5 | Media + compositing | ⬜ todo | Image/video, blend, opacity, feather, zIndex |
| 6 | Output window + sync | ⬜ todo | `window.open`, BroadcastChannel, blackout, fullscreen |
| 7 | Audio reactivity | ⬜ todo | Analyser bands, bindings, level meter |
| 8 | MIDI learn | ⬜ todo | Feature-detect; CC/note mappings in project JSON |
| 9 | Polish + README | ⬜ todo | Subdivide, test/white aids, projector setup notes |

Status legend: `⬜ todo` · `🚧 in progress` · `✅ done` · `⛔ blocked`

## Phase 3 notes (2026-07-19)

- Edge midpoint handles (square) move both endpoints of that edge
- Drag inside quad → translate; Shift-drag → scale about centroid
- Double-click empty canvas → add centered zone
- Arrow keys nudge selected corner (if one active) or whole zone by 1px / 10px with Shift
- Focus the preview overlay to receive keyboard input

## Phase 2 notes (2026-07-19)

- Math: `src/math/homography.ts` — 8-DOF DLT, invert, convexity check
- Render: `src/render/renderer.ts` + shaders — per-fragment `H_inv` sampling (not affine tris)
- UI: canvas preview + overlay handles; Test pattern / White modes
- Verify visually: drag corners into extreme trapezoid — checker/grid must stay straight
- `npm run build` passes

## Phase 1 notes (2026-07-19)

- Package: `lazy-mapper` (Vite 8 + TypeScript)
- Domain: `src/domain/types.ts`, `src/domain/factory.ts`
- State: `src/state/store.ts` (subscribe + mutations, auto-persists)
- Persistence: `src/state/persistence.ts` — serializes media as filename + `missing: true` (no object URLs in JSON)
- UI: minimal shell to exercise round-trips (`src/ui/shell.ts`)
- Verify: `npm run build` passes; use `npm run dev` for manual save/export/import checks

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

### Phase 1–2 slice (partial acceptance)

- [x] Project survives reload via localStorage (auto-save on edits)
- [x] JSON export/import round-trips (media refs → missing state)
- [x] `npm run build` produces a static bundle
- [x] Perspective correctness path in place (homography + projective UV) — confirm visually with extreme trapezoid

## Privacy (public repo)

Do **not** commit:

- `.env` / secrets / API keys / tokens
- Absolute local paths (e.g. `/Users/...`)
- Personal emails, private notes, or machine-specific config
- Media files used for local testing (keep them outside the repo or gitignored)

Safe to commit: source, docs, the clean-room spec, this tracker, public README.

## Blockers / open questions

_None. Ready for Phase 4 (effects library + source panel)._
