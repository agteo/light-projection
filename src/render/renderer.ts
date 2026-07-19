import type { Zone } from '../domain/types';
import { effectShaderId, parseHexColor } from '../effects/registry';
import { isConvexQuad, quadToUnitSquare, type Mat3 } from '../math/homography';
import { WARP_FRAG, WARP_VERT } from './shaders';

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? 'unknown';
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${info}`);
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create program');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? 'unknown';
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${info}`);
  }
  return program;
}

function requireUniform(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation {
  const loc = gl.getUniformLocation(program, name);
  if (!loc) throw new Error(`Missing uniform ${name}`);
  return loc;
}

export type RenderMode = 'live' | 'test-pattern' | 'white';

export class WebGLRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly vbo: WebGLBuffer;
  private readonly spectrumTex: WebGLTexture;
  private readonly spectrumData = new Uint8Array(256);
  private readonly locPos: number;
  private readonly locHinv: WebGLUniformLocation;
  private readonly locTime: WebGLUniformLocation;
  private readonly locOpacity: WebGLUniformLocation;
  private readonly locSpeed: WebGLUniformLocation;
  private readonly locAudio: WebGLUniformLocation;
  private readonly locColor1: WebGLUniformLocation;
  private readonly locColor2: WebGLUniformLocation;
  private readonly locParams: WebGLUniformLocation;
  private readonly locEffectId: WebGLUniformLocation;
  private readonly locSpectrum: WebGLUniformLocation;
  private mode: RenderMode = 'live';
  private raf = 0;
  private startTime = performance.now();
  private zones: Zone[] = [];
  private running = false;
  /** External audio level 0..1 (Phase 7). */
  private audioLevel = 0;
  /** Optional spectrum bins 0..1 (Phase 7). */
  private spectrumBins: Float32Array | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error('WebGL2 not available');
    this.canvas = canvas;
    this.gl = gl;

    this.program = createProgram(gl, WARP_VERT, WARP_FRAG);
    this.locPos = gl.getAttribLocation(this.program, 'a_pos');
    this.locHinv = requireUniform(gl, this.program, 'u_Hinv');
    this.locTime = requireUniform(gl, this.program, 'u_time');
    this.locOpacity = requireUniform(gl, this.program, 'u_opacity');
    this.locSpeed = requireUniform(gl, this.program, 'u_speed');
    this.locAudio = requireUniform(gl, this.program, 'u_audio');
    this.locColor1 = requireUniform(gl, this.program, 'u_color1');
    this.locColor2 = requireUniform(gl, this.program, 'u_color2');
    this.locParams = requireUniform(gl, this.program, 'u_params');
    this.locEffectId = requireUniform(gl, this.program, 'u_effectId');
    this.locSpectrum = requireUniform(gl, this.program, 'u_spectrum');

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error('Failed to create buffers');
    this.vao = vao;
    this.vbo = vbo;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, 6 * 2 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.locPos);
    gl.vertexAttribPointer(this.locPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const spectrumTex = gl.createTexture();
    if (!spectrumTex) throw new Error('Failed to create spectrum texture');
    this.spectrumTex = spectrumTex;
    gl.bindTexture(gl.TEXTURE_2D, spectrumTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, this.spectrumData);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  setMode(mode: RenderMode): void {
    this.mode = mode;
  }

  setZones(zones: Zone[]): void {
    this.zones = zones;
  }

  setAudioLevel(level: number): void {
    this.audioLevel = Math.min(1, Math.max(0, level));
  }

  setSpectrumBins(bins: Float32Array | null): void {
    this.spectrumBins = bins;
  }

  resize(cssWidth: number, cssHeight: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(cssWidth * dpr));
    const h = Math.max(1, Math.floor(cssHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.gl.viewport(0, 0, w, h);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startTime = performance.now();
    const tick = (): void => {
      if (!this.running) return;
      this.renderFrame();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose(): void {
    this.stop();
    const gl = this.gl;
    gl.deleteTexture(this.spectrumTex);
    gl.deleteBuffer(this.vbo);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }

  private updateSpectrumTexture(time: number): void {
    const gl = this.gl;
    for (let i = 0; i < 256; i++) {
      let v = 0;
      if (this.spectrumBins && this.spectrumBins.length > 0) {
        const idx = Math.floor((i / 256) * this.spectrumBins.length);
        v = this.spectrumBins[idx] ?? 0;
      } else {
        // Demo spectrum until mic analyser lands in Phase 7
        const t = time * 2.2;
        v =
          0.15 +
          0.55 * Math.abs(Math.sin(i * 0.09 + t)) * (0.4 + 0.6 * this.audioLevel) +
          0.25 * Math.abs(Math.sin(i * 0.021 - t * 0.7));
      }
      this.spectrumData[i] = Math.min(255, Math.max(0, Math.floor(v * 255)));
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.spectrumTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RED, gl.UNSIGNED_BYTE, this.spectrumData);
  }

  private renderFrame(): void {
    const gl = this.gl;
    const t = (performance.now() - this.startTime) / 1000;

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);
    this.updateSpectrumTexture(t);
    gl.uniform1i(this.locSpectrum, 0);
    gl.uniform1f(this.locTime, t);

    const sorted = [...this.zones]
      .filter((z) => z.visible)
      .sort((a, b) => a.zIndex - b.zIndex);

    for (const zone of sorted) {
      this.drawZone(zone);
    }
  }

  private drawZone(zone: Zone): void {
    if (!isConvexQuad(zone.corners)) return;
    const hInv = quadToUnitSquare(zone.corners);
    if (!hInv) return;

    const gl = this.gl;
    const [tl, tr, br, bl] = zone.corners;
    const verts = new Float32Array([
      tl.x,
      tl.y,
      tr.x,
      tr.y,
      br.x,
      br.y,
      tl.x,
      tl.y,
      br.x,
      br.y,
      bl.x,
      bl.y,
    ]);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts);

    gl.uniformMatrix3fv(this.locHinv, false, mat3ToWebGL(hInv));
    gl.uniform1f(this.locOpacity, zone.opacity);
    gl.uniform1f(this.locAudio, this.audioLevel);

    const look = resolveZoneLook(zone, this.mode);
    gl.uniform1i(this.locEffectId, look.effectId);
    gl.uniform1f(this.locSpeed, look.speed);
    gl.uniform3f(this.locColor1, look.color1[0], look.color1[1], look.color1[2]);
    gl.uniform3f(this.locColor2, look.color2[0], look.color2[1], look.color2[2]);
    gl.uniform4f(this.locParams, look.params[0], look.params[1], look.params[2], look.params[3]);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }
}

interface ZoneLook {
  effectId: number;
  speed: number;
  color1: [number, number, number];
  color2: [number, number, number];
  params: [number, number, number, number];
}

function resolveZoneLook(zone: Zone, mode: RenderMode): ZoneLook {
  if (mode === 'test-pattern') {
    return {
      effectId: 0,
      speed: 1,
      color1: [1, 1, 1],
      color2: [1, 1, 1],
      params: [0, 0, 0, 0],
    };
  }
  if (mode === 'white') {
    return {
      effectId: 9,
      speed: 1,
      color1: [1, 1, 1],
      color2: [1, 1, 1],
      params: [0, 0, 0, 0],
    };
  }

  const src = zone.source;
  if (src.kind === 'solid') {
    return {
      effectId: 10,
      speed: 1,
      color1: parseHexColor(src.color),
      color2: parseHexColor(src.color),
      params: [0, 0, 0, 0],
    };
  }

  if (src.kind === 'effect') {
    const params = packParams(src.effectId, src.params);
    return {
      effectId: effectShaderId(src.effectId),
      speed: src.speed,
      color1: parseHexColor(src.color1),
      color2: parseHexColor(src.color2),
      params,
    };
  }

  // Image/video: placeholder tint until Phase 5
  return {
    effectId: 10,
    speed: 1,
    color1: [0.2, 0.2, 0.25],
    color2: [0.2, 0.2, 0.25],
    params: [0, 0, 0, 0],
  };
}

function packParams(effectId: string, params: Record<string, number>): [number, number, number, number] {
  switch (effectId) {
    case 'solid-pulse':
      return [params.amount ?? 0.45, 0, 0, 0];
    case 'gradient-sweep':
      return [params.angle ?? 0, params.width ?? 0.35, 0, 0];
    case 'scrolling-bars':
      return [params.orientation ?? 0, params.density ?? 8, 0, 0];
    case 'plasma':
      return [params.scale ?? 2.5, 0, 0, 0];
    case 'concentric-rings':
      return [params.spacing ?? 0.12, params.thickness ?? 0.04, 0, 0];
    case 'strobe':
      return [params.hz ?? 2, params.uncapped ?? 0, 0, 0];
    case 'sparkle':
      return [params.density ?? 60, params.size ?? 0.01, 0, 0];
    case 'spectrum-bars':
      return [params.bars ?? 24, 0, 0, 0];
    default:
      return [0, 0, 0, 0];
  }
}

function mat3ToWebGL(m: Mat3): Float32Array {
  return new Float32Array([
    m[0]!,
    m[3]!,
    m[6]!,
    m[1]!,
    m[4]!,
    m[7]!,
    m[2]!,
    m[5]!,
    m[8]!,
  ]);
}
