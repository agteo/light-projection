import type { Vec2, Zone } from '../domain/types';
import { isConvexQuad } from '../math/homography';
import type { WebGLRenderer } from '../render/renderer';
import type { ProjectStore } from '../state/store';

const HANDLE_HIT_PX = 14;

type Corners = [Vec2, Vec2, Vec2, Vec2];

type DragState =
  | { kind: 'corner'; zoneId: string; cornerIndex: number }
  | {
      kind: 'edge';
      zoneId: string;
      edgeIndex: number;
      origin: Vec2;
      startCorners: Corners;
    }
  | { kind: 'move'; zoneId: string; origin: Vec2; startCorners: Corners }
  | {
      kind: 'scale';
      zoneId: string;
      origin: Vec2;
      startCorners: Corners;
      center: Vec2;
    }
  | null;

function pointInQuad(p: Vec2, corners: readonly Corners[number][]): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % 4]!;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) < 1e-10) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function cloneCorners(corners: readonly Vec2[]): Corners {
  return corners.map((c) => ({ x: c.x, y: c.y })) as Corners;
}

function centroid(corners: readonly Vec2[]): Vec2 {
  return {
    x: (corners[0]!.x + corners[1]!.x + corners[2]!.x + corners[3]!.x) / 4,
    y: (corners[0]!.y + corners[1]!.y + corners[2]!.y + corners[3]!.y) / 4,
  };
}

