import './style.css';
import type { Project } from './domain/types';
import { hydrateProjectMedia } from './media/hydrate';
import { WebGLRenderer, type RenderMode } from './render/renderer';
import { createSyncChannel, type SyncMessage } from './sync/channel';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app missing');

app.innerHTML = `
  <div class="output-stage">
    <canvas class="gl-canvas" aria-label="Projection output"></canvas>
  </div>
  <p class="output-status" id="status">Waiting for editor…</p>
  <div class="output-hud">
    <button type="button" id="fullscreen">Fullscreen</button>
    <button type="button" id="blackout">Blackout (B)</button>
  </div>
`;

const canvas = app.querySelector<HTMLCanvasElement>('.gl-canvas')!;
const statusEl = document.querySelector('#status')!;
const fullscreenBtn = document.querySelector<HTMLButtonElement>('#fullscreen')!;
const blackoutBtn = document.querySelector<HTMLButtonElement>('#blackout')!;
const stage = app.querySelector<HTMLElement>('.output-stage')!;

const renderer = new WebGLRenderer(canvas);
renderer.setMode('live');
renderer.start();

const channel = createSyncChannel();
let project: Project | null = null;
let mode: RenderMode = 'live';
let localBlackoutOverride: boolean | null = null;

const setStatus = (text: string): void => {
  statusEl.textContent = text;
};

const applyState = async (next: Project, nextMode: RenderMode): Promise<void> => {
  project = next;
  mode = nextMode;
  localBlackoutOverride = null;
  await hydrateProjectMedia(next);
  renderer.setMode(nextMode);
  renderer.setZones(next.zones);
  renderer.setBlackout(next.blackout);
  setStatus(
    next.blackout
      ? 'BLACKOUT'
      : `Live · ${next.zones.length} zone${next.zones.length === 1 ? '' : 's'} · ${nextMode}`,
  );
  blackoutBtn.textContent = next.blackout ? 'Lift blackout (B)' : 'Blackout (B)';
};

channel.onmessage = (event: MessageEvent<SyncMessage>) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'state') {
    void applyState(msg.project, msg.mode);
    return;
  }
};

channel.postMessage({ type: 'hello', role: 'output' } satisfies SyncMessage);

const syncSize = (): void => {
  renderer.resize(stage.clientWidth || window.innerWidth, stage.clientHeight || window.innerHeight);
};
window.addEventListener('resize', syncSize);
syncSize();

const toggleFullscreen = async (): Promise<void> => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {
    setStatus('Fullscreen blocked — press F11 after focusing this window.');
  }
};

fullscreenBtn.addEventListener('click', () => {
  void toggleFullscreen();
});

const toggleBlackout = (): void => {
  if (!project) return;
  const next = !(localBlackoutOverride ?? project.blackout);
  localBlackoutOverride = next;
  project = { ...project, blackout: next };
  renderer.setBlackout(next);
  blackoutBtn.textContent = next ? 'Lift blackout (B)' : 'Blackout (B)';
  setStatus(next ? 'BLACKOUT' : `Live · ${project.zones.length} zones · ${mode}`);
  channel.postMessage({ type: 'blackout', value: next } satisfies SyncMessage);
};

blackoutBtn.addEventListener('click', toggleBlackout);

window.addEventListener('keydown', (event) => {
  if (event.key === 'b' || event.key === 'B') {
    event.preventDefault();
    toggleBlackout();
  }
  if (event.key === 'f' || event.key === 'F') {
    event.preventDefault();
    void toggleFullscreen();
  }
});

let hudTimer = 0;
const showHud = (): void => {
  document.body.classList.add('show-hud');
  window.clearTimeout(hudTimer);
  hudTimer = window.setTimeout(() => document.body.classList.remove('show-hud'), 2200);
};
window.addEventListener('mousemove', showHud);
window.addEventListener('mousedown', showHud);
