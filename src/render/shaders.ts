export const WARP_VERT = `#version 300 es
precision highp float;

in vec2 a_pos; // normalized output space 0..1 (y down)

out vec2 v_pos;

void main() {
  v_pos = a_pos;
  vec2 ndc = vec2(a_pos.x * 2.0 - 1.0, 1.0 - a_pos.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

export const WARP_FRAG = `#version 300 es
precision highp float;

in vec2 v_pos;

uniform mat3 u_Hinv;
uniform float u_time;
uniform float u_opacity;
uniform float u_speed;
uniform float u_audio; // 0..1 reactive level
uniform float u_feather; // UV-space edge soft width
uniform float u_uvScale; // audio scale target (1 = identity)
uniform float u_hueShift; // degrees
uniform vec3 u_color1;
uniform vec3 u_color2;
uniform vec4 u_params; // effect-specific packed params
uniform int u_effectId; // 0=test, 1..8 effects, 9=white, 10=solid, 11=media, 12=missing media
uniform int u_fitMode; // 0=cover, 1=contain, 2=stretch
uniform vec2 u_mediaSize; // pixels
uniform sampler2D u_spectrum; // 1D spectrum in a 256x1 texture
uniform sampler2D u_media;

out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

vec3 testPattern(vec2 uv) {
  float checker = mod(floor(uv.x * 8.0) + floor(uv.y * 8.0), 2.0) < 0.5 ? 0.22 : 0.08;
  vec2 gridUv = abs(fract(uv * 8.0) - 0.5);
  float grid = 1.0 - smoothstep(0.0, 0.04, min(gridUv.x, gridUv.y));
  grid = max(grid, 1.0 - smoothstep(0.0, 0.02, min(abs(uv.x - 0.5), abs(uv.y - 0.5))));
  float border = min(step(uv.x, 0.02) + step(0.98, uv.x) + step(uv.y, 0.02) + step(0.98, uv.y), 1.0);
  float corners = 0.0;
  corners = max(corners, 1.0 - smoothstep(0.03, 0.05, distance(uv, vec2(0.0))));
  corners = max(corners, 1.0 - smoothstep(0.03, 0.05, distance(uv, vec2(1.0, 0.0))));
  corners = max(corners, 1.0 - smoothstep(0.03, 0.05, distance(uv, vec2(1.0))));
  corners = max(corners, 1.0 - smoothstep(0.03, 0.05, distance(uv, vec2(0.0, 1.0))));
  vec3 base = vec3(checker);
  base = mix(base, vec3(0.85, 0.9, 1.0), grid * 0.85);
  base = mix(base, vec3(1.0, 0.35, 0.2), border);
  base = mix(base, vec3(0.2, 1.0, 0.55), corners);
  base *= 0.92 + 0.08 * sin(u_time * 2.0);
  return base;
}

vec3 effectSolidPulse(vec2 uv) {
  float amount = u_params.x;
  float spd = u_speed * (0.6 + 0.8 * u_audio);
  float wave = 0.5 + 0.5 * sin(u_time * spd * 3.14159 * 2.0);
  float mixAmt = mix(0.15, 1.0, wave) * mix(1.0, 1.0 + amount, u_audio);
  return mix(u_color1, u_color2, mixAmt * amount + (1.0 - amount) * 0.5) * (0.55 + 0.45 * wave);
}

vec3 effectGradientSweep(vec2 uv) {
  float angle = radians(u_params.x);
  float width = max(u_params.y, 0.05);
  vec2 dir = vec2(cos(angle), sin(angle));
  float t = dot(uv - 0.5, dir) + 0.5;
  float spd = u_speed * (0.5 + u_audio);
  float phase = fract(t - u_time * spd * 0.35);
  float band = smoothstep(0.0, width, phase) * (1.0 - smoothstep(1.0 - width, 1.0, phase));
  return mix(u_color1, u_color2, band);
}

