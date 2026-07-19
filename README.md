# Lazy Mapper

Local browser app for HDMI projection mapping: draw corner-pinned zones, assign effects or media, warp them with a projective (homography) transform, and output a fullscreen composite to a second display.

**Stack:** Vanilla TypeScript · Vite · WebGL2 · `BroadcastChannel` editor↔output sync.

See [PROGRESS.md](./PROGRESS.md) for build history and [SPEC.md](./SPEC.md) for the product spec.

## Quick start

```bash
npm install
npm run dev
```

Production static build:

```bash
npm run build
npx serve dist
```

Open the editor URL Vite prints (usually `http://localhost:5173`). Use **Chrome or Edge** for MIDI and the best second-screen support.

## Projector setup

1. Connect the HDMI projector as an extended display (not mirrored).
2. In the editor, click **Open output** (allow popups if the browser blocks them).
3. Drag the output window onto the projector screen.
4. Fullscreen it (`Fullscreen` button, `F`, or `F11`).
5. In the editor, enable **Test pattern** or **White** to focus/align, then switch back to **Live**.
6. Corner-pin each zone to a physical surface; use arrow keys for 1px nudges (Shift = 10px).
7. Press **B** anytime for an instant blackout.

If `getScreenDetails()` is available and permitted, **Open output** tries to place the window on a non-primary screen. Otherwise place it manually.

## Editor overview

| Area | What it does |
|------|----------------|
| Preview | Live WebGL composite; drag corners / edge midpoints; drag inside to move; Shift-drag to scale |
| Zones | Add, rename, duplicate, delete, ↑↓ z-order, **Split 2×2 / 3×3** |
| Source | Effect / solid / image / video; colors, speed, params; opacity, feather, blend |
| Audio | Enable mic; per-zone band→target bindings (opacity / speed / scale / hue) |
| MIDI | Chrome/Edge: Learn mappings for blackout, opacity, visibility, effect speed |
| Persistence | Auto-saves to `localStorage`; JSON export/import |

### Canvas tips

- Double-click empty preview space to add a centered zone.
- Click a corner handle (yellow when active) then use arrows to nudge that corner.
- **Split 2×2 / 3×3** replaces the selected zone with a grid filling the same quad (handy for multi-surface layouts).

### Media notes

- Image/video files use blob URLs. After reload, re-import files (filenames are remembered; missing media shows a placeholder).
- Video defaults to muted + loop to satisfy autoplay policies.

### Audio clap test

1. **Enable mic** (grant permission).
2. Select a zone → Source → enable audio binding → band **bass**, target **opacity**.
3. Clap or play bass-heavy audio — the zone should pulse.

### MIDI learn

1. **Connect MIDI** in Chrome/Edge.
2. Click **Learn** next to a target.
3. Move a CC knob or press a pad/note within 15 seconds.
4. Mappings are stored in the project JSON.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| Arrow keys | Nudge selected corner or zone (1px) |
| Shift + arrows | Nudge 10px |
| B | Toggle blackout |
| F (output window) | Toggle fullscreen |
| Double-click empty canvas | Add zone |

## Safety — strobe / photosensitivity

The **Strobe** effect is capped at **3 Hz** by default. Unlocking higher rates shows an in-app warning. Flashing lights can trigger seizures in photosensitive people — leave the cap on unless you know your audience and venue.

## Architecture (short)

- Editor and output each run their own WebGL render loop.
- Shared project state syncs over `BroadcastChannel` (`lazy-mapper-sync-v1`).
- Zone warps use a CPU 3×3 homography with per-fragment inverse mapping (no affine triangle seams).

## Non-goals (v1)

No AirPlay/casting, no multi-projector, no accounts, no mobile touch editor, no video recording/export.

## License

TBD — add a license before public redistribution if needed.
