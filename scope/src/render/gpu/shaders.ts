/** Shared uniform: camera and canvas. 8 floats. */
export const VIEW_UNIFORM_BYTES = 32;

const COMMON = /* wgsl */ `
struct View {
  center: vec2f,
  pxPerNm: f32,
  dpr: f32,
  size: vec2f,
  _pad: vec2f,
};
@group(0) @binding(0) var<uniform> u: View;

// World NM plus a CSS-pixel offset to device pixels, y down.
fn toDevice(world: vec2f, px: vec2f) -> vec2f {
  let cssCenter = u.size / (2.0 * u.dpr);
  let css = vec2f(
    cssCenter.x + (world.x - u.center.x) * u.pxPerNm,
    cssCenter.y - (world.y - u.center.y) * u.pxPerNm,
  ) + px;
  return css * u.dpr;
}

fn toClip(dev: vec2f) -> vec4f {
  return vec4f(dev.x / u.size.x * 2.0 - 1.0, 1.0 - dev.y / u.size.y * 2.0, 0.0, 1.0);
}

// Unit quad corner for vertex index 0..5, in [0,1]^2.
fn corner(i: u32) -> vec2f {
  switch i {
    case 0u: { return vec2f(0.0, 0.0); }
    case 1u: { return vec2f(1.0, 0.0); }
    case 2u: { return vec2f(0.0, 1.0); }
    case 3u: { return vec2f(0.0, 1.0); }
    case 4u: { return vec2f(1.0, 0.0); }
    default: { return vec2f(1.0, 1.0); }
  }
}
`;

export const LINE_SHADER = /* wgsl */ `
${COMMON}
struct In {
  @location(0) a: vec4f,      // world.xy, px.xy
  @location(1) b: vec4f,
  @location(2) style: vec3f,  // width, dashOn, dashOff (CSS px)
  @location(3) color: vec4f,
};
struct Out {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
  @location(1) dist: f32,
  @location(2) dash: vec2f,
};
@vertex fn vs(@builtin(vertex_index) vi: u32, in: In) -> Out {
  let pa = toDevice(in.a.xy, in.a.zw);
  let pb = toDevice(in.b.xy, in.b.zw);
  let d = pb - pa;
  let len = max(length(d), 0.0001);
  let dir = d / len;
  let n = vec2f(-dir.y, dir.x);
  let c = corner(vi);
  let half = in.style.x * u.dpr * 0.5;
  let p = pa + dir * (c.x * len) + n * ((c.y * 2.0 - 1.0) * half);
  var o: Out;
  o.pos = toClip(p);
  o.color = in.color;
  o.dist = c.x * len;
  o.dash = in.style.yz * u.dpr;
  return o;
}
@fragment fn fs(in: Out) -> @location(0) vec4f {
  if (in.dash.x > 0.0) {
    let period = in.dash.x + in.dash.y;
    if (in.dist - floor(in.dist / period) * period > in.dash.x) { discard; }
  }
  return in.color;
}
`;

