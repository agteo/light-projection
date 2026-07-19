import type { Project, SourceAssignment, Vec2, Zone } from './types';
import { PROJECT_VERSION } from './types';
import { DEFAULT_EFFECT_ID, defaultParamsFor } from '../effects/registry';

export function createId(prefix = 'id'): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function defaultCorners(size = 0.4): [Vec2, Vec2, Vec2, Vec2] {
  const half = size / 2;
  const cx = 0.5;
  const cy = 0.5;
  return [
    { x: cx - half, y: cy - half },
    { x: cx + half, y: cy - half },
    { x: cx + half, y: cy + half },
    { x: cx - half, y: cy + half },
  ];
}

export function defaultEffectSource(effectId = DEFAULT_EFFECT_ID): SourceAssignment {
  return {
    kind: 'effect',
    effectId,
    params: defaultParamsFor(effectId),
    color1: '#ff6644',
    color2: '#2244ff',
    speed: 1,
  };
}

export function createZone(
  partial: Partial<Omit<Zone, 'id' | 'name' | 'zIndex'>> & {
    name: string;
    zIndex: number;
  },
): Zone {
  return {
    id: createId('zone'),
    corners: defaultCorners(),
    source: defaultEffectSource(),
    opacity: 1,
    blendMode: 'normal',
    feather: 0,
    audio: null,
    visible: true,
    ...partial,
  };
}

export function createDefaultProject(name = 'Untitled'): Project {
  const zone = createZone({ name: 'Zone 1', zIndex: 0 });
  return {
    version: PROJECT_VERSION,
    name,
    zones: [zone],
    midiMappings: [],
    blackout: false,
  };
}
