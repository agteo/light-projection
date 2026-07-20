import { applyMidiMessage, listMappableZones, mappingLabel } from '../midi/apply';
import { MidiService, midiSupported } from '../midi/service';
import {
  describeMidiTarget,
  preferredMessageType,
  targetBlackout,
  targetZoneOpacity,
  targetZoneSpeed,
  targetZoneVisibility,
} from '../midi/targets';
import type { ProjectStore } from '../state/store';

export interface MidiPanelHandle {
  destroy: () => void;
}

export function mountMidiPanel(host: HTMLElement, store: ProjectStore): MidiPanelHandle {
  if (!midiSupported()) {
    host.innerHTML = `
      <p class="muted">Web MIDI is unavailable here. Use Chrome or Edge to map a controller.</p>
    `;
    host.hidden = false;
    return { destroy: () => undefined };
  }

  host.innerHTML = `
    <div class="panel-head">
      <button type="button" id="midi-connect">Connect MIDI</button>
    </div>
    <p id="midi-status" class="muted">Disconnected — connect a controller, then Learn a target.</p>
    <div id="midi-learn-targets" class="midi-targets"></div>
    <div class="midi-mappings-head">
      <h3 class="subhead">Mappings</h3>
    </div>
    <ul id="midi-mapping-list" class="midi-mapping-list"></ul>
  `;

  const connectBtn = host.querySelector<HTMLButtonElement>('#midi-connect')!;
  const statusEl = host.querySelector('#midi-status')!;
  const targetsEl = host.querySelector('#midi-learn-targets')!;
  const listEl = host.querySelector('#midi-mapping-list')!;

  const midi = new MidiService();
  let learningTarget: string | null = null;

  const setStatus = (text: string): void => {
    statusEl.textContent = text;
  };

  const renderTargets = (): void => {
    const project = store.getState();
    const zones = listMappableZones(project);
    const rows: string[] = [
      learnRow(targetBlackout(), 'Master blackout', 'note'),
    ];
    for (const zone of zones) {
      rows.push(learnRow(targetZoneOpacity(zone.id), `${zone.name} · opacity`, 'cc'));
      rows.push(learnRow(targetZoneVisibility(zone.id), `${zone.name} · visibility`, 'note'));
      if (zone.source.kind === 'effect') {
        rows.push(learnRow(targetZoneSpeed(zone.id), `${zone.name} · speed`, 'cc'));
      }
    }
    targetsEl.innerHTML = rows.join('');
  };

  const renderMappings = (): void => {
    const project = store.getState();
    listEl.innerHTML = '';
    if (project.midiMappings.length === 0) {
      listEl.innerHTML = `<li class="muted">No mappings yet.</li>`;
      return;
    }
    for (const mapping of project.midiMappings) {
      const li = document.createElement('li');
      li.className = 'midi-mapping-row';
      li.innerHTML = `
        <div>
          <strong>${escapeHtml(describeMidiTarget(mapping.target, project.zones))}</strong>
          <span class="muted">${escapeHtml(mappingLabel(mapping))}</span>
        </div>
        <button type="button" class="danger" data-del="${mapping.id}">Remove</button>
      `;
      listEl.appendChild(li);
    }
  };

  const render = (): void => {
    renderTargets();
    renderMappings();
    for (const btn of targetsEl.querySelectorAll<HTMLButtonElement>('[data-learn]')) {
      btn.classList.toggle('active', btn.dataset.learn === learningTarget);
      btn.textContent = btn.dataset.learn === learningTarget ? 'Listening…' : 'Learn';
    }
  };

  targetsEl.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !target.dataset.learn) return;
    if (!midi.connected) {
      setStatus('Connect MIDI first.');
      return;
    }
    if (learningTarget === target.dataset.learn) {
      midi.cancelLearn();
      learningTarget = null;
      render();
      return;
    }
    learningTarget = target.dataset.learn;
    midi.beginLearn(learningTarget);
    render();
  });

  listEl.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !target.dataset.del) return;
    store.removeMidiMapping(target.dataset.del);
  });

  connectBtn.addEventListener('click', async () => {
    try {
      if (midi.connected) {
        midi.stop();
        connectBtn.textContent = 'Connect MIDI';
        connectBtn.classList.remove('active');
        learningTarget = null;
        setStatus('Disconnected.');
        render();
        return;
      }
      await midi.start();
      connectBtn.textContent = 'Disconnect';
      connectBtn.classList.add('active');
      setStatus('Connected — click Learn, then move a control.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'MIDI access failed.');
    }
  });

  const unsubMsg = midi.subscribe((message) => {
    applyMidiMessage(store, message, store.getState().midiMappings);
  });

  const unsubLearn = midi.onLearn((mapping, status) => {
    setStatus(status);
    if (mapping) {
      store.upsertMidiMapping(mapping);
      learningTarget = null;
    } else if (!status.startsWith('Learning')) {
      learningTarget = null;
    }
    render();
  });

  const unsubStore = store.subscribe(() => render());
  render();

  return {
    destroy: () => {
      unsubMsg();
      unsubLearn();
      unsubStore();
      midi.stop();
    },
  };
}

function learnRow(target: string, label: string, hint: 'cc' | 'note'): string {
  const preferred = preferredMessageType(target);
  void hint;
  return `
    <div class="midi-target-row">
      <div>
        <strong>${escapeHtml(label)}</strong>
        <span class="muted">${preferred === 'note' ? 'Note (toggle)' : 'CC (continuous)'}</span>
      </div>
      <button type="button" data-learn="${escapeAttr(target)}">Learn</button>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
