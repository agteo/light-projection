/** Core domain types from the product spec. */

export type Vec2 = { x: number; y: number };

export type BlendMode = 'normal' | 'add' | 'multiply' | 'screen';

export type AudioBand = 'bass' | 'mid' | 'treble' | 'level';
export type AudioTarget = 'opacity' | 'speed' | 'scale' | 'hue';

export interface AudioBinding {
  band: AudioBand;
  target: AudioTarget;
  amount: number;
  smoothing: number;
}

export type SourceAssignment =
  | {
      kind: 'effect';
      effectId: string;
      params: Record<string, number>;
      color1: string;
      color2: string;
      speed: number;
    }
  | {
      kind: 'image';
      objectUrl: string;
      /** Original filename — persisted; objectUrl is runtime-only. */
      fileName: string;
      fit: 'cover' | 'contain' | 'stretch';
      missing?: boolean;
    }
  | {
      kind: 'video';
      objectUrl: string;
      fileName: string;
      fit: 'cover' | 'contain' | 'stretch';
      loop: boolean;
      muted: boolean;
      missing?: boolean;
    }
  | { kind: 'solid'; color: string };

export interface Zone {
  id: string;
  name: string;
  corners: [Vec2, Vec2, Vec2, Vec2];
  source: SourceAssignment;
  opacity: number;
  blendMode: BlendMode;
  feather: number;
  audio: AudioBinding | null;
  visible: boolean;
  zIndex: number;
}

/** MIDI mappings land in Phase 8; shape reserved for forward-compatible JSON. */
export interface MidiMapping {
  id: string;
  type: 'cc' | 'note';
  channel: number;
  number: number;
  target: string;
}

export const PROJECT_VERSION = 1 as const;

export interface Project {
  version: typeof PROJECT_VERSION;
  name: string;
  zones: Zone[];
  midiMappings: MidiMapping[];
  blackout: boolean;
}

/** Serializable forms of media sources (no live object URLs). */
export type SerializedSource =
  | Extract<SourceAssignment, { kind: 'effect' } | { kind: 'solid' }>
  | {
      kind: 'image';
      fileName: string;
      fit: 'cover' | 'contain' | 'stretch';
      missing: true;
    }
  | {
      kind: 'video';
      fileName: string;
      fit: 'cover' | 'contain' | 'stretch';
      loop: boolean;
      muted: boolean;
      missing: true;
    };

export interface SerializedZone extends Omit<Zone, 'source'> {
  source: SerializedSource;
}

export interface SerializedProject {
  version: typeof PROJECT_VERSION;
  name: string;
  zones: SerializedZone[];
  midiMappings: MidiMapping[];
  blackout: boolean;
}
