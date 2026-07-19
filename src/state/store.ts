import { createDefaultProject, createZone } from '../domain/factory';
import { subdivideZone } from '../domain/subdivide';
import type { MidiMapping, Project, Zone } from '../domain/types';
import { upsertMidiMapping, removeMidiMapping } from '../midi/apply';
import { loadInitialProject, saveToLocalStorage } from './persistence';

export type Listener = (project: Project) => void;

export interface ProjectStore {
  getState: () => Project;
  subscribe: (listener: Listener) => () => void;
  setName: (name: string) => void;
  setBlackout: (blackout: boolean) => void;
  replaceProject: (project: Project) => void;
  resetProject: () => void;
  addZone: () => Zone;
  updateZone: (id: string, patch: Partial<Zone>) => void;
  renameZone: (id: string, name: string) => void;
  deleteZone: (id: string) => void;
  duplicateZone: (id: string) => Zone | null;
  /** Replace a zone with an n×n grid filling the same quad. Returns new zones. */
  subdivideZone: (id: string, n: 2 | 3) => Zone[] | null;
  /** Swap zIndex with neighbor (dir -1 = send back, +1 = bring forward). */
  nudgeZoneZ: (id: string, dir: -1 | 1) => void;
  upsertMidiMapping: (mapping: MidiMapping) => void;
  removeMidiMapping: (id: string) => void;
  /** Persist current project to localStorage immediately. */
  save: () => void;
}

function nextZoneName(zones: Zone[]): string {
  let n = zones.length + 1;
  const names = new Set(zones.map((z) => z.name));
  while (names.has(`Zone ${n}`)) n += 1;
  return `Zone ${n}`;
}

function nextZIndex(zones: Zone[]): number {
  if (zones.length === 0) return 0;
  return Math.max(...zones.map((z) => z.zIndex)) + 1;
}

export function createProjectStore(initial?: Project): ProjectStore {
  let project = initial ?? loadInitialProject();
  const listeners = new Set<Listener>();

  const emit = (): void => {
    for (const listener of listeners) listener(project);
  };

  const commit = (next: Project, persist = true): void => {
    project = next;
    if (persist) saveToLocalStorage(project);
    emit();
  };

  return {
    getState: () => project,

    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setName: (name) => {
      commit({ ...project, name });
    },

    setBlackout: (blackout) => {
      commit({ ...project, blackout });
    },

    replaceProject: (next) => {
      commit(next);
    },

    resetProject: () => {
      commit(createDefaultProject());
    },

    addZone: () => {
      const zone = createZone({
        name: nextZoneName(project.zones),
        zIndex: nextZIndex(project.zones),
      });
      commit({ ...project, zones: [...project.zones, zone] });
      return zone;
    },

    updateZone: (id, patch) => {
      commit({
        ...project,
        zones: project.zones.map((z) => (z.id === id ? { ...z, ...patch, id: z.id } : z)),
      });
    },

    renameZone: (id, name) => {
      commit({
        ...project,
        zones: project.zones.map((z) => (z.id === id ? { ...z, name } : z)),
      });
    },

    deleteZone: (id) => {
      commit({
        ...project,
        zones: project.zones.filter((z) => z.id !== id),
        midiMappings: project.midiMappings.filter((m) => !m.target.includes(`zone:${id}:`)),
      });
    },

    duplicateZone: (id) => {
      const source = project.zones.find((z) => z.id === id);
      if (!source) return null;
      const { id: _omit, ...rest } = structuredClone(source);
      void _omit;
      const zone = createZone({
        ...rest,
        name: `${source.name} copy`,
        zIndex: nextZIndex(project.zones),
      });
      commit({ ...project, zones: [...project.zones, zone] });
      return zone;
    },

    subdivideZone: (id, n) => {
      const source = project.zones.find((z) => z.id === id);
      if (!source) return null;
      const created = subdivideZone(source, n, nextZIndex(project.zones));
      commit({
        ...project,
        zones: [...project.zones.filter((z) => z.id !== id), ...created],
        midiMappings: project.midiMappings.filter((m) => !m.target.includes(`zone:${id}:`)),
      });
      return created;
    },

    nudgeZoneZ: (id, dir) => {
      const sorted = [...project.zones].sort((a, b) => a.zIndex - b.zIndex);
      const index = sorted.findIndex((z) => z.id === id);
      if (index < 0) return;
      const swapWith = index + dir;
      if (swapWith < 0 || swapWith >= sorted.length) return;
      const a = sorted[index]!;
      const b = sorted[swapWith]!;
      commit({
        ...project,
        zones: project.zones.map((z) => {
          if (z.id === a.id) return { ...z, zIndex: b.zIndex };
          if (z.id === b.id) return { ...z, zIndex: a.zIndex };
          return z;
        }),
      });
    },

    upsertMidiMapping: (mapping) => {
      commit({
        ...project,
        midiMappings: upsertMidiMapping(project.midiMappings, mapping),
      });
    },

    removeMidiMapping: (id) => {
      commit({
        ...project,
        midiMappings: removeMidiMapping(project.midiMappings, id),
      });
    },

    save: () => {
      saveToLocalStorage(project);
      emit();
    },
  };
}
