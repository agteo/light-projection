import type { ProjectStore } from '../state/store';
import {
  clearLocalStorage,
  downloadProjectJson,
  loadFromLocalStorage,
  readProjectFile,
} from '../state/persistence';

function sourceLabel(projectZoneSource: import('../domain/types').SourceAssignment): string {
  switch (projectZoneSource.kind) {
    case 'effect':
      return `effect:${projectZoneSource.effectId}`;
    case 'solid':
      return `solid:${projectZoneSource.color}`;
    case 'image':
      return projectZoneSource.missing
        ? `image:missing(${projectZoneSource.fileName})`
        : `image:${projectZoneSource.fileName}`;
    case 'video':
      return projectZoneSource.missing
        ? `video:missing(${projectZoneSource.fileName})`
        : `video:${projectZoneSource.fileName}`;
  }
}

export function mountEditorShell(root: HTMLElement, store: ProjectStore): void {
  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <h1>Lazy Mapper</h1>
          <p class="tag">Phase 1 — project state &amp; persistence</p>
        </div>
        <label class="field name-field">
          <span>Project</span>
          <input type="text" id="project-name" autocomplete="off" />
        </label>
      </header>

      <section class="panel">
        <div class="panel-head">
          <h2>Zones</h2>
          <button type="button" id="add-zone">Add zone</button>
        </div>
        <ul id="zone-list" class="zone-list"></ul>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Persistence</h2>
        </div>
        <div class="actions">
          <button type="button" id="save-local">Save to localStorage</button>
          <button type="button" id="reload-local">Reload from localStorage</button>
          <button type="button" id="export-json">Export JSON</button>
          <label class="file-btn">
            Import JSON
            <input type="file" id="import-json" accept="application/json,.json" hidden />
          </label>
          <button type="button" id="new-project" class="danger">New project</button>
        </div>
        <p id="status" class="status" role="status"></p>
        <pre id="json-preview" class="json-preview" aria-label="Serialized project preview"></pre>
      </section>
    </div>
  `;

  const nameInput = root.querySelector<HTMLInputElement>('#project-name')!;
  const zoneList = root.querySelector<HTMLUListElement>('#zone-list')!;
  const statusEl = root.querySelector<HTMLParagraphElement>('#status')!;
  const previewEl = root.querySelector<HTMLPreElement>('#json-preview')!;
  const importInput = root.querySelector<HTMLInputElement>('#import-json')!;

  const setStatus = (message: string, kind: 'ok' | 'err' = 'ok'): void => {
    statusEl.textContent = message;
    statusEl.dataset.kind = kind;
  };

  const render = (): void => {
    const project = store.getState();
    nameInput.value = project.name;

    zoneList.innerHTML = '';
    const sorted = [...project.zones].sort((a, b) => a.zIndex - b.zIndex);
    for (const zone of sorted) {
      const li = document.createElement('li');
      li.className = 'zone-row';
      li.innerHTML = `
        <input type="text" class="zone-name" data-id="${zone.id}" value="${escapeAttr(zone.name)}" />
        <span class="meta">z${zone.zIndex} · ${sourceLabel(zone.source)}</span>
        <button type="button" data-dup="${zone.id}">Duplicate</button>
        <button type="button" class="danger" data-del="${zone.id}">Delete</button>
      `;
      zoneList.appendChild(li);
    }

    previewEl.textContent = JSON.stringify(
      {
        version: project.version,
        name: project.name,
        zoneCount: project.zones.length,
        zones: project.zones.map((z) => ({
          id: z.id,
          name: z.name,
          source: z.source.kind,
          missing:
            z.source.kind === 'image' || z.source.kind === 'video'
              ? Boolean(z.source.missing)
              : false,
        })),
        blackout: project.blackout,
      },
      null,
      2,
    );
  };

  nameInput.addEventListener('change', () => {
    store.setName(nameInput.value.trim() || 'Untitled');
    setStatus('Project name saved.');
  });

  zoneList.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.classList.contains('zone-name')) return;
    const id = target.dataset.id;
    if (!id) return;
    store.renameZone(id, target.value.trim() || 'Zone');
    setStatus('Zone renamed.');
  });

  zoneList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.dataset.dup) {
      store.duplicateZone(target.dataset.dup);
      setStatus('Zone duplicated.');
    }
    if (target.dataset.del) {
      store.deleteZone(target.dataset.del);
      setStatus('Zone deleted.');
    }
  });

  root.querySelector('#add-zone')!.addEventListener('click', () => {
    store.addZone();
    setStatus('Zone added.');
  });

  root.querySelector('#save-local')!.addEventListener('click', () => {
    store.save();
    setStatus(`Saved to localStorage (${store.getState().zones.length} zones).`);
  });

  root.querySelector('#reload-local')!.addEventListener('click', () => {
    const loaded = loadFromLocalStorage();
    if (!loaded) {
      setStatus('No project found in localStorage.', 'err');
      return;
    }
    store.replaceProject(loaded);
    setStatus(`Reloaded “${loaded.name}” from localStorage.`);
  });

  root.querySelector('#export-json')!.addEventListener('click', () => {
    downloadProjectJson(store.getState());
    setStatus('Exported project JSON.');
  });

  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    try {
      const project = await readProjectFile(file);
      store.replaceProject(project);
      setStatus(`Imported “${project.name}” (${project.zones.length} zones).`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Import failed.', 'err');
    }
  });

  root.querySelector('#new-project')!.addEventListener('click', () => {
    if (!confirm('Replace the current project with a new default?')) return;
    clearLocalStorage();
    store.resetProject();
    setStatus('Started a new project.');
  });

  store.subscribe(render);
  render();
  setStatus('Ready — edits auto-save to localStorage.');
}

function escapeAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
