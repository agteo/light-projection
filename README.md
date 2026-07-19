# Lazy Mapper

Local browser app for HDMI projection mapping: draw corner-pinned zones, assign effects or media, and output a fullscreen composite to a second display.

Clean-room implementation inspired by the Lazy Lighting workflow — no copied assets, code, or branding.

## Status

Early bootstrap. See [PROGRESS.md](./PROGRESS.md) for phased build status and [lazy-lighting-clone-spec.md](./lazy-lighting-clone-spec.md) for the full product spec.

**Stack (locked):** Vanilla TypeScript · Vite · WebGL2 · `BroadcastChannel` editor↔output sync.

## Quick start (once Phase 1 lands)

```bash
npm install
npm run dev
```

```bash
npm run build
npx serve dist
```

## Projector setup (summary)

1. Open the editor in Chrome/Edge on the laptop.
2. Open the **Output** window and move it to the projector display.
3. Fullscreen the output (`F11` or the in-app fullscreen control).
4. Corner-pin zones to physical surfaces; use Test pattern / White aids to focus.

Full setup notes land in Phase 9.

## Safety

Strobe effects are capped by default. Photosensitivity warning will appear in the UI/README when that effect ships.

## License

TBD.
