import type { AudioBinding, Zone } from '../domain/types';
import type { AudioFrame } from './analyser';
import { bandValue, smoothToward } from './analyser';

export interface ZoneAudioMods {
  audio: number;
  opacityMul: number;
  speedMul: number;
  uvScale: number;
  hueShift: number;
}

const identity: ZoneAudioMods = {
  audio: 0,
  opacityMul: 1,
  speedMul: 1,
  uvScale: 1,
  hueShift: 0,
};

/** Per-zone smoothed binding values. */
export class ZoneAudioState {
  private readonly smoothed = new Map<string, number>();

  reset(): void {
    this.smoothed.clear();
  }

  resolve(zone: Zone, frame: AudioFrame | null): ZoneAudioMods {
    const binding = zone.audio;
    if (!binding || !frame) {
      this.smoothed.delete(zone.id);
      return identity;
    }

    const raw = bandValue(frame, binding.band);
    const prev = this.smoothed.get(zone.id) ?? raw;
    const value = smoothToward(prev, raw, binding.smoothing);
    this.smoothed.set(zone.id, value);

    const amount = clamp01(binding.amount);
    const audio = value * amount;

    return {
      audio,
      opacityMul: modulateOpacity(binding, value),
      speedMul: modulateSpeed(binding, value),
      uvScale: modulateScale(binding, value),
      hueShift: modulateHue(binding, value),
    };
  }
}

function modulateOpacity(binding: AudioBinding, value: number): number {
  if (binding.target !== 'opacity') return 1;
  // 1 at silence → dips/boosts with amount
  return clamp01(1 - binding.amount + binding.amount * value);
}

function modulateSpeed(binding: AudioBinding, value: number): number {
  if (binding.target !== 'speed') return 1;
  return Math.max(0.05, 1 + binding.amount * (value * 2 - 0.5));
}

function modulateScale(binding: AudioBinding, value: number): number {
  if (binding.target !== 'scale') return 1;
  return Math.max(0.2, 1 + binding.amount * (value - 0.5));
}

function modulateHue(binding: AudioBinding, value: number): number {
  if (binding.target !== 'hue') return 0;
  return binding.amount * value * 360;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
