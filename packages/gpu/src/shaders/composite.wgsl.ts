// Portions adapted from robinWongM/liquid-glass (Apache-2.0): the lens content warp (lens_map, fsContentLens).
import { SDF_WGSL } from './sdf.wgsl.js';

/**
 * Layer quad: 2D affine transform, opacity, continuous-corner mask, clip rect, dim, capsule cutout, lens warp.
 * Output is premultiplied (blend: one, one-minus-src-alpha).
 */
export const LAYER_WGSL = /* wgsl */ `
struct LayerU {
  m: vec4f,      // a b c d of the 2D affine (CSS px)
  t: vec4f,      // e f, element width/height in CSS px
  p: vec4f,      // opacity, corner radius, dim, hasClip
  clip: vec4f,   // x0 y0 x1 y1 (canvas CSS px)
  canvas: vec4f, // canvas CSS width/height, dpr, premultiplied source (1) or straight (0)
  inv0: vec4f,   // a b c d of the inverse affine
  inv1: vec4f,   // e f of the inverse, lens on, cutout on
  lens0: vec4f,  // lens centre (flexed), unflexed half size
  lens1: vec4f,  // lens flex sx sy, amount, band height
  lens2: vec4f,  // rim band height
  cut: vec4f,    // cutout x0 y0 x1 y1 (canvas CSS px)
};
@group(0) @binding(0) var<uniform> L: LayerU;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) css: vec2f,
};

fn toLocal(css: vec2f) -> vec2f {
  return vec2f(L.inv0.x * css.x + L.inv0.z * css.y + L.inv1.x, L.inv0.y * css.x + L.inv0.w * css.y + L.inv1.y);
}

@vertex fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var corners = array<vec2f, 4>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(1.0, 1.0));
  let uv = corners[vi];
  var local = uv * L.t.zw;
  var css = vec2f(L.m.x * local.x + L.m.z * local.y + L.t.x, L.m.y * local.x + L.m.w * local.y + L.t.y);
  if (L.inv1.z > 0.5) {
    // Lens: only the lens box draws (plus one pt for anti-aliasing).
    let h = L.lens0.zw * L.lens1.xy + vec2f(1.0);
    css = mix(L.lens0.xy - h, L.lens0.xy + h, uv);
    local = toLocal(css);
  }
  var o: VOut;
  o.pos = vec4f(css.x / L.canvas.x * 2.0 - 1.0, 1.0 - css.y / L.canvas.y * 2.0, 0.0, 1.0);
  o.local = local;
  o.css = css;
  return o;
}

${SDF_WGSL}

fn capsule(p: vec2f, half: vec2f) -> f32 { return rrect_sdf(abs(p), half, min(half.x, half.y)); }

// Rim warp of a capsule (p, half in unflexed pt): xy = outward normal · w(depth), z = coverage.
fn lens_map(p: vec2f, half: vec2f, ov: f32, H: f32, fw: f32) -> vec3f {
  let d = capsule(p, half);
  let g = vec2f(capsule(p + vec2f(0.25, 0.0), half), capsule(p + vec2f(0.0, 0.25), half)) - vec2f(d);
  var n = select(vec2f(0.0), normalize(g), length(g) > 1e-6);
  let e = vec2f(p.x, half.x * p.y / half.y);
  if (ov > 0.0 && length(e) > 1e-4) { n = normalize(n + (normalize(e) - n) * ov); }
  let h = -d;
  let B = select(saturate(0.5 + h / fw), 0.0, h < -5.0);
  let t = saturate(h / max(H, 1e-5));
  let w = select(0.0, (1.0 - sqrt(max(0.0, 1.0 - (1.0 - t) * (1.0 - t)))) * saturate(0.5 + (H - h) / fw), H > 0.0);
  return vec3f(n * w, B);
}

@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let size = L.t.zw;
  var at = in.local;
  var lensMask = 1.0;
  if (L.inv1.z > 0.5) {
    let s = L.lens1.xy;
    let fw = 1.0 / (L.canvas.z * min(s.x, s.y));
    let F2 = lens_map((in.css - L.lens0.xy) / s, L.lens0.zw, 0.0, L.lens1.w, fw);
    let P2 = in.css + L.lens1.z * s * F2.xy;
    let F1 = lens_map((P2 - L.lens0.xy) / s, L.lens0.zw, 0.5, L.lens2.x, fw);
    at = toLocal(P2 + L.lens1.z * s * F1.xy);
    let inside = all(at >= vec2f(0.0)) && all(at <= size);
    lensMask = F1.z * F2.z * select(0.0, 1.0, inside);
  }
  var c = textureSample(tex, samp, at / size);
  if (L.canvas.w < 0.5) { c = vec4f(c.rgb * c.a, c.a); }
  var mask = lensMask;
  let r = L.p.y;
  if (r > 0.0) {
    let half = size * 0.5;
    let d = rrect_sdf(abs(in.local - half), half, r);
    let fw = max(fwidth(d), 1e-4);
    mask = mask * saturate(0.5 - d / fw);
  }
  let fwc = 1.0 / L.canvas.z;
  if (L.p.w > 0.5) {
    let cl = L.clip;
    let mx = saturate((in.css.x - cl.x) / fwc + 0.5) * saturate((cl.z - in.css.x) / fwc + 0.5);
    let my = saturate((in.css.y - cl.y) / fwc + 0.5) * saturate((cl.w - in.css.y) / fwc + 0.5);
    mask = mask * mx * my;
  }
  if (L.inv1.w > 0.5) {
    let ch = 0.5 * (L.cut.zw - L.cut.xy);
    mask = mask * saturate(0.5 + capsule(in.css - L.cut.xy - ch, ch) / fwc);
  }
  let k = mask * L.p.x;
  return vec4f(c.rgb * (1.0 - L.p.z) * k, c.a * k);
}
`;

/** Fullscreen-triangle 1:1 copy (full-resolution scene for lifted lenses). */
export const COPY_WGSL = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
struct VOut { @builtin(position) pos: vec4f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var q = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VOut;
  o.pos = vec4f(q[vi], 0.0, 1.0);
  return o;
}
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  return textureLoad(src, vec2i(in.pos.xy), 0);
}
`;

/** Fullscreen-triangle downsample: 4 bilinear taps at ±1 source texel ≈ 4×4 tent. Builds the backdrop mip chain. */
export const DOWNSAMPLE_WGSL = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var q = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VOut;
  o.pos = vec4f(q[vi], 0.0, 1.0);
  o.uv = q[vi] * vec2f(0.5, -0.5) + vec2f(0.5);
  return o;
}
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(src, 0));
  let o = ts;
  return 0.25 * (textureSampleLevel(src, samp, in.uv + vec2f(-o.x, -o.y), 0.0)
               + textureSampleLevel(src, samp, in.uv + vec2f( o.x, -o.y), 0.0)
               + textureSampleLevel(src, samp, in.uv + vec2f(-o.x,  o.y), 0.0)
               + textureSampleLevel(src, samp, in.uv + vec2f( o.x,  o.y), 0.0));
}
`;
