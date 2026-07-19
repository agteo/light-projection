import type { Vec2 } from '../domain/types';

/** 3×3 matrix in row-major order: [a00,a01,a02, a10,a11,a12, a20,a21,a22] */
export type Mat3 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type { Vec2 };

const EPS = 1e-10;

export function mat3Identity(): Mat3 {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

export function mat3Multiply(a: Mat3, b: Mat3): Mat3 {
  const r: Mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      r[row * 3 + col] =
        a[row * 3]! * b[col]! +
        a[row * 3 + 1]! * b[3 + col]! +
        a[row * 3 + 2]! * b[6 + col]!;
    }
  }
  return r;
}

/** Apply H to homogeneous (x, y, 1) and perspective-divide. */
export function mat3Transform(h: Mat3, x: number, y: number): Vec2 {
  const X = h[0]! * x + h[1]! * y + h[2]!;
  const Y = h[3]! * x + h[4]! * y + h[5]!;
  const W = h[6]! * x + h[7]! * y + h[8]!;
  if (Math.abs(W) < EPS) return { x: X, y: Y };
  return { x: X / W, y: Y / W };
}

export function mat3Determinant(m: Mat3): number {
  return (
    m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) -
    m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) +
    m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!)
  );
}

export function mat3Invert(m: Mat3): Mat3 | null {
  const det = mat3Determinant(m);
  if (Math.abs(det) < EPS) return null;
  const invDet = 1 / det;
  return [
    (m[4]! * m[8]! - m[5]! * m[7]!) * invDet,
    (m[2]! * m[7]! - m[1]! * m[8]!) * invDet,
    (m[1]! * m[5]! - m[2]! * m[4]!) * invDet,
    (m[5]! * m[6]! - m[3]! * m[8]!) * invDet,
    (m[0]! * m[8]! - m[2]! * m[6]!) * invDet,
    (m[2]! * m[3]! - m[0]! * m[5]!) * invDet,
    (m[3]! * m[7]! - m[4]! * m[6]!) * invDet,
    (m[1]! * m[6]! - m[0]! * m[7]!) * invDet,
    (m[0]! * m[4]! - m[1]! * m[3]!) * invDet,
  ];
}

/**
 * Solve Ah = b for 8 unknowns via Gaussian elimination with partial pivoting.
 * `a` is an 8×8 row-major matrix flattened (64), `b` length 8.
 */
function solve8(a: Float64Array, b: Float64Array): Float64Array | null {
  const n = 8;
  const m = new Float64Array(n * (n + 1));
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) m[r * (n + 1) + c] = a[r * n + c]!;
    m[r * (n + 1) + n] = b[r]!;
  }

  for (let col = 0; col < n; col++) {
    let pivot = col;
    let best = Math.abs(m[col * (n + 1) + col]!);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(m[r * (n + 1) + col]!);
      if (v > best) {
        best = v;
        pivot = r;
      }
    }
    if (best < EPS) return null;

    if (pivot !== col) {
      for (let c = col; c <= n; c++) {
        const tmp = m[col * (n + 1) + c]!;
        m[col * (n + 1) + c] = m[pivot * (n + 1) + c]!;
        m[pivot * (n + 1) + c] = tmp;
      }
    }

    const diag = m[col * (n + 1) + col]!;
    for (let c = col; c <= n; c++) m[col * (n + 1) + c]! /= diag;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r * (n + 1) + col]!;
      if (Math.abs(factor) < EPS) continue;
      for (let c = col; c <= n; c++) {
        m[r * (n + 1) + c]! -= factor * m[col * (n + 1) + c]!;
      }
    }
  }

  const x = new Float64Array(n);
  for (let r = 0; r < n; r++) x[r] = m[r * (n + 1) + n]!;
  return x;
}

/**
 * Homography mapping source points → destination points (projective).
 * Returns null if the correspondence is degenerate.
 */
export function computeHomography(src: readonly Vec2[], dst: readonly Vec2[]): Mat3 | null {
  if (src.length !== 4 || dst.length !== 4) {
    throw new Error('Homography requires exactly 4 point pairs');
  }

  // For each pair: 
  // x' = (h0 u + h1 v + h2) / (h6 u + h7 v + h8)
  // y' = (h3 u + h4 v + h5) / (h6 u + h7 v + h8)
  // With h8 = 1:
  // u h0 + v h1 + h2 - u x' h6 - v x' h7 = x'
  // u h3 + v h4 + h5 - u y' h6 - v y' h7 = y'
  const A = new Float64Array(64);
  const b = new Float64Array(8);

  for (let i = 0; i < 4; i++) {
    const u = src[i]!.x;
    const v = src[i]!.y;
    const x = dst[i]!.x;
    const y = dst[i]!.y;
    const r0 = i * 2;
    const r1 = i * 2 + 1;

    A[r0 * 8 + 0] = u;
    A[r0 * 8 + 1] = v;
    A[r0 * 8 + 2] = 1;
    A[r0 * 8 + 3] = 0;
    A[r0 * 8 + 4] = 0;
    A[r0 * 8 + 5] = 0;
    A[r0 * 8 + 6] = -u * x;
    A[r0 * 8 + 7] = -v * x;
    b[r0] = x;

    A[r1 * 8 + 0] = 0;
    A[r1 * 8 + 1] = 0;
    A[r1 * 8 + 2] = 0;
    A[r1 * 8 + 3] = u;
    A[r1 * 8 + 4] = v;
    A[r1 * 8 + 5] = 1;
    A[r1 * 8 + 6] = -u * y;
    A[r1 * 8 + 7] = -v * y;
    b[r1] = y;
  }

  const h = solve8(A, b);
  if (!h) return null;
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

/** Unit-square corners in UV order matching Zone corners: TL, TR, BR, BL. */
export const UNIT_SQUARE: readonly Vec2[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/** Homography mapping unit-square UV → destination quad (TL,TR,BR,BL). */
export function unitSquareToQuad(dst: readonly [Vec2, Vec2, Vec2, Vec2]): Mat3 | null {
  return computeHomography(UNIT_SQUARE, dst);
}

/** Homography mapping destination quad → unit-square UV (for fragment sampling). */
export function quadToUnitSquare(dst: readonly [Vec2, Vec2, Vec2, Vec2]): Mat3 | null {
  const forward = unitSquareToQuad(dst);
  if (!forward) return null;
  return mat3Invert(forward);
}

/** True if quad is strictly convex (needed for stable warps). */
export function isConvexQuad(corners: readonly [Vec2, Vec2, Vec2, Vec2]): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % 4]!;
    const c = corners[(i + 2) % 4]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-8) return false;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}
