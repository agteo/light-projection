# Lazy Mapper

Local browser app for HDMI projection mapping: draw corner-pinned zones, assign effects or media, and output a fullscreen composite to a second display.

Clean-room implementation inspired by the Lazy Lighting workflow — no copied assets, code, or branding.

## Status

**Phase 8 complete** — MIDI learn mappings (Chrome/Edge). See [PROGRESS.md](./PROGRESS.md) for phased build status and [lazy-lighting-clone-spec.md](./lazy-lighting-clone-spec.md) for the full product spec.

**Stack (locked):** Vanilla TypeScript · Vite · WebGL2 · `BroadcastChannel` editor↔output sync.

## Quick start

```bash
npm install
npm run dev
```

```bash
npm run build
npx serve dist
```

Use **Enable mic**, then bind a zone (e.g. bass→opacity) for a clap test. Open **Output** for the projector; **B** blackouts.
## Projector setup (summary)

1. Open the editor (`npm run dev`) in Chrome/Edge.
2. Click **Open output** (allow popups if prompted).
3. Drag the output window to the projector display and fullscreen it (`Fullscreen` / `F` / `F11`).
4. Corner-pin zones in the editor; use Test pattern / White aids to focus.
5. Press **B** for instant blackout.

Full setup notes land in Phase 9.

## Safety

Strobe effects are capped by default. Photosensitivity warning will appear in the UI/README when that effect ships.

## License

TBD.
