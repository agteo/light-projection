import {
  DEFAULT_EFFECT_ID,
  defaultParamsFor,
  EFFECT_BY_ID,
  EFFECTS,
  type EffectParamDef,
} from '../effects/registry';
import { defaultEffectSource } from '../domain/factory';
import type { SourceAssignment, Zone } from '../domain/types';
import type { ProjectStore } from '../state/store';

export interface SourcePanelHandle {
  destroy: () => void;
  setZoneId: (zoneId: string | null) => void;
}

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
    </div>
  `;

  const zoneLabel = host.querySelector('#source-zone-label')!;
  const emptyEl = host.querySelector('#source-empty')!;
  const formEl = host.querySelector('#source-form')!;
  const kindSelect = host.querySelector<HTMLSelectElement>('#source-kind')!;
  const effectFields = host.querySelector('#effect-fields')!;
  const solidFields = host.querySelector('#solid-fields')!;
  const effectSelect = host.querySelector<HTMLSelectElement>('#effect-id')!;
  const effectDesc = host.querySelector('#effect-desc')!;
  const color1 = host.querySelector<HTMLInputElement>('#color1')!;
  const color2 = host.querySelector<HTMLInputElement>('#color2')!;
  const speed = host.querySelector<HTMLInputElement>('#speed')!;
  const paramsHost = host.querySelector('#effect-params')!;
  const strobeWarning = host.querySelector('#strobe-warning')!;
  const solidColor = host.querySelector<HTMLInputElement>('#solid-color')!;

  for (const effect of EFFECTS) {
    const opt = document.createElement('option');
    opt.value = effect.id;
    opt.textContent = effect.label;
    effectSelect.appendChild(opt);
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

    const kind = zone.source.kind === 'solid' ? 'solid' : 'effect';
    kindSelect.value = kind;
    effectFields.classList.toggle('hidden', kind !== 'effect');
    solidFields.classList.toggle('hidden', kind !== 'solid');

    if (zone.source.kind === 'solid') {
      solidColor.value = normalizeColor(zone.source.color);
    } else {
      const src =
        zone.source.kind === 'effect' ? zone.source : (defaultEffectSource() as Extract<SourceAssignment, { kind: 'effect' }>);
      // If image/video somehow selected, coerce display to effect defaults without writing yet
      if (zone.source.kind !== 'effect') {
        suppress = false;
        patchSource(defaultEffectSource());
        return;
      }
      effectSelect.value = EFFECT_BY_ID[src.effectId] ? src.effectId : DEFAULT_EFFECT_ID;
      effectDesc.textContent = EFFECT_BY_ID[effectSelect.value]?.description ?? '';
      color1.value = normalizeColor(src.color1);
      color2.value = normalizeColor(src.color2);
      speed.value = String(src.speed);
      renderParamControls(src.effectId, src.params);
    }
    suppress = false;
  };

  kindSelect.addEventListener('change', () => {
    if (suppress) return;
    const zone = selectedZone();
    if (!zone) return;
    if (kindSelect.value === 'solid') {
      patchSource({ kind: 'solid', color: '#ffffff' });
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
