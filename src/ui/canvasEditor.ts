import type { Vec2, Zone } from '../domain/types';
import { isConvexQuad } from '../math/homography';
import type { WebGLRenderer } from '../render/renderer';
import type { ProjectStore } from '../state/store';

const HANDLE_HIT_PX = 14;

type DragState = { kind: 'corner'; zoneId: string; cornerIndex: number } | null;

function pointInQuad(p: Vec2, corners: readonly [Vec2, Vec2, Vec2, Vec2]): boolean {
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

  if (!wrap.querySelector('.canvas-hint')) {
    const hint = document.createElement('p');
    hint.className = 'canvas-hint';
    hint.textContent =
      'Drag corner handles into an extreme trapezoid — grid lines must stay straight (no diagonal seam).';
    wrap.appendChild(hint);
  }

  let selectedZoneId: string | null = store.getState().zones[0]?.id ?? null;
  let drag: DragState = null;

  const setSelected = (id: string | null): void => {
    selectedZoneId = id;
    options.onSelectionChange?.(id);
    drawOverlay();
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

  const hitCorner = (p: Vec2, zone: Zone): number | null => {
    const rect = overlay!.getBoundingClientRect();
    const threshold = HANDLE_HIT_PX / Math.min(rect.width, rect.height);
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
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = '#6db3ff';
        ctx.fill();
        ctx.strokeStyle = '#0b0d12';
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
      }
    }
  };

  const onPointerDown = (event: PointerEvent): void => {
    overlay!.setPointerCapture(event.pointerId);
    const p = toNorm(event.clientX, event.clientY);
    const project = store.getState();

    const ordered = [
      ...project.zones.filter((z) => z.id === selectedZoneId),
      ...project.zones.filter((z) => z.id !== selectedZoneId),
    ];

    for (const zone of ordered) {
      const cornerIndex = hitCorner(p, zone);
      if (cornerIndex !== null) {
        setSelected(zone.id);
        drag = { kind: 'corner', zoneId: zone.id, cornerIndex };
        return;
      }
    }

    const hit = [...project.zones]
      .filter((z) => z.visible && pointInQuad(p, z.corners))
      .sort((a, b) => b.zIndex - a.zIndex)[0];
    setSelected(hit?.id ?? selectedZoneId);
    drag = null;
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!drag) return;
    const active = drag;
    const p = toNorm(event.clientX, event.clientY);
    const zone = store.getState().zones.find((z) => z.id === active.zoneId);
    if (!zone) return;

    const nextCorners = zone.corners.map((c) => ({ ...c })) as [Vec2, Vec2, Vec2, Vec2];
    nextCorners[active.cornerIndex] = p;
    if (!isConvexQuad(nextCorners)) return;

    store.updateZone(zone.id, { corners: nextCorners });
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (overlay!.hasPointerCapture(event.pointerId)) {
      overlay!.releasePointerCapture(event.pointerId);
    }
    drag = null;
  };

  overlay.addEventListener('pointerdown', onPointerDown);
  overlay.addEventListener('pointermove', onPointerMove);
  overlay.addEventListener('pointerup', onPointerUp);
  overlay.addEventListener('pointercancel', onPointerUp);

  const unsub = store.subscribe((project) => {
    renderer.setZones(project.zones);
    if (selectedZoneId && !project.zones.some((z) => z.id === selectedZoneId)) {
      selectedZoneId = project.zones[0]?.id ?? null;
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
      renderer.stop();
    },
    setSelectedZoneId: (id) => {
      setSelected(id);
    },
    getSelectedZoneId: () => selectedZoneId,
  };
}
