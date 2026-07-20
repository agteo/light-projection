# Light Mapper — Product Spec

## Context

Light Mapper is a local web app that turns any HDMI projector into a projection mapping tool. The user draws quad-shaped "zones" over real-world surfaces, assigns visuals (effects, images, videos) to each zone, warps the corners so projections align with physical objects, and makes visuals react to audio/MIDI. It runs entirely in the browser with no backend.

## Deliverable

A single-page web app, no backend, runnable via `npm run dev` (Vite) and buildable to static files. Vanilla TypeScript; keep dependencies minimal. All state in-memory + persisted to `localStorage` (project save/load as JSON export/import too).

Two windows:
1. **Editor window** — the main UI: zone list, canvas editor, effect/media assignment, audio/MIDI panels.
2. **Output window** — opened via `window.open()`, fullscreened on the projector display (user presses F11 or use the Fullscreen API + Window Management API `getScreenDetails()` to place it on the second screen when available). Renders ONLY the final composited output on black.

Both windows render from shared state. Use a `BroadcastChannel` for editor→output sync, and render in the output window itself (don't stream pixels).

## Core Domain Model

```ts
type Vec2 = { x: number; y: number };            // normalized 0..1 output-space coords

interface Zone {
  id: string;
  name: string;
  corners: [Vec2, Vec2, Vec2, Vec2];             // TL, TR, BR, BL — corner-pinned quad
  source: SourceAssignment;                       // what plays inside the zone
  opacity: number;                                // 0..1
  blendMode: 'normal' | 'add' | 'multiply' | 'screen';
  feather: number;                                // edge softness in px
  audio: AudioBinding | null;                     // reactivity config
  visible: boolean;
  zIndex: number;
}

type SourceAssignment =
  | { kind: 'effect'; effectId: string; params: Record<string, number>; color1: string; color2: string; speed: number }
  | { kind: 'image'; objectUrl: string; fit: 'cover' | 'contain' | 'stretch' }
  | { kind: 'video'; objectUrl: string; fit: 'cover' | 'contain' | 'stretch'; loop: boolean; muted: boolean }
  | { kind: 'solid'; color: string };

interface AudioBinding {
  band: 'bass' | 'mid' | 'treble' | 'level';      // which frequency band drives it
  target: 'opacity' | 'speed' | 'scale' | 'hue';  // what it modulates
  amount: number;                                  // 0..1 modulation depth
  smoothing: number;                               // 0..1
}
```

## Rendering (the heart of the app)

Use **WebGL2** (raw or via a thin helper; avoid heavyweight engines). Render loop at display refresh via `requestAnimationFrame`.

Per zone:
1. Render the zone's source (effect shader, image texture, or video texture via `texImage2D` from a `<video>` element) into the zone's local UV space.
2. Warp it into the output with a **projective (homography) transform** mapping the unit square to the zone's 4 corners. Compute the 3×3 homography on the CPU (standard 8-DOF solve from 4 point correspondences), pass as a mat3 uniform, and do perspective-correct texturing (divide by w in the fragment shader, or use a vec3 texcoord). Do NOT use two naive triangles with affine interpolation — that produces the classic seam artifact.
3. Apply opacity, feather (smoothstep falloff from quad edges in UV space), and blend mode (implement via framebuffer blending equations, or a compositing pass).

Zones composite in zIndex order onto black.

### Built-in effects (fragment shaders, ~8 minimum)

Each is a GLSL fragment shader over the zone's UV with uniforms `u_time, u_color1, u_color2, u_speed, u_audio` (0..1 driven level) plus per-effect params:

1. Solid pulse (breathing brightness)
2. Linear gradient sweep
3. Horizontal/vertical scrolling bars
4. Plasma / smooth noise (value or simplex noise, animated)
5. Concentric rings radiating from center
6. Strobe (careful: cap at ≤ 3 Hz by default with a warning toggle for higher)
7. Sparkle/starfield
8. Waveform/spectrum bars (fed from audio analyser data via a 1D texture)

All effects must respond to `u_audio` when an AudioBinding is set (e.g., speed/brightness scale with it).

## Editor UX

- **Canvas editor**: shows the composited output preview. Selected zone shows draggable corner handles (hit radius ≥ 12px) and edge midpoints; drag inside the quad moves the whole zone; shift-drag scales about center. Double-click empty space (or an "Add Zone" button) creates a new zone as a centered rectangle.
- A subdivide helper: "Split 2×2 / 3×3" button that replaces a selected zone with a grid of zones filling the same quad.
- **Zone panel**: list with reorder (zIndex), rename, duplicate, delete, visibility toggle.
- **Source panel**: pick effect + tweak params/colors/speed, or drop/import an image/video file (use object URLs; re-prompt for files on project load since object URLs don't persist — store file names and show "missing media" state).
- **Alignment aids**: a "Test pattern" toggle that renders a grid + corner markers in every zone, and a "White" toggle (all zones full white) for focusing the projector.
- Keyboard: arrow keys nudge selected corner/zone by 1px (shift = 10px); this matters — pixel-level alignment is the whole point of projection mapping.
- **Blackout** hotkey (`B`) that instantly blacks the output.

## Audio Reactivity

- `getUserMedia({ audio })` → `AnalyserService` with one `AnalyserNode` (fftSize 2048).
- Derive per-frame: overall level (RMS), bass (~20–250 Hz), mid (~250–2k), treble (~2k–8k) by averaging FFT bins; apply exponential smoothing per the binding's smoothing value.
- Editor shows a live level meter; each zone's AudioBinding UI has band/target/amount/smoothing controls.
- Feed the resolved value into the zone's `u_audio` uniform / modulation target.

## MIDI

- Web MIDI API (`navigator.requestMIDIAccess()`), Chrome/Edge only — feature-detect and hide the panel elsewhere.
- MIDI Learn flow: user clicks "Learn" next to any mappable control (zone opacity, effect speed, master blackout, zone visibility), moves a knob/presses a pad, mapping is captured (CC → continuous controls, Note → toggles). Persist mappings in the project JSON.

## Non-Goals (v1)

- No AirPlay/casting (browser can't; HDMI second display covers it), no multi-projector, no accounts/payments, no mobile touch editor (desktop mouse/keyboard is fine), no recording/export of video.

## Suggested Build Order (commit after each)

1. Scaffold (Vite + TS), state store, project save/load to localStorage + JSON export.
2. WebGL renderer: single zone, homography warp with perspective-correct sampling, test pattern effect. **Verify visually: drag corners into an extreme trapezoid — the grid must stay straight-lined with no diagonal seam.**
3. Editor canvas: selection, corner handles, move/scale, add/delete zones, keyboard nudge.
4. Effects library (all 8), source panel, per-zone color/speed/params.
5. Image/video sources, blend modes, opacity, feather, zIndex compositing.
6. Output window + BroadcastChannel sync + blackout + fullscreen handling.
7. Audio input, band analysis, bindings, level meter.
8. MIDI learn + mappings.
9. Polish: subdivide helper, test-pattern/white toggles, README with usage + projector setup notes.

## Acceptance Checklist

- [ ] Create 3 zones, corner-pin each to different trapezoids, assign a different effect to each — output window shows all three warped correctly at 60 fps.
- [ ] Perspective correctness: a checkerboard test pattern in an extreme quad shows straight lines, no affine seam.
- [ ] Video file plays warped inside a zone; image fits per fit mode.
- [ ] Clap test: with a bass→opacity binding, zone visibly reacts to mic input.
- [ ] MIDI CC mapped to zone opacity works live (test with a virtual MIDI device if no hardware).
- [ ] `B` blacks out output instantly; project survives reload via localStorage; JSON export/import round-trips.
- [ ] `npm run build` produces a static bundle that works via `npx serve`.

## Notes & Pitfalls

- Video textures: call `texImage2D` per frame only when `video.readyState >= 2`; handle autoplay policies (require a user gesture to start playback).
- `localStorage` cannot hold media files — persist references only.
- Strobe safety: default cap and a photosensitivity warning in the README/UI.
- Window Management API needs a permission prompt and HTTPS/localhost; degrade gracefully to manual "drag window to projector + F11".
- Homography solve: guard against degenerate (self-intersecting) quads — clamp handle dragging so the quad stays convex, or at least don't crash.
