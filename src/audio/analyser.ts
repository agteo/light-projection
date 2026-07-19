import type { AudioBand } from '../domain/types';

export interface AudioFrame {
  level: number;
  bass: number;
  mid: number;
  treble: number;
  /** Normalized 0..1 bins for spectrum texture / bars. */
  spectrum: Float32Array;
}

export type AudioListener = (frame: AudioFrame) => void;

const FFT_SIZE = 2048;

export class AnalyserService {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private freq = new Float32Array(FFT_SIZE / 2);
  private time = new Float32Array(FFT_SIZE);
  private spectrum = new Float32Array(256);
  private raf = 0;
  private running = false;
  private readonly listeners = new Set<AudioListener>();
  private lastFrame: AudioFrame = {
    level: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    spectrum: this.spectrum,
  };

  get active(): boolean {
    return this.running;
  }

  getFrame(): AudioFrame {
    return this.lastFrame;
  }

  subscribe(listener: AudioListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.running) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.5;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    // Do not connect to destination — monitor-only

    this.stream = stream;
    this.ctx = ctx;
    this.analyser = analyser;
    this.source = source;
    this.running = true;

    if (ctx.state === 'suspended') await ctx.resume();

    const tick = (): void => {
      if (!this.running || !this.analyser) return;
      this.lastFrame = this.sample();
      for (const listener of this.listeners) listener(this.lastFrame);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.source = null;
    this.analyser = null;
    this.stream = null;
    this.ctx = null;
    this.lastFrame = {
      level: 0,
      bass: 0,
      mid: 0,
      treble: 0,
      spectrum: this.spectrum.fill(0),
    };
    for (const listener of this.listeners) listener(this.lastFrame);
  }

  private sample(): AudioFrame {
    const analyser = this.analyser!;
    analyser.getFloatTimeDomainData(this.time);
    analyser.getFloatFrequencyData(this.freq);

    let sumSq = 0;
    for (let i = 0; i < this.time.length; i++) {
      const s = this.time[i]!;
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / this.time.length);
    const level = clamp01(rms * 4.5);

    const sampleRate = this.ctx!.sampleRate;
    const bass = bandAverage(this.freq, sampleRate, 20, 250);
    const mid = bandAverage(this.freq, sampleRate, 250, 2000);
    const treble = bandAverage(this.freq, sampleRate, 2000, 8000);

    fillSpectrum(this.freq, sampleRate, this.spectrum);

    return {
      level,
      bass,
      mid,
      treble,
      spectrum: this.spectrum,
    };
  }
}

function bandAverage(
  freqDb: Float32Array,
  sampleRate: number,
  f0: number,
  f1: number,
): number {
  const binHz = sampleRate / FFT_SIZE;
  const i0 = Math.max(0, Math.floor(f0 / binHz));
  const i1 = Math.min(freqDb.length - 1, Math.ceil(f1 / binHz));
  if (i1 <= i0) return 0;
  let sum = 0;
  let count = 0;
  for (let i = i0; i <= i1; i++) {
    // dB range roughly -100..0 → 0..1
    const n = clamp01((freqDb[i]! + 90) / 70);
    sum += n;
    count += 1;
  }
  return count ? sum / count : 0;
}

function fillSpectrum(freqDb: Float32Array, sampleRate: number, out: Float32Array): void {
  const binHz = sampleRate / FFT_SIZE;
  const maxHz = 8000;
  for (let i = 0; i < out.length; i++) {
    const hz = (i / out.length) * maxHz;
    const bin = Math.min(freqDb.length - 1, Math.floor(hz / binHz));
    out[i] = clamp01((freqDb[bin]! + 90) / 70);
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export function bandValue(frame: AudioFrame, band: AudioBand): number {
  switch (band) {
    case 'bass':
      return frame.bass;
    case 'mid':
      return frame.mid;
    case 'treble':
      return frame.treble;
    case 'level':
    default:
      return frame.level;
  }
}

/** Exponential smoothing toward target. smoothing 0 = instant, 1 = very slow. */
export function smoothToward(prev: number, next: number, smoothing: number): number {
  const a = 1 - clamp01(smoothing);
  return prev + (next - prev) * Math.max(0.05, a);
}
