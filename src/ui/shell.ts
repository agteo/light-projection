import type { ProjectStore } from '../state/store';
import {
  clearLocalStorage,
  downloadProjectJson,
  loadFromLocalStorage,
  readProjectFile,
} from '../state/persistence';
import { WebGLRenderer } from '../render/renderer';
import { mountCanvasEditor, type CanvasEditorHandle } from './canvasEditor';
import { mountSourcePanel } from './sourcePanel';

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
          <p class="tag">Phase 4 — effects library + source panel</p>
        </div>
        <label class="field name-field">
          <span>Project</span>
          <input type="text" id="project-name" autocomplete="off" />
        </label>
      </header>

      <section class="panel canvas-panel">
        <div class="panel-head">
          <h2>Output preview</h2>
          <div class="actions compact">
            <button type="button" id="mode-live" class="active">Live</button>
            <button type="button" id="mode-test">Test pattern</button>
            <button type="button" id="mode-white">White</button>
          </div>
        </div>
        <div id="canvas-host"></div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Zones</h2>
          <button type="button" id="add-zone">Add zone</button>
        </div>
        <ul id="zone-list" class="zone-list"></ul>
      </section>

      <section class="panel" id="source-panel"></section>

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
  const canvasHost = root.querySelector<HTMLElement>('#canvas-host')!;
  const modeLiveBtn = root.querySelector<HTMLButtonElement>('#mode-live')!;
  const modeTestBtn = root.querySelector<HTMLButtonElement>('#mode-test')!;
  const modeWhiteBtn = root.querySelector<HTMLButtonElement>('#mode-white')!;
  const sourceHost = root.querySelector<HTMLElement>('#source-panel')!;

  // Create GL canvas first so the renderer owns the correct element.
  canvasHost.innerHTML = `<div class="canvas-wrap"><canvas class="gl-canvas"></canvas></div>`;
  const glCanvas = canvasHost.querySelector<HTMLCanvasElement>('.gl-canvas')!;
  const renderer = new WebGLRenderer(glCanvas);
  renderer.setMode('live');

  const editor: CanvasEditorHandle = mountCanvasEditor(canvasHost, store, renderer, {
    onSelectionChange: (zoneId) => {
      sourcePanel.setZoneId(zoneId);
      render();
    },
  });

  const sourcePanel = mountSourcePanel(sourceHost, store, () => editor.getSelectedZoneId());
  sourcePanel.setZoneId(editor.getSelectedZoneId());

  const setModeButtons = (mode: 'live' | 'test-pattern' | 'white'): void => {
    modeLiveBtn.classList.toggle('active', mode === 'live');
    modeTestBtn.classList.toggle('active', mode === 'test-pattern');
    modeWhiteBtn.classList.toggle('active', mode === 'white');
  };

  const setStatus = (message: string, kind: 'ok' | 'err' = 'ok'): void => {
    statusEl.textContent = message;
    statusEl.dataset.kind = kind;
  };

  const render = (): void => {
    const project = store.getState();
    nameInput.value = project.name;
    const selected = editor.getSelectedZoneId();

    zoneList.innerHTML = '';
    const sorted = [...project.zones].sort((a, b) => a.zIndex - b.zIndex);
    for (const zone of sorted) {
      const li = document.createElement('li');
      li.className = 'zone-row' + (zone.id === selected ? ' selected' : '');
      li.innerHTML = `
        <button type="button" class="select-zone" data-select="${zone.id}" title="Select on canvas">●</button>
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
    if (target.dataset.select) {
      editor.setSelectedZoneId(target.dataset.select);
      sourcePanel.setZoneId(target.dataset.select);
      render();
      return;
    }
    if (target.dataset.dup) {
      const zone = store.duplicateZone(target.dataset.dup);
      if (zone) {
        editor.setSelectedZoneId(zone.id);
        sourcePanel.setZoneId(zone.id);
      }
      setStatus('Zone duplicated.');
    }
    if (target.dataset.del) {
      store.deleteZone(target.dataset.del);
      sourcePanel.setZoneId(editor.getSelectedZoneId());
      setStatus('Zone deleted.');
    }
  });

  root.querySelector('#add-zone')!.addEventListener('click', () => {
    const zone = store.addZone();
    editor.setSelectedZoneId(zone.id);
    sourcePanel.setZoneId(zone.id);
    setStatus('Zone added.');
  });

  modeLiveBtn.addEventListener('click', () => {
    renderer.setMode('live');
    setModeButtons('live');
    setStatus('Live sources.');
  });

  modeTestBtn.addEventListener('click', () => {
    renderer.setMode('test-pattern');
    setModeButtons('test-pattern');
    setStatus('Test pattern alignment aid.');
  });

  modeWhiteBtn.addEventListener('click', () => {
    renderer.setMode('white');
    setModeButtons('white');
    setStatus('White fill mode (focus aid).');
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
    editor.setSelectedZoneId(loaded.zones[0]?.id ?? null);
    sourcePanel.setZoneId(loaded.zones[0]?.id ?? null);
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
      editor.setSelectedZoneId(project.zones[0]?.id ?? null);
      sourcePanel.setZoneId(project.zones[0]?.id ?? null);
      setStatus(`Imported “${project.name}” (${project.zones.length} zones).`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Import failed.', 'err');
    }
  });

  root.querySelector('#new-project')!.addEventListener('click', () => {
    if (!confirm('Replace the current project with a new default?')) return;
    clearLocalStorage();
    store.resetProject();
    const id = store.getState().zones[0]?.id ?? null;
    editor.setSelectedZoneId(id);
    sourcePanel.setZoneId(id);
    setStatus('Started a new project.');
  });

  store.subscribe(render);
  render();
  setStatus('Pick an effect in Source — try plasma, rings, strobe (capped), spectrum bars.');
}

function escapeAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
