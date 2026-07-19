import type { Zone } from '../domain/types';
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

export interface RendererOptions {
  mode?: 'test-pattern' | 'white';
}

export class WebGLRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly vbo: WebGLBuffer;
  private readonly locPos: number;
  private readonly locHinv: WebGLUniformLocation;
  private readonly locTime: WebGLUniformLocation;
  private readonly locOpacity: WebGLUniformLocation;
  private readonly locMode: WebGLUniformLocation;
  private readonly locResolution: WebGLUniformLocation;
  private mode: 'test-pattern' | 'white' = 'test-pattern';
  private raf = 0;
  private startTime = performance.now();
  private zones: Zone[] = [];
  private running = false;

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
    this.locHinv = gl.getUniformLocation(this.program, 'u_Hinv')!;
    this.locTime = gl.getUniformLocation(this.program, 'u_time')!;
    this.locOpacity = gl.getUniformLocation(this.program, 'u_opacity')!;
    this.locMode = gl.getUniformLocation(this.program, 'u_mode')!;
    this.locResolution = gl.getUniformLocation(this.program, 'u_resolution')!;

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error('Failed to create buffers');
    this.vao = vao;
    this.vbo = vbo;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    // 2 tris × 3 verts × 2 floats — updated per zone
    gl.bufferData(gl.ARRAY_BUFFER, 6 * 2 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.locPos);
    gl.vertexAttribPointer(this.locPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  setMode(mode: 'test-pattern' | 'white'): void {
    this.mode = mode;
  }

  setZones(zones: Zone[]): void {
    this.zones = zones;
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
    gl.deleteBuffer(this.vbo);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }

  private renderFrame(): void {
    const gl = this.gl;
    const t = (performance.now() - this.startTime) / 1000;

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);
    gl.uniform2f(this.locResolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.locTime, t);
    gl.uniform1i(this.locMode, this.mode === 'white' ? 1 : 0);

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
    // Two triangles: TL-TR-BR and TL-BR-BL
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

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }
}

/** WebGL expects column-major; our Mat3 is row-major. */
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