function edgeMidpoint(corners: readonly Vec2[], edgeIndex: number): Vec2 {
  const a = corners[edgeIndex]!;
  const b = corners[(edgeIndex + 1) % 4]!;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function translateCorners(corners: Corners, dx: number, dy: number): Corners {
  return corners.map((c) => ({ x: clamp01(c.x + dx), y: clamp01(c.y + dy) })) as Corners;
}

function scaleCorners(corners: Corners, center: Vec2, scale: number): Corners {
  return corners.map((c) => ({
    x: clamp01(center.x + (c.x - center.x) * scale),
    y: clamp01(center.y + (c.y - center.y) * scale),
  })) as Corners;
}

function tryCommitCorners(
  store: ProjectStore,
  zoneId: string,
  next: Corners,
): boolean {
  if (!isConvexQuad(next)) return false;
  store.updateZone(zoneId, { corners: next });
  return true;
}

export interface CanvasEditorHandle {
  destroy: () => void;
  setSelectedZoneId: (id: string | null) => void;
  getSelectedZoneId: () => string | null;
}

export interface CanvasEditorOptions {
  onSelectionChange?: (zoneId: string | null) => void;
}

/**
 * Host must already contain `.canvas-wrap > canvas.gl-canvas` owned by `renderer`.
 * This mounts an overlay canvas for handles on top of it.
 */
export function mountCanvasEditor(
  host: HTMLElement,
  store: ProjectStore,
  renderer: WebGLRenderer,
  options: CanvasEditorOptions = {},
): CanvasEditorHandle {
  const wrap = host.querySelector<HTMLElement>('.canvas-wrap');
  if (!wrap) throw new Error('canvas-wrap missing');

  let stage = wrap.querySelector<HTMLElement>('.canvas-stage');
  if (!stage) {
    stage = document.createElement('div');
    stage.className = 'canvas-stage';
    const gl = wrap.querySelector('.gl-canvas');
    if (!gl) throw new Error('gl-canvas missing');
    wrap.insertBefore(stage, gl);
    stage.appendChild(gl);
  }

  let overlay = stage.querySelector<HTMLCanvasElement>('.overlay-canvas');
  if (!overlay) {
    overlay = document.createElement('canvas');
    overlay.className = 'overlay-canvas';
    overlay.setAttribute('aria-hidden', 'true');
    stage.appendChild(overlay);
  }

  overlay.tabIndex = 0;

  let hint = wrap.querySelector<HTMLParagraphElement>('.canvas-hint');
  if (!hint) {
    hint = document.createElement('p');
    hint.className = 'canvas-hint';
    wrap.appendChild(hint);
  }
  hint.textContent =
    'Drag corners / edge midpoints. Drag inside to move · Shift-drag to scale · Double-click empty to add · Arrows nudge (Shift = 10px).';

  let selectedZoneId: string | null = store.getState().zones[0]?.id ?? null;
  let selectedCornerIndex: number | null = null;
  let drag: DragState = null;

  const setSelected = (id: string | null, cornerIndex: number | null = null): void => {
    selectedZoneId = id;
    selectedCornerIndex = id == null ? null : cornerIndex;
    options.onSelectionChange?.(id);
    drawOverlay();
  };

  const pixelStep = (shift: boolean): Vec2 => {
    const rect = overlay!.getBoundingClientRect();
    const px = shift ? 10 : 1;
    return { x: px / rect.width, y: px / rect.height };
  };

  const syncSize = (): void => {
    const rect = stage!.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width || wrap.clientWidth));
    const h = Math.max(240, Math.floor((w * 9) / 16));
    renderer.resize(w, h);
    stage!.style.height = `${h}px`;
    overlay!.width = renderer.canvas.width;
    overlay!.height = renderer.canvas.height;
    overlay!.style.width = `${w}px`;
    overlay!.style.height = `${h}px`;
    drawOverlay();
  };

  const toNorm = (clientX: number, clientY: number): Vec2 => {
    const rect = overlay!.getBoundingClientRect();
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  };

  const hitThreshold = (): number => {
    const rect = overlay!.getBoundingClientRect();
    return HANDLE_HIT_PX / Math.min(rect.width, rect.height);
  };

  const hitCorner = (p: Vec2, zone: Zone): number | null => {
    const threshold = hitThreshold();
    let best = -1;
    let bestDist = threshold;
    for (let i = 0; i < 4; i++) {
      const c = zone.corners[i]!;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d <= bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best >= 0 ? best : null;
  };

  const hitEdge = (p: Vec2, zone: Zone): number | null => {
    const threshold = hitThreshold();
    let best = -1;
    let bestDist = threshold;
    for (let i = 0; i < 4; i++) {
      const m = edgeMidpoint(zone.corners, i);
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      if (d <= bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best >= 0 ? best : null;
  };

  const drawOverlay = (): void => {
    const ctx = overlay!.getContext('2d');
    if (!ctx) return;
    const w = overlay!.width;
    const h = overlay!.height;
    ctx.clearRect(0, 0, w, h);

    const project = store.getState();
    const dpr = w / (overlay!.clientWidth || w);

    for (const zone of project.zones) {
      if (!zone.visible) continue;
      const selected = zone.id === selectedZoneId;
      const pts = zone.corners.map((c) => ({ x: c.x * w, y: c.y * h }));

      ctx.beginPath();
      ctx.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < 4; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
      ctx.closePath();
      ctx.strokeStyle = selected ? 'rgba(109,179,255,0.95)' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = (selected ? 2 : 1) * dpr;
      ctx.stroke();

      if (!selected) continue;

      for (let i = 0; i < 4; i++) {
        const mid = edgeMidpoint(zone.corners, i);
        const mx = mid.x * w;
        const my = mid.y * h;
        const s = 5 * dpr;
        ctx.fillStyle = '#9ec9ff';
        ctx.fillRect(mx - s, my - s, s * 2, s * 2);
        ctx.strokeStyle = '#0b0d12';
        ctx.lineWidth = 1.25 * dpr;
        ctx.strokeRect(mx - s, my - s, s * 2, s * 2);
      }

      for (let i = 0; i < 4; i++) {
        const p = pts[i]!;
        const active = selectedCornerIndex === i;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (active ? 8 : 6) * dpr, 0, Math.PI * 2);
        ctx.fillStyle = active ? '#ffe08a' : '#6db3ff';
        ctx.fill();
        ctx.strokeStyle = '#0b0d12';
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
      }
    }
  };

  const orderedZones = (projectZones: Zone[]): Zone[] => [
    ...projectZones.filter((z) => z.id === selectedZoneId),
    ...projectZones.filter((z) => z.id !== selectedZoneId),
  ];

  const onPointerDown = (event: PointerEvent): void => {
    overlay!.focus();
    overlay!.setPointerCapture(event.pointerId);
    const p = toNorm(event.clientX, event.clientY);
    const project = store.getState();

    for (const zone of orderedZones(project.zones)) {
      if (!zone.visible) continue;
      const cornerIndex = hitCorner(p, zone);
      if (cornerIndex !== null) {
        setSelected(zone.id, cornerIndex);
        drag = { kind: 'corner', zoneId: zone.id, cornerIndex };
        return;
      }
    }

    for (const zone of orderedZones(project.zones)) {
      if (!zone.visible) continue;
      const edgeIndex = hitEdge(p, zone);
      if (edgeIndex !== null) {
        setSelected(zone.id, null);
        drag = {
          kind: 'edge',
          zoneId: zone.id,
          edgeIndex,
          origin: p,
          startCorners: cloneCorners(zone.corners),
        };
        return;
      }
    }

    const hit = [...project.zones]
      .filter((z) => z.visible && pointInQuad(p, z.corners))
      .sort((a, b) => b.zIndex - a.zIndex)[0];

    if (hit) {
      setSelected(hit.id, null);
      const startCorners = cloneCorners(hit.corners);
      if (event.shiftKey) {
        drag = {
          kind: 'scale',
          zoneId: hit.id,
          origin: p,
          startCorners,
          center: centroid(startCorners),
        };
      } else {
        drag = { kind: 'move', zoneId: hit.id, origin: p, startCorners };
      }
      return;
    }

    drag = null;
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!drag) return;
    const active = drag;
    const p = toNorm(event.clientX, event.clientY);
    const zone = store.getState().zones.find((z) => z.id === active.zoneId);
    if (!zone) return;

    if (active.kind === 'corner') {
      const next = cloneCorners(zone.corners);
      next[active.cornerIndex] = p;
      tryCommitCorners(store, zone.id, next);
      return;
    }

    if (active.kind === 'edge') {
      const dx = p.x - active.origin.x;
      const dy = p.y - active.origin.y;
      const next = cloneCorners(active.startCorners);
      const i0 = active.edgeIndex;
      const i1 = (active.edgeIndex + 1) % 4;
      next[i0] = {
        x: clamp01(active.startCorners[i0]!.x + dx),
        y: clamp01(active.startCorners[i0]!.y + dy),
      };
      next[i1] = {
        x: clamp01(active.startCorners[i1]!.x + dx),
        y: clamp01(active.startCorners[i1]!.y + dy),
      };
      tryCommitCorners(store, zone.id, next);
      return;
    }

    if (active.kind === 'move') {
      const dx = p.x - active.origin.x;
      const dy = p.y - active.origin.y;
      tryCommitCorners(store, zone.id, translateCorners(active.startCorners, dx, dy));
      return;
    }

    if (active.kind === 'scale') {
      const startDist = Math.hypot(
        active.origin.x - active.center.x,
        active.origin.y - active.center.y,
      );
      const currDist = Math.hypot(p.x - active.center.x, p.y - active.center.y);
      if (startDist < 1e-6) return;
      const scale = Math.min(4, Math.max(0.15, currDist / startDist));
      tryCommitCorners(store, zone.id, scaleCorners(active.startCorners, active.center, scale));
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (overlay!.hasPointerCapture(event.pointerId)) {
      overlay!.releasePointerCapture(event.pointerId);
    }
    drag = null;
  };

  const onDblClick = (event: MouseEvent): void => {
    const p = toNorm(event.clientX, event.clientY);
    const project = store.getState();
    const onZone = project.zones.some((z) => z.visible && pointInQuad(p, z.corners));
    if (onZone) return;
    for (const zone of project.zones) {
      if (hitCorner(p, zone) !== null || hitEdge(p, zone) !== null) return;
    }
    const zone = store.addZone();
    setSelected(zone.id, null);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!selectedZoneId) return;
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();

    const zone = store.getState().zones.find((z) => z.id === selectedZoneId);
    if (!zone) return;

    const step = pixelStep(event.shiftKey);
    let dx = 0;
    let dy = 0;
    if (event.key === 'ArrowLeft') dx = -step.x;
    if (event.key === 'ArrowRight') dx = step.x;
    if (event.key === 'ArrowUp') dy = -step.y;
    if (event.key === 'ArrowDown') dy = step.y;

    if (selectedCornerIndex !== null) {
      const next = cloneCorners(zone.corners);
      const c = next[selectedCornerIndex]!;
      next[selectedCornerIndex] = { x: clamp01(c.x + dx), y: clamp01(c.y + dy) };
      tryCommitCorners(store, zone.id, next);
      return;
    }

    tryCommitCorners(store, zone.id, translateCorners(cloneCorners(zone.corners), dx, dy));
  };

  overlay.addEventListener('pointerdown', onPointerDown);
  overlay.addEventListener('pointermove', onPointerMove);
  overlay.addEventListener('pointerup', onPointerUp);
  overlay.addEventListener('pointercancel', onPointerUp);
  overlay.addEventListener('dblclick', onDblClick);
  overlay.addEventListener('keydown', onKeyDown);

  const unsub = store.subscribe((project) => {
    renderer.setZones(project.zones);
    if (selectedZoneId && !project.zones.some((z) => z.id === selectedZoneId)) {
      selectedZoneId = project.zones[0]?.id ?? null;
      selectedCornerIndex = null;
    }
    drawOverlay();
  });

  renderer.setZones(store.getState().zones);
  renderer.start();

  const ro = new ResizeObserver(() => syncSize());
  ro.observe(host);
  syncSize();

  return {
    destroy: () => {
      unsub();
      ro.disconnect();
      overlay!.removeEventListener('pointerdown', onPointerDown);
      overlay!.removeEventListener('pointermove', onPointerMove);
      overlay!.removeEventListener('pointerup', onPointerUp);
      overlay!.removeEventListener('pointercancel', onPointerUp);
      overlay!.removeEventListener('dblclick', onDblClick);
      overlay!.removeEventListener('keydown', onKeyDown);
      renderer.stop();
    },
    setSelectedZoneId: (id) => {
      setSelected(id, null);
    },
    getSelectedZoneId: () => selectedZoneId,
  };
}