vec3 effectScrollingBars(vec2 uv) {
  float orient = u_params.x;
  float density = max(u_params.y, 1.0);
  float spd = u_speed * (0.4 + 0.9 * u_audio);
  float coord = mix(uv.y, uv.x, step(0.5, orient));
  float stripe = fract(coord * density - u_time * spd);
  float bar = step(0.5, stripe);
  return mix(u_color1, u_color2, bar);
}

vec3 effectPlasma(vec2 uv) {
  float sc = u_params.x;
  float t = u_time * u_speed * (0.5 + u_audio);
  vec2 p = (uv - 0.5) * sc;
  float n = 0.0;
  n += vnoise(p + t);
  n += 0.5 * vnoise(p * 2.0 - t * 1.3);
  n += 0.25 * vnoise(p * 4.0 + t * 0.7);
  n = n / 1.75;
  return mix(u_color1, u_color2, clamp(n, 0.0, 1.0));
}

vec3 effectRings(vec2 uv) {
  float spacing = max(u_params.x, 0.02);
  float thickness = max(u_params.y, 0.005);
  float d = distance(uv, vec2(0.5));
  float spd = u_speed * (0.5 + u_audio);
  float wave = abs(fract(d / spacing - u_time * spd) - 0.5);
  float ring = 1.0 - smoothstep(0.0, thickness, wave);
  return mix(u_color1 * 0.15, u_color2, ring);
}

vec3 effectStrobe(vec2 uv) {
  float hz = u_params.x;
  float uncapped = u_params.y;
  float capped = uncapped > 0.5 ? hz : min(hz, 3.0);
  float spd = capped * (0.7 + 0.6 * u_audio) * max(u_speed, 0.05);
  float flash = step(0.5, fract(u_time * spd));
  return mix(u_color1 * 0.05, u_color2, flash);
}

vec3 effectSparkle(vec2 uv) {
  float density = max(u_params.x, 1.0);
  float sz = max(u_params.y, 0.001);
  float cells = sqrt(density);
  vec2 gv = uv * cells;
  vec2 id = floor(gv);
  vec2 f = fract(gv);
  float n = hash21(id);
  vec2 sparkPos = vec2(hash21(id + 17.1), hash21(id + 91.7));
  float twinkle = 0.5 + 0.5 * sin(u_time * u_speed * (4.0 + n * 8.0) + n * 20.0);
  twinkle *= 0.5 + 0.5 * u_audio + 0.35;
  float d = distance(f, sparkPos);
  float star = 1.0 - smoothstep(0.0, sz * cells, d);
  star *= step(0.55, n) * twinkle;
  vec3 bg = u_color1 * 0.08;
  return mix(bg, u_color2, clamp(star, 0.0, 1.0));
}

vec3 effectSpectrum(vec2 uv) {
  float bars = max(u_params.x, 4.0);
  float idx = floor(uv.x * bars) / bars;
  // Spectrum texture + a synthetic fallback so the effect works before mic input
  float sampled = texture(u_spectrum, vec2(idx + 0.5 / 256.0, 0.5)).r;
  float synth = 0.25 + 0.75 * abs(sin(idx * 18.0 + u_time * u_speed * 3.0)) * (0.4 + 0.6 * u_audio);
  float level = max(sampled, synth * step(sampled, 0.02));
  level = mix(level, level * (0.5 + u_audio), 0.5);
  float bar = step(1.0 - level, uv.y);
  float gap = step(0.08, fract(uv.x * bars));
  return mix(u_color1 * 0.1, u_color2, bar * gap);
}

vec2 mapMediaUv(vec2 uv) {
  if (u_fitMode == 2) return uv; // stretch
  float mediaAspect = max(u_mediaSize.x, 1.0) / max(u_mediaSize.y, 1.0);
  vec2 img = vec2(mediaAspect, 1.0);
  vec2 plane = vec2(1.0);
  vec2 s = plane / img;
  float scale = u_fitMode == 0 ? max(s.x, s.y) : min(s.x, s.y);
  vec2 scaled = img * scale;
  vec2 offset = (plane - scaled) * 0.5;
  return (uv * plane - offset) / scaled;
}

