import {
  DEFAULT_EFFECT_ID,
  defaultParamsFor,
  EFFECT_BY_ID,
  EFFECTS,
  type EffectParamDef,
} from '../effects/registry';
import { defaultEffectSource } from '../domain/factory';
import type { BlendMode, SourceAssignment, Zone } from '../domain/types';
import {
  ensureVideoPlaying,
  getMediaElement,
  loadImageFromFile,
  loadVideoFromFile,
  revokeObjectUrl,
} from '../media/loader';
import type { ProjectStore } from '../state/store';

export interface SourcePanelHandle {
  destroy: () => void;
  setZoneId: (zoneId: string | null) => void;
}

const BLEND_MODES: BlendMode[] = ['normal', 'add', 'multiply', 'screen'];

export function mountSourcePanel(
  host: HTMLElement,
  store: ProjectStore,
  getSelectedZoneId: () => string | null,
): SourcePanelHandle {
  host.innerHTML = `
    <div class="panel-head">
      <h2>Source</h2>
      <span id="source-zone-label" class="muted"></span>
    </div>
    <div id="source-empty" class="source-empty">Select a zone to edit its source.</div>
    <div id="source-form" class="source-form hidden">
      <label class="field">
        <span>Type</span>
        <select id="source-kind">
          <option value="effect">Effect</option>
          <option value="solid">Solid color</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>
      </label>

      <div id="effect-fields" class="source-block">
        <label class="field">
          <span>Effect</span>
          <select id="effect-id"></select>
        </label>
        <p id="effect-desc" class="muted effect-desc"></p>
        <div class="field-row">
          <label class="field">
            <span>Color 1</span>
            <input type="color" id="color1" />
          </label>
          <label class="field">
            <span>Color 2</span>
            <input type="color" id="color2" />
          </label>
          <label class="field">
            <span>Speed</span>
            <input type="range" id="speed" min="0.05" max="3" step="0.05" />
          </label>
        </div>
        <div id="effect-params" class="effect-params"></div>
        <p id="strobe-warning" class="warn hidden" role="alert">
          Photosensitivity warning: strobe above 3 Hz can trigger seizures. Only unlock if you understand the risk.
        </p>
      </div>

      <div id="solid-fields" class="source-block hidden">
        <label class="field">
          <span>Color</span>
          <input type="color" id="solid-color" value="#ffffff" />
        </label>
      </div>

      <div id="media-fields" class="source-block hidden">
        <p id="media-status" class="muted"></p>
        <label class="file-btn">
          Choose file
          <input type="file" id="media-file" hidden />
        </label>
        <label class="field">
          <span>Fit</span>
          <select id="media-fit">
            <option value="cover">Cover</option>
            <option value="contain">Contain</option>
            <option value="stretch">Stretch</option>
          </select>
        </label>
        <div id="video-opts" class="field-row hidden">
          <label class="check-field">
            <input type="checkbox" id="video-loop" checked />
            <span>Loop</span>
          </label>
          <label class="check-field">
            <input type="checkbox" id="video-muted" checked />
            <span>Muted</span>
          </label>
        </div>
      </div>

      <div class="source-block compositing">
        <h3 class="subhead">Compositing</h3>
        <div class="field-row">
          <label class="field">
            <span>Opacity</span>
            <input type="range" id="opacity" min="0" max="1" step="0.01" />
          </label>
          <label class="field">
            <span>Feather (px)</span>
            <input type="range" id="feather" min="0" max="80" step="1" />
          </label>
          <label class="field">
            <span>Blend</span>
            <select id="blend-mode"></select>
          </label>
        </div>
      </div>
    </div>
  `;

  const zoneLabel = host.querySelector('#source-zone-label')!;
  const emptyEl = host.querySelector('#source-empty')!;
  const formEl = host.querySelector('#source-form')!;
  const kindSelect = host.querySelector<HTMLSelectElement>('#source-kind')!;
  const effectFields = host.querySelector('#effect-fields')!;
  const solidFields = host.querySelector('#solid-fields')!;
  const mediaFields = host.querySelector('#media-fields')!;
  const effectSelect = host.querySelector<HTMLSelectElement>('#effect-id')!;
  const effectDesc = host.querySelector('#effect-desc')!;
  const color1 = host.querySelector<HTMLInputElement>('#color1')!;
  const color2 = host.querySelector<HTMLInputElement>('#color2')!;
  const speed = host.querySelector<HTMLInputElement>('#speed')!;
  const paramsHost = host.querySelector('#effect-params')!;
  const strobeWarning = host.querySelector('#strobe-warning')!;
  const solidColor = host.querySelector<HTMLInputElement>('#solid-color')!;
  const mediaStatus = host.querySelector('#media-status')!;
  const mediaFile = host.querySelector<HTMLInputElement>('#media-file')!;
  const mediaFit = host.querySelector<HTMLSelectElement>('#media-fit')!;
  const videoOpts = host.querySelector('#video-opts')!;
  const videoLoop = host.querySelector<HTMLInputElement>('#video-loop')!;
  const videoMuted = host.querySelector<HTMLInputElement>('#video-muted')!;
  const opacity = host.querySelector<HTMLInputElement>('#opacity')!;
  const feather = host.querySelector<HTMLInputElement>('#feather')!;
  const blendMode = host.querySelector<HTMLSelectElement>('#blend-mode')!;

  for (const effect of EFFECTS) {
    const opt = document.createElement('option');
    opt.value = effect.id;
    opt.textContent = effect.label;
    effectSelect.appendChild(opt);
  }
  for (const mode of BLEND_MODES) {
    const opt = document.createElement('option');
    opt.value = mode;
    opt.textContent = mode;
    blendMode.appendChild(opt);
  }

  let boundZoneId: string | null = null;
  let suppress = false;

  const selectedZone = (): Zone | null => {
    const id = boundZoneId ?? getSelectedZoneId();
    if (!id) return null;
    return store.getState().zones.find((z) => z.id === id) ?? null;
  };

  const patchSource = (next: SourceAssignment): void => {
    const zone = selectedZone();
    if (!zone) return;
    const prev = zone.source;
    if (
      (prev.kind === 'image' || prev.kind === 'video') &&
      prev.objectUrl &&
      (next.kind !== prev.kind || ('objectUrl' in next && next.objectUrl !== prev.objectUrl))
    ) {
      revokeObjectUrl(prev.objectUrl);
    }
    store.updateZone(zone.id, { source: next });
  };

  const renderParamControls = (effectId: string, params: Record<string, number>): void => {
    const def = EFFECT_BY_ID[effectId];
    paramsHost.innerHTML = '';
    if (!def) return;

    for (const param of def.params) {
      const wrap = document.createElement('label');
      wrap.className = 'field';
      const title = document.createElement('span');
      title.textContent = param.label;
      wrap.appendChild(title);

      const control = createParamControl(param, params[param.key] ?? param.default, (value) => {
        const zone = selectedZone();
        if (!zone || zone.source.kind !== 'effect') return;
        patchSource({
          ...zone.source,
          params: { ...zone.source.params, [param.key]: value },
        });
        updateStrobeWarning();
      });
      wrap.appendChild(control);
      paramsHost.appendChild(wrap);
    }
    updateStrobeWarning();
  };

  const updateStrobeWarning = (): void => {
    const zone = selectedZone();
    if (!zone || zone.source.kind !== 'effect' || zone.source.effectId !== 'strobe') {
      strobeWarning.classList.add('hidden');
      return;
    }
    const hz = zone.source.params.hz ?? 2;
    const uncapped = (zone.source.params.uncapped ?? 0) > 0.5;
    if (hz > 3 || uncapped) strobeWarning.classList.remove('hidden');
    else strobeWarning.classList.add('hidden');
  };

  const syncForm = (): void => {
    const zone = selectedZone();
    suppress = true;
    if (!zone) {
      emptyEl.classList.remove('hidden');
      formEl.classList.add('hidden');
      zoneLabel.textContent = '';
      suppress = false;
      return;
    }

    emptyEl.classList.add('hidden');
    formEl.classList.remove('hidden');
    zoneLabel.textContent = zone.name;

    const kind = zone.source.kind;
    kindSelect.value = kind === 'image' || kind === 'video' || kind === 'solid' || kind === 'effect' ? kind : 'effect';
    effectFields.classList.toggle('hidden', kind !== 'effect');
    solidFields.classList.toggle('hidden', kind !== 'solid');
    mediaFields.classList.toggle('hidden', kind !== 'image' && kind !== 'video');
    videoOpts.classList.toggle('hidden', kind !== 'video');
    mediaFile.accept = kind === 'video' ? 'video/*' : 'image/*';

    opacity.value = String(zone.opacity);
    feather.value = String(zone.feather);
    blendMode.value = zone.blendMode;

    if (zone.source.kind === 'solid') {
      solidColor.value = normalizeColor(zone.source.color);
    } else if (zone.source.kind === 'effect') {
      const src = zone.source;
      effectSelect.value = EFFECT_BY_ID[src.effectId] ? src.effectId : DEFAULT_EFFECT_ID;
      effectDesc.textContent = EFFECT_BY_ID[effectSelect.value]?.description ?? '';
      color1.value = normalizeColor(src.color1);
      color2.value = normalizeColor(src.color2);
      speed.value = String(src.speed);
      renderParamControls(src.effectId, src.params);
    } else if (zone.source.kind === 'image' || zone.source.kind === 'video') {
      const src = zone.source;
      mediaFit.value = src.fit;
      if (src.kind === 'video') {
        videoLoop.checked = src.loop;
        videoMuted.checked = src.muted;
      }
      if (src.missing || !src.objectUrl) {
        mediaStatus.textContent = `Missing media: re-import “${src.fileName}” (object URLs don’t persist).`;
        mediaStatus.classList.add('warn-inline');
      } else {
        mediaStatus.textContent = `Loaded: ${src.fileName}`;
        mediaStatus.classList.remove('warn-inline');
      }
    }
    suppress = false;
  };

  kindSelect.addEventListener('change', () => {
    if (suppress) return;
    const zone = selectedZone();
    if (!zone) return;
    if (kindSelect.value === 'solid') {
      patchSource({ kind: 'solid', color: '#ffffff' });
    } else if (kindSelect.value === 'image') {
      patchSource({
        kind: 'image',
        objectUrl: '',
        fileName: '(choose a file)',
        fit: 'cover',
        missing: true,
      });
    } else if (kindSelect.value === 'video') {
      patchSource({
        kind: 'video',
        objectUrl: '',
        fileName: '(choose a file)',
        fit: 'cover',
        loop: true,
        muted: true,
        missing: true,
      });
    } else {
      patchSource(defaultEffectSource());
    }
  });

  effectSelect.addEventListener('change', () => {
    if (suppress) return;
    const zone = selectedZone();
    if (!zone || zone.source.kind !== 'effect') return;
    const effectId = effectSelect.value;
    patchSource({
      ...zone.source,
      effectId,
      params: defaultParamsFor(effectId),
    });
  });

  const bindColor = (input: HTMLInputElement, key: 'color1' | 'color2'): void => {
    input.addEventListener('input', () => {
      if (suppress) return;
      const zone = selectedZone();
      if (!zone || zone.source.kind !== 'effect') return;
      patchSource({ ...zone.source, [key]: input.value });
    });
  };
  bindColor(color1, 'color1');
  bindColor(color2, 'color2');

  speed.addEventListener('input', () => {
    if (suppress) return;
    const zone = selectedZone();
    if (!zone || zone.source.kind !== 'effect') return;
    patchSource({ ...zone.source, speed: Number(speed.value) });
  });

  solidColor.addEventListener('input', () => {
    if (suppress) return;
    const zone = selectedZone();
    if (!zone || zone.source.kind !== 'solid') return;
    patchSource({ kind: 'solid', color: solidColor.value });
  });

  mediaFit.addEventListener('change', () => {
    if (suppress) return;
    const zone = selectedZone();
    if (!zone || (zone.source.kind !== 'image' && zone.source.kind !== 'video')) return;
    patchSource({ ...zone.source, fit: mediaFit.value as 'cover' | 'contain' | 'stretch' });
  });

  videoLoop.addEventListener('change', () => {
    if (suppress) return;
    const zone = selectedZone();
    if (!zone || zone.source.kind !== 'video') return;
    const url = zone.source.objectUrl;
    patchSource({ ...zone.source, loop: videoLoop.checked });
    if (url) {
      const element = getMediaElement(url);
      if (element instanceof HTMLVideoElement) element.loop = videoLoop.checked;
    }
  });

  videoMuted.addEventListener('change', () => {
    if (suppress) return;
    const zone = selectedZone();
    if (!zone || zone.source.kind !== 'video') return;
    const url = zone.source.objectUrl;
    patchSource({ ...zone.source, muted: videoMuted.checked });
    if (url) {
      const element = getMediaElement(url);
      if (element instanceof HTMLVideoElement) {
        element.muted = videoMuted.checked;
        void ensureVideoPlaying(element);
      }
    }
  });

  mediaFile.addEventListener('change', async () => {
    const file = mediaFile.files?.[0];
    mediaFile.value = '';
    if (!file) return;
    const zone = selectedZone();
    if (!zone) return;

    try {
      if (kindSelect.value === 'video' || zone.source.kind === 'video') {
        const { url } = await loadVideoFromFile(file, {
          loop: videoLoop.checked,
          muted: videoMuted.checked,
        });
        patchSource({
          kind: 'video',
          objectUrl: url,
          fileName: file.name,
          fit: (mediaFit.value as 'cover' | 'contain' | 'stretch') || 'cover',
          loop: videoLoop.checked,
          muted: videoMuted.checked,
          missing: false,
        });
      } else {
        const { url } = await loadImageFromFile(file);
        patchSource({
          kind: 'image',
          objectUrl: url,
          fileName: file.name,
          fit: (mediaFit.value as 'cover' | 'contain' | 'stretch') || 'cover',
          missing: false,
        });
      }
    } catch (err) {
      mediaStatus.textContent = err instanceof Error ? err.message : 'Failed to load media';
      mediaStatus.classList.add('warn-inline');
    }
  });

  opacity.addEventListener('input', () => {
    if (suppress) return;
    const zone = selectedZone();
    if (!zone) return;
    store.updateZone(zone.id, { opacity: Number(opacity.value) });
  });

  feather.addEventListener('input', () => {
    if (suppress) return;
    const zone = selectedZone();
    if (!zone) return;
    store.updateZone(zone.id, { feather: Number(feather.value) });
  });

  blendMode.addEventListener('change', () => {
    if (suppress) return;
    const zone = selectedZone();
    if (!zone) return;
    store.updateZone(zone.id, { blendMode: blendMode.value as BlendMode });
  });

  const unsub = store.subscribe(() => syncForm());

  return {
    destroy: () => unsub(),
    setZoneId: (zoneId) => {
      boundZoneId = zoneId;
      syncForm();
    },
  };
}

function createParamControl(
  param: EffectParamDef,
  value: number,
  onChange: (value: number) => void,
): HTMLElement {
  if (param.kind === 'boolean') {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value > 0.5;
    input.addEventListener('change', () => onChange(input.checked ? 1 : 0));
    return input;
  }

  if (param.kind === 'enum' && param.options) {
    const select = document.createElement('select');
    for (const opt of param.options) {
      const el = document.createElement('option');
      el.value = String(opt.value);
      el.textContent = opt.label;
      select.appendChild(el);
    }
    select.value = String(value);
    select.addEventListener('change', () => onChange(Number(select.value)));
    return select;
  }

  const row = document.createElement('div');
  row.className = 'range-row';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(param.min ?? 0);
  input.max = String(param.max ?? 1);
  input.step = String(param.step ?? 0.01);
  input.value = String(value);
  const readout = document.createElement('output');
  readout.textContent = formatParam(value);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    readout.textContent = formatParam(v);
    onChange(v);
  });
  row.append(input, readout);
  return row;
}

function formatParam(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

function normalizeColor(color: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    const [a, b, c] = color.slice(1);
    return `#${a}${a}${b}${b}${c}${c}`;
  }
  return '#ffffff';
}