export const MARKER_SHADER = /* wgsl */ `
${COMMON}
struct In {
  @location(0) at: vec4f,     // world.xy, px.xy
  @location(1) style: vec2f,  // size (CSS px), shape
  @location(2) color: vec4f,
};
struct Out {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
  @location(1) local: vec2f,  // -1..1 across the shape, y up
  @location(2) @interpolate(flat) shape: u32,
  @location(3) @interpolate(flat) halfPx: f32,
};
const MARGIN = 2.0;
@vertex fn vs(@builtin(vertex_index) vi: u32, in: In) -> Out {
  let center = toDevice(in.at.xy, in.at.zw);
  let half = (in.style.x * 0.5 + MARGIN) * u.dpr;
  let c = corner(vi) * 2.0 - 1.0;
  var o: Out;
  o.pos = toClip(center + c * half);
  o.color = in.color;
  o.local = vec2f(c.x, -c.y) * (half / (in.style.x * 0.5 * u.dpr));
  o.shape = u32(in.style.y);
  o.halfPx = in.style.x * 0.5 * u.dpr;
  return o;
}
// Signed distance in shape units (1 = half size); negative inside.
fn sdSquare(p: vec2f) -> f32 { let d = abs(p) - vec2f(1.0); return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0); }
fn sdDiamond(p: vec2f) -> f32 { return (abs(p.x) + abs(p.y) - 1.0) * 0.7071; }
fn sdCircle(p: vec2f, r: f32) -> f32 { return length(p) - r; }
fn sdTriangle(p: vec2f) -> f32 {
  // Apex up at (0,1), base at y=-0.75.
  let k = 1.7320508;
  let q = vec2f(abs(p.x), 1.0 - p.y);
  let dLeft = (q.x * k - q.y) * 0.5; // edge from apex
  let dBase = -0.75 - p.y;
  return max(dLeft, dBase);
}
fn sdHexagon(p: vec2f) -> f32 {
  let k = vec3f(-0.8660254, 0.5, 0.5773503);
  var q = abs(p);
  q = q - 2.0 * min(dot(k.xy, q), 0.0) * k.xy;
  q = q - vec2f(clamp(q.x, -k.z, k.z), 1.0);
  return length(q) * sign(q.y);
}
@fragment fn fs(in: Out) -> @location(0) vec4f {
  let p = in.local;
  let stroke = 1.0 / in.halfPx * u.dpr * 0.55; // ~1.1 CSS px outline
  var d: f32;
  switch in.shape {
    case 0u: { d = sdSquare(p); }                                   // filled square
    case 1u: {                                                     // small square + ring
      let ring = abs(sdCircle(p, 0.85)) - stroke;
      d = min(sdSquare(p * 2.4), ring);
    }
    case 2u: { d = sdDiamond(p); }                                  // filled diamond
    case 3u: { d = abs(sdDiamond(p)) - stroke; }                    // hollow diamond
    case 4u: { d = abs(sdTriangle(p)) - stroke; }                   // hollow triangle
    case 5u: { d = min(abs(sdHexagon(p)) - stroke, sdSquare(p * 5.0)); } // hexagon + dot
    case 6u: { d = sdCircle(p, 0.35); }                             // dot
    case 7u: { d = abs(sdCircle(p, 0.85)) - stroke; }               // ring
    default: { d = abs(sdSquare(p)) - stroke; }                     // hollow square
  }
  let aa = fwidth(d);
  let alpha = 1.0 - smoothstep(-aa, aa, d);
  if (alpha <= 0.002) { discard; }
  return vec4f(in.color.rgb, in.color.a * alpha);
}
`;

export const TEXT_SHADER = /* wgsl */ `
${COMMON}
@group(1) @binding(0) var atlasSampler: sampler;
@group(1) @binding(1) var atlas: texture_2d<f32>;
struct In {
  @location(0) at: vec4f,     // world.xy, px.xy (quad top-left offset)
  @location(1) size: vec2f,   // CSS px
  @location(2) uv: vec4f,     // u0 v0 u1 v1
  @location(3) color: vec4f,
};
struct Out {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
  @location(1) uv: vec2f,
};
@vertex fn vs(@builtin(vertex_index) vi: u32, in: In) -> Out {
  let c = corner(vi);
  let topLeft = toDevice(in.at.xy, in.at.zw);
  let p = topLeft + c * in.size * u.dpr;
  var o: Out;
  o.pos = toClip(p);
  o.color = in.color;
  o.uv = mix(in.uv.xy, in.uv.zw, c);
  return o;
}
const EDGE = 0.74;
@fragment fn fs(in: Out) -> @location(0) vec4f {
  let s = textureSample(atlas, atlasSampler, in.uv).r;
  let w = clamp(fwidth(s) * 0.8, 0.02, 0.2);
  let alpha = smoothstep(EDGE - w, EDGE + w, s);
  if (alpha <= 0.002) { discard; }
  return vec4f(in.color.rgb, in.color.a * alpha);
}
`;