vec4 sampleMedia(vec2 uv) {
  vec2 coord = mapMediaUv(uv);
  if (u_fitMode == 1 && (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0)) {
    return vec4(0.0);
  }
  coord = clamp(coord, 0.0, 1.0);
  // Flip Y: video/image textures are top-down in browser uploads with UNPACK_FLIP_Y
  return texture(u_media, coord);
}

vec3 missingMedia(vec2 uv) {
  float stripe = step(0.5, fract((uv.x + uv.y) * 8.0));
  return mix(vec3(0.35, 0.08, 0.2), vec3(0.15, 0.05, 0.1), stripe);
}

vec3 shade(vec2 uv) {
  if (u_effectId == 0) return testPattern(uv);
  if (u_effectId == 9) return vec3(1.0);
  if (u_effectId == 10) return u_color1;
  if (u_effectId == 12) return missingMedia(uv);
  if (u_effectId == 1) return effectSolidPulse(uv);
  if (u_effectId == 2) return effectGradientSweep(uv);
  if (u_effectId == 3) return effectScrollingBars(uv);
  if (u_effectId == 4) return effectPlasma(uv);
  if (u_effectId == 5) return effectRings(uv);
  if (u_effectId == 6) return effectStrobe(uv);
  if (u_effectId == 7) return effectSparkle(uv);
  if (u_effectId == 8) return effectSpectrum(uv);
  return testPattern(uv);
}

float featherMask(vec2 uv) {
  float soft = max(u_feather, 0.0);
  if (soft < 1e-6) return 1.0;
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  return smoothstep(0.0, soft, edge);
}

vec3 rgb2hsv(vec3 c) {
  float cMax = max(c.r, max(c.g, c.b));
  float cMin = min(c.r, min(c.g, c.b));
  float d = cMax - cMin;
  float h = 0.0;
  if (d > 1e-5) {
    if (cMax == c.r) h = mod((c.g - c.b) / d, 6.0);
    else if (cMax == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  float s = cMax < 1e-5 ? 0.0 : d / cMax;
  return vec3(h, s, cMax);
}

vec3 hsv2rgb(vec3 c) {
  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return c.z * mix(vec3(1.0), rgb, c.y);
}

vec3 shiftHue(vec3 color, float degrees) {
  if (abs(degrees) < 0.01) return color;
  vec3 hsv = rgb2hsv(color);
  hsv.x = fract(hsv.x + degrees / 360.0);
  return hsv2rgb(hsv);
}

void main() {
  vec3 uvh = u_Hinv * vec3(v_pos, 1.0);
  if (abs(uvh.z) < 1e-6) discard;
  vec2 uv = uvh.xy / uvh.z;
  if (uv.x < -0.001 || uv.x > 1.001 || uv.y < -0.001 || uv.y > 1.001) discard;
  uv = clamp(uv, 0.0, 1.0);

  // Audio scale target: zoom UVs about center
  float sc = max(u_uvScale, 0.05);
  vec2 scaledUv = (uv - 0.5) / sc + 0.5;
  if (scaledUv.x < 0.0 || scaledUv.x > 1.0 || scaledUv.y < 0.0 || scaledUv.y > 1.0) discard;

  vec4 color;
  if (u_effectId == 11) {
    color = sampleMedia(scaledUv);
  } else {
    color = vec4(shade(scaledUv), 1.0);
  }
  color.rgb = shiftHue(color.rgb, u_hueShift);

  float alpha = color.a * u_opacity * featherMask(uv);
  if (alpha < 0.001) discard;
  outColor = vec4(color.rgb, alpha);
}
`;
