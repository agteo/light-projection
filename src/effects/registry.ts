export type EffectParamKind = 'number' | 'boolean' | 'enum';

export interface EffectParamDef {
  key: string;
  label: string;
  kind: EffectParamKind;
  min?: number;
  max?: number;
  step?: number;
  /** For enum: value labels keyed by numeric value. */
  options?: { value: number; label: string }[];
  default: number;
}

export interface EffectDef {
  id: string;
  /** Integer passed to the shader as u_effectId */
  shaderId: number;
  label: string;
  description: string;
  params: EffectParamDef[];
}

/** Shader IDs: 0 reserved for alignment test-pattern (renderer mode). */
export const EFFECTS: EffectDef[] = [
  {
    id: 'solid-pulse',
    shaderId: 1,
    label: 'Solid pulse',
    description: 'Breathing brightness between two colors',
    params: [{ key: 'amount', label: 'Pulse amount', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.45 }],
  },
  {
    id: 'gradient-sweep',
    shaderId: 2,
    label: 'Gradient sweep',
    description: 'Linear gradient that scrolls across the zone',
    params: [
      { key: 'angle', label: 'Angle', kind: 'number', min: 0, max: 360, step: 1, default: 0 },
      { key: 'width', label: 'Softness', kind: 'number', min: 0.05, max: 1, step: 0.01, default: 0.35 },
    ],
  },
  {
    id: 'scrolling-bars',
    shaderId: 3,
    label: 'Scrolling bars',
    description: 'Horizontal or vertical moving bars',
    params: [
      {
        key: 'orientation',
        label: 'Orientation',
        kind: 'enum',
        default: 0,
        options: [
          { value: 0, label: 'Horizontal' },
          { value: 1, label: 'Vertical' },
        ],
      },
      { key: 'density', label: 'Density', kind: 'number', min: 2, max: 24, step: 1, default: 8 },
    ],
  },
  {
    id: 'plasma',
    shaderId: 4,
    label: 'Plasma',
    description: 'Animated smooth noise fields',
    params: [{ key: 'scale', label: 'Scale', kind: 'number', min: 0.5, max: 8, step: 0.1, default: 2.5 }],
  },
  {
    id: 'concentric-rings',
    shaderId: 5,
    label: 'Concentric rings',
    description: 'Rings radiating from center',
    params: [
      { key: 'spacing', label: 'Spacing', kind: 'number', min: 0.04, max: 0.4, step: 0.01, default: 0.12 },
      { key: 'thickness', label: 'Thickness', kind: 'number', min: 0.01, max: 0.2, step: 0.005, default: 0.04 },
    ],
  },
  {
    id: 'strobe',
    shaderId: 6,
    label: 'Strobe',
    description: 'Flashing (capped at 3 Hz unless unlocked)',
    params: [
      { key: 'hz', label: 'Frequency (Hz)', kind: 'number', min: 0.5, max: 12, step: 0.1, default: 2 },
      {
        key: 'uncapped',
        label: 'Allow > 3 Hz (photosensitivity risk)',
        kind: 'boolean',
        default: 0,
      },
    ],
  },
  {
    id: 'sparkle',
    shaderId: 7,
    label: 'Sparkle / starfield',
    description: 'Twinkling points over a dark field',
    params: [
      { key: 'density', label: 'Density', kind: 'number', min: 10, max: 200, step: 1, default: 60 },
      { key: 'size', label: 'Size', kind: 'number', min: 0.002, max: 0.03, step: 0.001, default: 0.01 },
    ],
  },
  {
    id: 'spectrum-bars',
    shaderId: 8,
    label: 'Spectrum bars',
    description: 'Audio spectrum bars (demo data until Phase 7 mic input)',
    params: [{ key: 'bars', label: 'Bar count', kind: 'number', min: 8, max: 64, step: 1, default: 24 }],
  },
];

export const EFFECT_BY_ID = Object.fromEntries(EFFECTS.map((e) => [e.id, e])) as Record<
  string,
  EffectDef
>;

export const DEFAULT_EFFECT_ID = 'solid-pulse';

export function defaultParamsFor(effectId: string): Record<string, number> {
  const def = EFFECT_BY_ID[effectId];
  if (!def) return {};
  return Object.fromEntries(def.params.map((p) => [p.key, p.default]));
}

export function effectShaderId(effectId: string): number {
  return EFFECT_BY_ID[effectId]?.shaderId ?? 1;
}

/** Parse #rgb / #rrggbb to 0..1 RGB. */
export function parseHexColor(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (h.length !== 6) return [1, 1, 1];
  const n = Number.parseInt(h, 16);
  if (Number.isNaN(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
