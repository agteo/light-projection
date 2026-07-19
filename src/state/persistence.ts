import type {
  Project,
  SerializedProject,
  SerializedSource,
  SerializedZone,
  SourceAssignment,
  Zone,
} from '../domain/types';
import { PROJECT_VERSION } from '../domain/types';
import { createDefaultProject } from '../domain/factory';

/** Strip runtime object URLs; keep filenames so load can show missing-media state. */
export function serializeSource(source: SourceAssignment): SerializedSource {
  switch (source.kind) {
    case 'effect':
    case 'solid':
      return source;
    case 'image':
      return {
        kind: 'image',
        fileName: source.fileName,
        fit: source.fit,
        missing: true,
      };
    case 'video':
      return {
        kind: 'video',
        fileName: source.fileName,
        fit: source.fit,
        loop: source.loop,
        muted: source.muted,
        missing: true,
      };
  }
}

export function serializeZone(zone: Zone): SerializedZone {
  return {
    ...zone,
    source: serializeSource(zone.source),
  };
}

export function serializeProject(project: Project): SerializedProject {
  return {
    version: project.version,
    name: project.name,
    zones: project.zones.map(serializeZone),
    midiMappings: project.midiMappings,
    blackout: project.blackout,
  };
}

function hydrateSource(source: SerializedSource): SourceAssignment {
  switch (source.kind) {
    case 'effect':
    case 'solid':
      return source;
    case 'image':
      return {
        kind: 'image',
        objectUrl: '',
        fileName: source.fileName,
        fit: source.fit,
        missing: true,
      };
    case 'video':
      return {
        kind: 'video',
        objectUrl: '',
        fileName: source.fileName,
        fit: source.fit,
        loop: source.loop,
        muted: source.muted,
        missing: true,
      };
  }
}

function hydrateZone(zone: SerializedZone): Zone {
  return {
    ...zone,
    source: hydrateSource(zone.source),
  };
}

export function parseProjectJson(raw: unknown): Project {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Project JSON must be an object');
  }

  const data = raw as Partial<SerializedProject>;
  if (data.version !== PROJECT_VERSION) {
    throw new Error(
      `Unsupported project version: ${String(data.version)} (expected ${PROJECT_VERSION})`,
    );
  }
  if (typeof data.name !== 'string') {
    throw new Error('Project name is required');
  }
  if (!Array.isArray(data.zones)) {
    throw new Error('Project zones must be an array');
  }

  return {
    version: PROJECT_VERSION,
    name: data.name,
    zones: data.zones.map(hydrateZone),
    midiMappings: Array.isArray(data.midiMappings) ? data.midiMappings : [],
    blackout: Boolean(data.blackout),
  };
}

export function projectToJson(project: Project): string {
  return JSON.stringify(serializeProject(project), null, 2);
}

export function projectFromJson(text: string): Project {
  return parseProjectJson(JSON.parse(text) as unknown);
}

export const STORAGE_KEY = 'lazy-mapper.project';

export function saveToLocalStorage(project: Project): void {
  localStorage.setItem(STORAGE_KEY, projectToJson(project));
}

export function loadFromLocalStorage(): Project | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return projectFromJson(raw);
  } catch {
    return null;
  }
}

export function clearLocalStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function loadInitialProject(): Project {
  return loadFromLocalStorage() ?? createDefaultProject();
}

export function downloadProjectJson(project: Project, filename?: string): void {
  const blob = new Blob([projectToJson(project)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `${slugify(project.name) || 'lazy-mapper'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function readProjectFile(file: File): Promise<Project> {
  const text = await file.text();
  return projectFromJson(text);
}
