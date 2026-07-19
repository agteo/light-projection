import { createDefaultProject, createZone } from '../domain/factory';
import type { Project, Zone } from '../domain/types';
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

    save: () => {
      saveToLocalStorage(project);
      emit();
    },
  };
}
