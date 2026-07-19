import type { MidiMapping } from '../domain/types';
import { createMidiMapping } from './targets';

export type MidiMessage =
  | { type: 'cc'; channel: number; number: number; value: number }
  | { type: 'note'; channel: number; number: number; velocity: number; down: boolean };

export type MidiListener = (message: MidiMessage) => void;
export type LearnListener = (mapping: MidiMapping | null, status: string) => void;

export function midiSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
}

export class MidiService {
  private access: MIDIAccess | null = null;
  private readonly messageListeners = new Set<MidiListener>();
  private readonly learnListeners = new Set<LearnListener>();
  private learnTarget: string | null = null;
  private learnTimer = 0;

  get connected(): boolean {
    return this.access !== null;
  }

  get learning(): boolean {
    return this.learnTarget !== null;
  }

  subscribe(listener: MidiListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onLearn(listener: LearnListener): () => void {
    this.learnListeners.add(listener);
    return () => this.learnListeners.delete(listener);
  }

  async start(): Promise<void> {
    if (!midiSupported()) {
      throw new Error('Web MIDI is not supported in this browser (use Chrome or Edge).');
    }
    if (this.access) return;

    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.bindInputs(this.access);
    this.access.onstatechange = () => {
      if (this.access) this.bindInputs(this.access);
    };
  }

  stop(): void {
    this.cancelLearn();
    if (this.access) {
      for (const input of this.access.inputs.values()) {
        input.onmidimessage = null;
      }
    }
    this.access = null;
  }

  beginLearn(target: string): void {
    this.learnTarget = target;
    this.emitLearn(null, `Learning… move a knob or press a pad for “${target}”`);
    window.clearTimeout(this.learnTimer);
    this.learnTimer = window.setTimeout(() => {
      if (this.learnTarget === target) {
        this.cancelLearn('Learn timed out — try again.');
      }
    }, 15000);
  }

  cancelLearn(status = 'Learn cancelled.'): void {
    this.learnTarget = null;
    window.clearTimeout(this.learnTimer);
    this.emitLearn(null, status);
  }

  private bindInputs(access: MIDIAccess): void {
    for (const input of access.inputs.values()) {
      input.onmidimessage = (event) => this.handleData(event.data);
    }
  }

  private handleData(data: Uint8Array | null): void {
    if (!data || data.length < 2) return;
    const status = data[0]!;
    const command = status & 0xf0;
    const channel = (status & 0x0f) + 1;
    const data1 = data[1]!;
    const data2 = data.length > 2 ? data[2]! : 0;

    let message: MidiMessage | null = null;
    if (command === 0xb0) {
      message = { type: 'cc', channel, number: data1, value: data2 / 127 };
    } else if (command === 0x90) {
      message = {
        type: 'note',
        channel,
        number: data1,
        velocity: data2 / 127,
        down: data2 > 0,
      };
    } else if (command === 0x80) {
      message = { type: 'note', channel, number: data1, velocity: 0, down: false };
    }

    if (!message) return;

    if (this.learnTarget) {
      // Ignore note-offs while learning
      if (message.type === 'note' && !message.down) return;
      const mapping = createMidiMapping({
        type: message.type,
        channel: message.channel,
        number: message.number,
        target: this.learnTarget,
      });
      this.learnTarget = null;
      window.clearTimeout(this.learnTimer);
      this.emitLearn(mapping, 'Mapping captured.');
      return;
    }

    for (const listener of this.messageListeners) listener(message);
  }

  private emitLearn(mapping: MidiMapping | null, status: string): void {
    for (const listener of this.learnListeners) listener(mapping, status);
  }
}
