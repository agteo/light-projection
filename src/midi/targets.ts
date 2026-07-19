import type { MidiMapping, Zone } from '../domain/types';
import { createId } from '../domain/factory';

export type MidiTargetKind = 'blackout' | 'opacity' | 'speed' | 'visibility';

export interface ParsedMidiTarget {
  kind: MidiTargetKind;
  zoneId?: string;
}

export function targetBlackout(): string {
  return 'blackout';
}

export function targetZoneOpacity(zoneId: string): string {
  return `zone:${zoneId}:opacity`;
}

export function targetZoneSpeed(zoneId: string): string {
  return `zone:${zoneId}:speed`;
}

export function targetZoneVisibility(zoneId: string): string {
  return `zone:${zoneId}:visibility`;
}

export function parseMidiTarget(target: string): ParsedMidiTarget | null {
  if (target === 'blackout') return { kind: 'blackout' };
  const match = /^zone:([^:]+):(opacity|speed|visibility)$/.exec(target);
  if (!match) return null;
  return {
    kind: match[2] as MidiTargetKind,
    zoneId: match[1],
  };
}

export function describeMidiTarget(target: string, zones: Zone[]): string {
  const parsed = parseMidiTarget(target);
  if (!parsed) return target;
  if (parsed.kind === 'blackout') return 'Master blackout';
  const zone = zones.find((z) => z.id === parsed.zoneId);
  const name = zone?.name ?? 'Zone';
  if (parsed.kind === 'opacity') return `${name} · opacity`;
  if (parsed.kind === 'speed') return `${name} · effect speed`;
  return `${name} · visibility`;
}

export function createMidiMapping(
  partial: Omit<MidiMapping, 'id'> & { id?: string },
): MidiMapping {
  return {
    id: partial.id ?? createId('midi'),
    type: partial.type,
    channel: partial.channel,
    number: partial.number,
    target: partial.target,
  };
}

/** Prefer note for toggles, CC for continuous — used as a hint in the UI. */
export function preferredMessageType(target: string): 'cc' | 'note' {
  const parsed = parseMidiTarget(target);
  if (!parsed) return 'cc';
  if (parsed.kind === 'blackout' || parsed.kind === 'visibility') return 'note';
  return 'cc';
}
