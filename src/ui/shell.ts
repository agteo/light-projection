import type { ProjectStore } from '../state/store';
import {
  clearLocalStorage,
  downloadProjectJson,
  loadFromLocalStorage,
  readProjectFile,
} from '../state/persistence';
import { AnalyserService, type AudioFrame } from '../audio/analyser';
import { WebGLRenderer, type RenderMode } from '../render/renderer';
import { createSyncChannel, postState, type SyncMessage } from '../sync/channel';
import { mountCanvasEditor, type CanvasEditorHandle } from './canvasEditor';
import { mountSourcePanel } from './sourcePanel';
import { mountMidiPanel } from './midiPanel';
import { openOutputWindow } from './outputWindow';

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

const GETTING_STARTED_KEY = 'light-mapper.getting-started-dismissed';
const TUTORIAL_URL = 'https://github.com/agteo/light-projection/blob/main/TUTORIAL.md';

const MODE_HINTS: Record<RenderMode, string> = {
  live: 'Live — shows your images, video, and effects.',
  'test-pattern': 'Test pattern — use this grid to line up zone corners with a real surface.',
  white: 'White — bright fill to focus the projector and find your object.',
};

export function mountEditorShell(root: HTMLElement, store: ProjectStore): void {
  const showGettingStarted = localStorage.getItem(GETTING_STARTED_KEY) !== '1';

  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <h1>Light Mapper</h1>
          <p class="tag">Map images &amp; effects onto real surfaces</p>
        </div>
        <div class="topbar-actions">
          <label class="field name-field">
            <span>Project</span>
            <input type="text" id="project-name" autocomplete="off" />
          </label>
          <div class="actions compact output-actions">
            <button type="button" id="open-output">Open output</button>
            <button type="button" id="toggle-blackout">Blackout (B)</button>
          </div>
        </div>
      </header>

      ${
        showGettingStarted
          ? `
      <aside class="getting-started" id="getting-started" aria-label="Getting started">
        <div class="getting-started-head">
          <h2>Getting started</h2>
          <button type="button" id="dismiss-getting-started" class="text-btn" title="Hide this guide">Dismiss</button>
        </div>
        <ol class="getting-started-steps">
          <li>Connect a projector as an <strong>extended</strong> display (not mirrored).</li>
          <li>Click <strong>Open output</strong>, drag that window to the projector, then fullscreen it.</li>
          <li>Try <strong>White</strong> or <strong>Test pattern</strong> above to focus and align.</li>
          <li>Drag the zone’s corner handles so they match your physical surface.</li>
          <li>In <strong>Source</strong>, pick <strong>Image</strong> and load a logo or photo.</li>
        </ol>
        <p class="muted getting-started-more">
          Need more detail?
          <a href="${TUTORIAL_URL}" target="_blank" rel="noopener noreferrer">Full tutorial on GitHub</a>
        </p>
      </aside>`
          : ''
      }

      <section class="panel canvas-panel">
        <div class="panel-head">
          <h2>Output preview</h2>
          <div class="actions compact">
            <button type="button" id="mode-live" class="active">Live</button>
            <button type="button" id="mode-test">Test pattern</button>
            <button type="button" id="mode-white">White</button>
          </div>
        </div>
        <p id="mode-hint" class="muted mode-hint">${MODE_HINTS.live}</p>
        <div id="canvas-host"></div>
        <p id="status" class="status" role="status"></p>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Zones</h2>
          <div class="actions compact">
            <button type="button" id="add-zone">Add zone</button>
          </div>
        </div>
        <p class="muted panel-intro">Each zone is a mappable surface. Select one, then edit it in Source.</p>
        <ul id="zone-list" class="zone-list"></ul>
        <details class="nested-advanced">
          <summary>Advanced — split into a grid</summary>
          <p class="muted">Replace the selected zone with a 2×2 or 3×3 grid that fills the same shape.</p>
          <div class="actions compact">
            <button type="button" id="split-2" title="Replace selected zone with a 2×2 grid">Split 2×2</button>
            <button type="button" id="split-3" title="Replace selected zone with a 3×3 grid">Split 3×3</button>
          </div>
        </details>
      </section>

      <section class="panel" id="source-panel"></section>

      <details class="panel optional-panel">
        <summary>
          <span class="summary-title">Audio input</span>
          <span class="optional-tag">optional</span>
        </summary>
        <div class="optional-body">
          <div class="panel-head">
            <button type="button" id="mic-toggle">Enable mic</button>
          </div>
          <div class="meters" aria-label="Audio levels">
            <div class="meter"><span>Level</span><div class="meter-track"><i id="meter-level"></i></div></div>
            <div class="meter"><span>Bass</span><div class="meter-track"><i id="meter-bass"></i></div></div>
            <div class="meter"><span>Mid</span><div class="meter-track"><i id="meter-mid"></i></div></div>
            <div class="meter"><span>Treble</span><div class="meter-track"><i id="meter-treble"></i></div></div>
          </div>
          <p class="muted mic-hint">Enable the mic, then in Source turn on audio binding (bass → opacity is an easy clap test).</p>
        </div>
      </details>

      <details class="panel optional-panel">
        <summary>
          <span class="summary-title">MIDI</span>
          <span class="optional-tag">optional</span>
        </summary>
        <div class="optional-body" id="midi-panel"></div>
      </details>

      <details class="panel optional-panel">
        <summary>
          <span class="summary-title">Save / export</span>
          <span class="optional-tag">optional</span>
        </summary>
        <div class="optional-body">
          <p class="muted panel-intro">Projects auto-save in this browser. Export a JSON backup when you want a file copy.</p>
          <div class="actions">
            <button type="button" id="save-local">Save now</button>
            <button type="button" id="reload-local">Reload saved</button>
            <button type="button" id="export-json">Export file</button>
            <label class="file-btn">
              Import file
              <input type="file" id="import-json" accept="application/json,.json" hidden />
            </label>
            <button type="button" id="new-project" class="danger">New project</button>
          </div>
          <details class="nested-advanced">
            <summary>Show project data</summary>
            <pre id="json-preview" class="json-preview" aria-label="Serialized project preview"></pre>
          </details>
        </div>
      </details>
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
  let renderMode: RenderMode = 'live';
  renderer.setMode(renderMode);
  renderer.setBlackout(store.getState().blackout);

  const sync = createSyncChannel();
  const broadcast = (): void => {
    postState(sync, store.getState(), renderMode);
  };

  sync.onmessage = (event: MessageEvent<SyncMessage>) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'hello' && msg.role === 'output') {
      broadcast();
      return;
    }
    if (msg.type === 'blackout') {
      store.setBlackout(msg.value);
    }
  };

  const editor: CanvasEditorHandle = mountCanvasEditor(canvasHost, store, renderer, {
    onSelectionChange: (zoneId) => {
      sourcePanel.setZoneId(zoneId);
      render();
    },
  });

  const sourcePanel = mountSourcePanel(sourceHost, store, () => editor.getSelectedZoneId());
  sourcePanel.setZoneId(editor.getSelectedZoneId());
  mountMidiPanel(root.querySelector<HTMLElement>('#midi-panel')!, store);

  const openOutputBtn = root.querySelector<HTMLButtonElement>('#open-output')!;
  const blackoutBtn = root.querySelector<HTMLButtonElement>('#toggle-blackout')!;
  const micToggle = root.querySelector<HTMLButtonElement>('#mic-toggle')!;
  const meterLevel = root.querySelector<HTMLElement>('#meter-level')!;
  const meterBass = root.querySelector<HTMLElement>('#meter-bass')!;
  const meterMid = root.querySelector<HTMLElement>('#meter-mid')!;
  const meterTreble = root.querySelector<HTMLElement>('#meter-treble')!;

  const analyser = new AnalyserService();
  const paintMeters = (frame: AudioFrame): void => {
    meterLevel.style.transform = `scaleX(${frame.level})`;
    meterBass.style.transform = `scaleX(${frame.bass})`;
    meterMid.style.transform = `scaleX(${frame.mid})`;
    meterTreble.style.transform = `scaleX(${frame.treble})`;
  };
  paintMeters(analyser.getFrame());

  analyser.subscribe((frame) => {
    renderer.setAudioFrame(frame);
    paintMeters(frame);
    sync.postMessage({
      type: 'audio',
      level: frame.level,
      bass: frame.bass,
      mid: frame.mid,
      treble: frame.treble,
      spectrum: Array.from(frame.spectrum),
    } satisfies SyncMessage);
  });

  micToggle.addEventListener('click', async () => {
    try {
      if (analyser.active) {
        analyser.stop();
        renderer.setAudioFrame(null);
        paintMeters(analyser.getFrame());
        micToggle.textContent = 'Enable mic';
        micToggle.classList.remove('active');
        setStatus('Mic stopped.');
        return;
      }
      await analyser.start();
      micToggle.textContent = 'Disable mic';
      micToggle.classList.add('active');
      setStatus('Mic enabled — bind a zone to bass→opacity and clap.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Mic permission denied.', 'err');
    }
  });

  const modeHintEl = root.querySelector<HTMLParagraphElement>('#mode-hint')!;

  const setModeButtons = (mode: RenderMode): void => {
    modeLiveBtn.classList.toggle('active', mode === 'live');
    modeTestBtn.classList.toggle('active', mode === 'test-pattern');
    modeWhiteBtn.classList.toggle('active', mode === 'white');
    modeHintEl.textContent = MODE_HINTS[mode];
  };

  root.querySelector('#dismiss-getting-started')?.addEventListener('click', () => {
    localStorage.setItem(GETTING_STARTED_KEY, '1');
    root.querySelector('#getting-started')?.remove();
  });

  const syncBlackoutUi = (): void => {
    const on = store.getState().blackout;
    renderer.setBlackout(on);
    blackoutBtn.classList.toggle('active', on);
    blackoutBtn.textContent = on ? 'Lift blackout (B)' : 'Blackout (B)';
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
        <button type="button" data-zdown="${zone.id}" title="Send backward">↓</button>
        <button type="button" data-zup="${zone.id}" title="Bring forward">↑</button>
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
    if (target.dataset.zup) {
      store.nudgeZoneZ(target.dataset.zup, 1);
      setStatus('Brought zone forward.');
      return;
    }
    if (target.dataset.zdown) {
      store.nudgeZoneZ(target.dataset.zdown, -1);
      setStatus('Sent zone backward.');
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

  const splitZone = (n: 2 | 3): void => {
    const id = editor.getSelectedZoneId();
    if (!id) {
      setStatus('Select a zone to subdivide.', 'err');
      return;
    }
    const created = store.subdivideZone(id, n);
    if (!created || created.length === 0) {
      setStatus('Could not subdivide zone.', 'err');
      return;
    }
    editor.setSelectedZoneId(created[0]!.id);
    sourcePanel.setZoneId(created[0]!.id);
    setStatus(`Split into ${n}×${n} (${created.length} zones).`);
  };

  root.querySelector('#split-2')!.addEventListener('click', () => splitZone(2));
  root.querySelector('#split-3')!.addEventListener('click', () => splitZone(3));

  modeLiveBtn.addEventListener('click', () => {
    renderMode = 'live';
    renderer.setMode(renderMode);
    setModeButtons(renderMode);
    broadcast();
    setStatus('Live sources.');
  });

  modeTestBtn.addEventListener('click', () => {
    renderMode = 'test-pattern';
    renderer.setMode(renderMode);
    setModeButtons(renderMode);
    broadcast();
    setStatus('Test pattern alignment aid (synced to output).');
  });

  modeWhiteBtn.addEventListener('click', () => {
    renderMode = 'white';
    renderer.setMode(renderMode);
    setModeButtons(renderMode);
    broadcast();
    setStatus('White fill mode (synced to output).');
  });

  openOutputBtn.addEventListener('click', async () => {
    const win = await openOutputWindow();
    if (!win) {
      setStatus('Popup blocked — allow popups for this site, then try again.', 'err');
      return;
    }
    broadcast();
    setStatus('Output window opened — drag to projector and press Fullscreen / F11.');
  });

  blackoutBtn.addEventListener('click', () => {
    store.setBlackout(!store.getState().blackout);
  });

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      return;
    }
    if (event.key === 'b' || event.key === 'B') {
      event.preventDefault();
      store.setBlackout(!store.getState().blackout);
    }
  });

  root.querySelector('#save-local')!.addEventListener('click', () => {
    store.save();
    setStatus(`Saved (${store.getState().zones.length} zones).`);
  });

  root.querySelector('#reload-local')!.addEventListener('click', () => {
    const loaded = loadFromLocalStorage();
    if (!loaded) {
      setStatus('No saved project in this browser yet.', 'err');
      return;
    }
    store.replaceProject(loaded);
    editor.setSelectedZoneId(loaded.zones[0]?.id ?? null);
    sourcePanel.setZoneId(loaded.zones[0]?.id ?? null);
    setStatus(`Reloaded “${loaded.name}”.`);
  });

  root.querySelector('#export-json')!.addEventListener('click', () => {
    downloadProjectJson(store.getState());
    setStatus('Exported project file.');
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

  store.subscribe(() => {
    syncBlackoutUi();
    render();
    broadcast();
  });
  syncBlackoutUi();
  render();
  broadcast();
  setStatus('Ready — start with Open output, then pin your zone corners.');
}

function escapeAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
