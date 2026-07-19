import type { MidiMapping, Project, Zone } from '../domain/types';
import type { ProjectStore } from '../state/store';
import type { MidiMessage } from './service';
import { parseMidiTarget } from './targets';

/** Apply a live MIDI message against current project mappings. */
export function applyMidiMessage(
  store: ProjectStore,
  message: MidiMessage,
  mappings: MidiMapping[],
): void {
  const matches = mappings.filter(
    (m) =>
      m.type === message.type &&
      m.channel === message.channel &&
      m.number === message.number,
  );
  if (matches.length === 0) return;

  for (const mapping of matches) {
    applyMapping(store, mapping, message);
  }
}

function applyMapping(store: ProjectStore, mapping: MidiMapping, message: MidiMessage): void {
  const parsed = parseMidiTarget(mapping.target);
  if (!parsed) return;
  const project = store.getState();

  if (parsed.kind === 'blackout') {
    if (message.type === 'note' && message.down) {
      store.setBlackout(!project.blackout);
    } else if (message.type === 'cc') {
      store.setBlackout(message.value >= 0.5);
    }
    return;
  }

  if (!parsed.zoneId) return;
  const zone = project.zones.find((z) => z.id === parsed.zoneId);
  if (!zone) return;

  if (parsed.kind === 'visibility') {
    if (message.type === 'note' && message.down) {
      store.updateZone(zone.id, { visible: !zone.visible });
    } else if (message.type === 'cc') {
      store.updateZone(zone.id, { visible: message.value >= 0.5 });
    }
    return;
  }

  if (parsed.kind === 'opacity') {
    const value = continuousValue(message);
    if (value === null) return;
    store.updateZone(zone.id, { opacity: value });
    return;
  }

  if (parsed.kind === 'speed') {
    const value = continuousValue(message);
    if (value === null) return;
    // Map 0..1 → 0.05..3 speed range when source is an effect
    if (zone.source.kind !== 'effect') return;
    const speed = 0.05 + value * (3 - 0.05);
    store.updateZone(zone.id, {
      source: { ...zone.source, speed },
    });
  }
}

function continuousValue(message: MidiMessage): number | null {
  if (message.type === 'cc') return message.value;
  if (message.type === 'note' && message.down) return message.velocity;
  return null;
}

export function upsertMidiMapping(mappings: MidiMapping[], next: MidiMapping): MidiMapping[] {
  // Drop conflicts on same control OR same target
  const filtered = mappings.filter(
    (m) =>
      m.id !== next.id &&
      m.target !== next.target &&
      !(m.type === next.type && m.channel === next.channel && m.number === next.number),
  );
  return [...filtered, next];
}

export function removeMidiMapping(mappings: MidiMapping[], id: string): MidiMapping[] {
  return mappings.filter((m) => m.id !== id);
}

export function mappingLabel(mapping: MidiMapping): string {
  const kind = mapping.type === 'cc' ? 'CC' : 'Note';
  return `Ch ${mapping.channel} · ${kind} ${mapping.number}`;
}

export function listMappableZones(project: Project): Zone[] {
  return [...project.zones].sort((a, b) => a.zIndex - b.zIndex);
}
