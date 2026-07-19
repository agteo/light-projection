import type { Vec2, Zone } from './types';
import { createZone } from './factory';

function mix(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Bilinear sample on a TL,TR,BR,BL quad in unit UV. */
export function sampleQuad(corners: readonly [Vec2, Vec2, Vec2, Vec2], u: number, v: number): Vec2 {
  const [tl, tr, br, bl] = corners;
  const top = mix(tl, tr, u);
  const bottom = mix(bl, br, u);
  return mix(top, bottom, v);
}

/**
 * Replace one zone with an n×n grid of zones that fill the same quad.
 * Copies source/compositing/audio from the parent (structured clone).
 */
export function subdivideZone(zone: Zone, n: 2 | 3, nextZIndexStart: number): Zone[] {
  if (n < 2) throw new Error('Subdivision requires n >= 2');
  const created: Zone[] = [];
  let z = nextZIndexStart;

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const u0 = col / n;
      const u1 = (col + 1) / n;
      const v0 = row / n;
      const v1 = (row + 1) / n;
      const corners: [Vec2, Vec2, Vec2, Vec2] = [
        sampleQuad(zone.corners, u0, v0),
        sampleQuad(zone.corners, u1, v0),
        sampleQuad(zone.corners, u1, v1),
        sampleQuad(zone.corners, u0, v1),
      ];

      const source = structuredClone(zone.source);
      // Media object URLs can be shared across sibling zones
      created.push(
        createZone({
          name: `${zone.name} ${row + 1}×${col + 1}`,
          zIndex: z++,
          corners,
          source,
          opacity: zone.opacity,
          blendMode: zone.blendMode,
          feather: zone.feather,
          audio: zone.audio ? structuredClone(zone.audio) : null,
          visible: zone.visible,
        }),
      );
    }
  }

  return created;
}
