export const WARP_VERT = `#version 300 es
precision highp float;

in vec2 a_pos; // normalized output space 0..1 (y down)

uniform vec2 u_resolution;

out vec2 v_pos;

void main() {
  v_pos = a_pos;
  // Convert y-down 0..1 → clip space
  vec2 ndc = vec2(a_pos.x * 2.0 - 1.0, 1.0 - a_pos.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

export const WARP_FRAG = `#version 300 es
precision highp float;

in vec2 v_pos;

uniform mat3 u_Hinv; // maps output pos → UV homogeneous
uniform float u_time;
uniform float u_opacity;
uniform int u_mode; // 0 = test pattern, 1 = solid white (later)

out vec4 outColor;

vec3 testPattern(vec2 uv) {
  // Checker + grid + corner markers — lines stay straight under projective warp
  float checker = step(0.5, fract(uv.x * 8.0)) == step(0.5, fract(uv.y * 8.0)) ? 0.22 : 0.08;

  vec2 gridUv = abs(fract(uv * 8.0) - 0.5);
  float grid = 1.0 - smoothstep(0.0, 0.04, min(gridUv.x, gridUv.y));
  grid = max(grid, 1.0 - smoothstep(0.0, 0.02, min(abs(uv.x - 0.5), abs(uv.y - 0.5))));

  // Border
  float border = step(uv.x, 0.02) + step(0.98, uv.x) + step(uv.y, 0.02) + step(0.98, uv.y);
  border = min(border, 1.0);

  // Corner dots
  float corners = 0.0;
  vec2 c[4];
  c[0] = vec2(0.0); c[1] = vec2(1.0, 0.0); c[2] = vec2(1.0); c[3] = vec2(0.0, 1.0);
  for (int i = 0; i < 4; i++) {
    corners = max(corners, 1.0 - smoothstep(0.03, 0.05, distance(uv, c[i])));
  }

  vec3 base = vec3(checker);
  base = mix(base, vec3(0.85, 0.9, 1.0), grid * 0.85);
  base = mix(base, vec3(1.0, 0.35, 0.2), border);
  base = mix(base, vec3(0.2, 1.0, 0.55), corners);

  // Subtle pulse so the loop is visibly alive
  base *= 0.92 + 0.08 * sin(u_time * 2.0);
  return base;
}

void main() {
  vec3 uvh = u_Hinv * vec3(v_pos, 1.0);
  if (abs(uvh.z) < 1e-6) discard;
  vec2 uv = uvh.xy / uvh.z;

  // Outside the unit square (with tiny epsilon)
  if (uv.x < -0.001 || uv.x > 1.001 || uv.y < -0.001 || uv.y > 1.001) discard;

  vec3 color;
  if (u_mode == 1) {
    color = vec3(1.0);
  } else {
    color = testPattern(clamp(uv, 0.0, 1.0));
  }

  outColor = vec4(color, u_opacity);
}
`;
