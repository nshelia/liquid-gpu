import { SDF_WGSL } from './sdf.wgsl.js';

/** Maximum shapes per glass group (one uniform array). */
export const MAX_SHAPES = 8;

/**
 * Liquid Glass group shader.
 *
 * Citations: [GR] = uikit-internals/deep/glass-render/findings.md, [LG] = uikit-internals/findings/liquid-glass.md,
 * [GD] = uikit-internals/deep/glass-drag/findings.md. Section numbers refer to those files.
 *
 * Pipeline per pixel (all lengths in pt = CSS px):
 *   1. SDF of every shape (continuous corners, flex transform applied), fused with the normal-aware smooth-min
 *      union, k = group spacing [GR §2]. Per-shape attributes (size d, press, tint) are blended with the same h.
 *   2. glassBackground [GR §3]: inner refraction (quarter-circle profile), distance-dependent mip blur, 2-tap
 *      blur fill with lighten/darken, outer 1 pt refraction band, luma compression + YCbCr face matrix, edge
 *      bleed, in-filter key/fill highlight band, clamp.
 *   3. Chromatic aberration (7 taps) only while pressed [GR §3 "Chromatic aberration"].
 *   4. Tint layer: out = o·(1 − Y) + tint·Y inside the shape inset by 1.6 px [GR §4, LG §4].
 *   5. Separate key/fill rim layer through the rim vibrantColorMatrix [GR §3 "Separate rim layer", LG §5].
 *   6. Flex glows: BigGlow (full shape) and LittleGlow (blurred disc at the touch) [LG §9, GD §7].
 *   7. Outside the shape: normal-CDF drop shadow and ring shadow [GR §3 "Shadow", "Ring shadow"].
 */
export const GLASS_WGSL = /* wgsl */ `
struct GroupU {
  canvas: vec4f,  // canvas CSS w, h, dpr, backdrop scale (0.5)
  cfg: vec4f,     // style (0 regular, 1 clear, 2 lens), scheme (0 light, 1 dark), spacing k, shape count
  blur: vec4f,    // blurRadius, blurFillRadius, blurFillNormal, blurFillLighten
  misc: vec4f,    // blurFillDarken, refractionOpacity, clampLimit, bleedDarken
  face0: vec4f, face1: vec4f, face2: vec4f,
  bleed0: vec4f, bleed1: vec4f, bleed2: vec4f,
  shadow: vec4f,  // shadow fill alpha, ringOpacity, ringBlur, ringStroke
  ring: vec4f,    // ringOffset, ringMask, hlAmount, hlHeight
  hl: vec4f,      // hlOffset, hlBias, cos(hlSpread), faceOpacity
  rim: vec4f,     // cos(rimSpread), rimAmount, rimHeight, rimCurvature
  vib0: vec4f, vib1: vec4f, vib2: vec4f,
  tex: vec4f,     // backdrop level-0 size (texels), mip count, refraction sign K
  lens0: vec4f, lens1: vec4f, lens2: vec4f,
  bounds: vec4f,  // quad bounds x0 y0 x1 y1 (CSS px)
};
struct Shape {
  a: vec4f,     // centre x, y, half w, half h (unflexed)
  b: vec4f,     // radius, sx, sy, pressAmount
  c: vec4f,     // tx, ty, glow x, glow y (canvas CSS px)
  d: vec4f,     // glow opacity, glow scale, interactive, d = min(w, h)
  tint: vec4f,  // tint rgb (straight), alpha (0 = none)
  glow: vec4f,  // bigGlow opacity, littleGlow opacity, littleGlow size, tint-shadow factor o/tint
  e: vec4f,     // opacity (0…1, multiplies the glass result and its shadows), bottom radius (< 0: same), aberration multiplier, lens inner refraction (< 0: default)
};
@group(0) @binding(0) var<uniform> G: GroupU;
@group(0) @binding(1) var<uniform> S: array<Shape, ${MAX_SHAPES}>;
@group(0) @binding(2) var backdrop: texture_2d<f32>;
// Full-resolution scene for lifted lenses (their interior is unblurred on device).
@group(0) @binding(4) var sharp: texture_2d<f32>;
var<private> useSharp: bool;
@group(0) @binding(3) var samp: sampler;

struct VOut { @builtin(position) pos: vec4f, @location(0) css: vec2f };

@vertex fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var corners = array<vec2f, 4>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(1.0, 1.0));
  let b = G.bounds;
  let css = mix(b.xy, b.zw, corners[vi]);
  var o: VOut;
  o.pos = vec4f(css.x / G.canvas.x * 2.0 - 1.0, 1.0 - css.y / G.canvas.y * 2.0, 0.0, 1.0);
  o.css = css;
  return o;
}

${SDF_WGSL}

const LUMA = vec3f(0.2126, 0.7152, 0.0722); // Rec.709 [GR §3, LG §6]

// Quarter-circle profile prof(x) = sqrt(x·(2 − x)) = sqrt(1 − (1 − x)²) [GR §3 notation].
fn prof(x: f32) -> f32 { return sqrt(max(x * (2.0 - x), 0.0)); }

// erf approximation (Abramowitz–Stegun 7.1.26). [GR §3]: the shader's Φ is an odd half-precision polynomial.
fn erf_(x: f32) -> f32 {
  let s = sign(x);
  let a = abs(x);
  let t = 1.0 / (1.0 + 0.3275911 * a);
  let y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-a * a);
  return s * y;
}
// Normal CDF of x·0.7071/R, i.e. Φ evaluated as in [GR §3 "Shadow"]: 0.5·(1 + erf(x·0.7071/R)).
fn ncdf(x: f32, R: f32) -> f32 { return 0.5 * (1.0 + erf_(x * 0.70710678 / max(R, 1e-3))); }

fn cm(c: vec3f, r0: vec4f, r1: vec4f, r2: vec4f) -> vec3f {
  return vec3f(dot(r0.xyz, c) + r0.w, dot(r1.xyz, c) + r1.w, dot(r2.xyz, c) + r2.w);
}

struct Field { d: f32, n: vec2f, size: f32, press: f32, tint: vec4f, tintO: f32, idx: f32, opacity: f32, ab: f32, inner: f32 };

fn shape_dist(p: vec2f, i: u32) -> f32 {
  let s = S[i];
  let centre = s.a.xy + s.c.xy;            // flex translation (m41/m42) [GD §4]
  let half = s.a.zw * s.b.yz;              // flex scale about the centre [GD §4]
  let k = min(s.b.y, s.b.z);
  let r = select(s.b.x, s.e.y, s.e.y >= 0.0 && p.y > centre.y) * k;
  return rrect_sdf(abs(p - centre), half, r);
}

// Normal-aware smooth-min union [GR §2 "Kernel"]:
//   k' = k·saturate(0.5 − 0.5·dot(n1,n2)); h = saturate(0.5 + 0.5·(d2 − d1)/k')
//   d = mix(d2, d1, h) − k'·h·(1 − h); n = mix(n2, n1, h) (not renormalised).
// Empty destination = distance 10000, no normal. k = max(spacing, 1e-4) [GR §2 "Where k comes from"].
fn field(p: vec2f) -> Field {
  var f: Field;
  f.d = 10000.0;
  f.n = vec2f(0.0);
  f.size = 0.0; f.press = 0.0; f.tint = vec4f(0.0); f.tintO = 0.0; f.idx = 0.0; f.opacity = 0.0;
  let count = u32(G.cfg.w);
  let k = max(G.cfg.z, 1e-4);
  let e = 0.25;
  for (var i = 0u; i < count; i = i + 1u) {
    let d1 = shape_dist(p, i);
    // Edge normal (out of the shape) by forward differences of the shape's own SDF.
    let gx = shape_dist(p + vec2f(e, 0.0), i) - d1;
    let gy = shape_dist(p + vec2f(0.0, e), i) - d1;
    var n1 = vec2f(gx, gy);
    let ln = length(n1);
    n1 = select(vec2f(0.0, -1.0), n1 / ln, ln > 1e-6);
    let s = S[i];
    if (i == 0u) {
      f.d = d1; f.n = n1; f.size = s.d.w; f.press = s.b.w; f.tint = s.tint; f.tintO = s.glow.w; f.idx = 0.0; f.opacity = s.e.x; f.ab = s.e.z; f.inner = s.e.w;
      continue;
    }
    let kk = k * saturate(0.5 - 0.5 * dot(n1, f.n));
    var h: f32;
    if (kk < 1e-3) { h = select(0.0, 1.0, d1 < f.d); } else { h = saturate(0.5 + 0.5 * (f.d - d1) / kk); }
    f.d = mix(f.d, d1, h) - kk * h * (1.0 - h);
    f.n = mix(f.n, n1, h);
    f.size = mix(f.size, s.d.w, h);
    f.press = mix(f.press, s.b.w, h);
    f.tint = mix(f.tint, s.tint, h);
    f.tintO = mix(f.tintO, s.glow.w, h);
    f.idx = mix(f.idx, f32(i), h);
    f.opacity = mix(f.opacity, s.e.x, h);
    f.ab = mix(f.ab, s.e.z, h);
    f.inner = mix(f.inner, s.e.w, h);
  }
  return f;
}

struct SizeP { t: f32, inA: f32, inH: f32, outA: f32, outH: f32, bleedA: f32, bleedR: f32, bleedO: f32,
               blurD0: f32, blurO0: f32, blurO1: f32, shR: f32, shO: f32, maxLuma: f32 };

// Size-dependent inputs [LG §3]: d = min(w,h), t = clamp((d − 64)/96, 0, 1). Mirrors sizeParams() in glass-params.ts.
fn size_params(d: f32) -> SizeP {
  var s: SizeP;
  let t = saturate((d - 64.0) / 96.0);
  let dark = G.cfg.y > 0.5;
  s.t = t;
  let style = i32(G.cfg.x + 0.5);
  if (style == 1) { // clear
    s.inA = -min(0.65 * d, 60.0); s.inH = min(0.36 * d, 20.0);
    s.outA = d / 5.0; s.outH = d / 8.0;
    s.bleedA = 0.0; s.bleedR = 0.0; s.bleedO = 0.0;
    s.blurD0 = -d / 2.0; s.blurO0 = 1.0; s.blurO1 = 0.5;
    s.shR = 0.0; s.shO = 0.0; s.maxLuma = 1.0;
  } else if (style == 2) { // lifted lens [LG §10]; refraction scales with lifted height / 70
    s.inA = -10.5 * d / 70.0; s.inH = 7.0 * d / 70.0; s.outA = 0.0; s.outH = 1.0;
    s.bleedA = 0.0; s.bleedR = 0.0; s.bleedO = 0.0;
    s.blurD0 = -10.0; s.blurO0 = 0.0; s.blurO1 = 0.0;
    s.shR = 8.0; s.shO = 0.001; s.maxLuma = 1.0;
  } else { // regular
    s.inA = -min(d / 2.0, 60.0);            // InnerRefractionAmount −min(d/2, 60)
    s.inH = min(d / 4.0, 20.0);             // InnerRefractionHeight min(d/4, 20)
    s.outA = max(16.0, d / 4.0);            // OuterRefractionAmount max(16, d/4)
    s.outH = max(16.0, d / 5.0);            // OuterRefractionHeight max(16, d/5)
    s.bleedA = 0.35 * d;                    // BleedAmount = BleedHeight = 0.35·d
    s.bleedR = select(0.0, 0.35 * d, t > 0.0); // BleedBlurRadius 0.35·d if t > 0
    s.bleedO = select(0.5, 0.8, dark) * t;  // BleedOpacity 0.5·t (dark 0.8·t)
    s.blurD0 = -d / 2.0;                    // BlurDistance0 −d/2
    s.blurO0 = 0.8 * t; s.blurO1 = 0.4 * t; // BlurOpacity0/1 0.8·t / 0.4·t
    s.shR = 4.0 + 20.0 * t;                 // ShadowRadius 4 + 20·t
    s.shO = select(0.04 + 0.36 * t, 0.04 + 0.56 * t, dark); // ShadowOpacity
    s.maxLuma = select(0.94, max(0.35, 0.6 - 0.6 * t), dark); // FaceColorMatrixMaxLuma(SDR)
  }
  return s;
}

// Backdrop sampling. Radius r is in pt; the backdrop is the scene at half resolution [LG §2 "scale = 0.5"],
// so one level-0 texel is 1/(dpr·0.5) pt. lod = max(0, log2(r < 2 ? r/2 + 1 : r)) [GR §3 "Blur"], r in texels.
fn lod_for(rPt: f32) -> f32 {
  let r = rPt * G.canvas.z * G.canvas.w;
  if (r <= 0.0) { return 0.0; }
  return max(0.0, log2(select(r, r * 0.5 + 1.0, r < 2.0)));
}
// "Each tap is a 4-sample box at the blur level" [GR §3 aberration]; used for every blurred read.
fn tap(uv: vec2f, lod: f32) -> vec3f {
  if (lod < 0.25) {
    if (useSharp) { return textureSampleLevel(sharp, samp, uv, 0.0).rgb; }
    return textureSampleLevel(backdrop, samp, uv, lod).rgb;
  }
  let o = 0.5 * exp2(lod) / G.tex.xy;
  return 0.25 * (textureSampleLevel(backdrop, samp, uv + vec2f(-o.x, -o.y), lod).rgb
               + textureSampleLevel(backdrop, samp, uv + vec2f( o.x, -o.y), lod).rgb
               + textureSampleLevel(backdrop, samp, uv + vec2f(-o.x,  o.y), lod).rgb
               + textureSampleLevel(backdrop, samp, uv + vec2f( o.x,  o.y), lod).rgb);
}

// displacement_mat M: turns a normal in pt into a uv offset [GR §3 notation]. Its assembly is open [GR §6.2];
// we use M = K·I/canvasSize with K = G.tex.w (−1), so the dominant inner term (negative amount) pulls content
// from beyond the edge into the rim, which is how the glass reads on device (convex-lens look).
fn disp(n: vec2f, amount: f32) -> vec2f { return G.tex.w * amount * n / G.canvas.xy; }

// Band used by the key/fill highlight [GR §3 "Separate rim layer"]:
// band = mix(depth < height ? 1 : 0, 1 − saturate(depth/height), curvature) · aa(depth) · aa(height − depth)
fn rim_band(depth: f32, height: f32, curvature: f32, fw: f32) -> f32 {
  let hard = select(0.0, 1.0, depth < height);
  let soft = 1.0 - saturate(depth / max(height, 1e-4));
  let aa0 = saturate(depth / fw + 0.5);
  let aa1 = saturate((height - depth) / fw + 0.5);
  return mix(hard, soft, curvature) * aa0 * aa1;
}
fn lobe(n: vec2f, angle: f32, cosSpread: f32) -> f32 {
  let L = vec2f(cos(angle), sin(angle));
  return saturate((dot(L, n) - cosSpread) / (1.0 - cosSpread));
}
fn knee(g: f32, amount: f32) -> f32 { return g / (1.0 + amount * (1.0 - g)); }
// glassBackground highlight band H [GR §3 "Rim highlight"]: depth = −(d + effectOffset), two opposite lobes along Lh.
// With effectOffset −0.5333 the band is the 0.5333 pt just OUTSIDE the shape: on device the light-mode outline sits
// at x 19.33…20.0 of a glass frame starting at 20 (demo-audit/chat raw/composed-light.png), luma 176 at the sides
// (white·(1 − 0.3·H), H ≈ 1) and 230 at the top (H ≈ 0.33 from the 106° lobe), which this reproduces.
// Measured: it acts along the horizontal normal; the (cos, sin)(angle) packing is in the SDF's own (swapped) axes.
// The lens style keeps its band inside (−(d − offset)): not re-measured against device.
// Profile fitted to those device pixels (3x): strongest against the shape, fading outward over 0.6667 pt with
// curvature 0.5, i.e. distance d outside the shape with height |offset| + 0.1333. TODO(unknown): exact band inputs.
fn hl_amount(D: f32, N: vec2f, fw: f32, lens: bool) -> f32 {
  var band: f32;
  if (lens) { band = rim_band(-(D - G.hl.x), G.ring.w, 0.75, fw); }
  else { band = rim_band(D, -G.hl.x + 0.1333, 0.5, fw); }
  let Lh = vec2f(1.0, 0.0);
  let cs = G.hl.z;
  let gp = saturate((dot(Lh, N) - cs) / (1.0 - cs)) * band;
  let gm = saturate((-dot(Lh, N) - cs) / (1.0 - cs)) * band;
  return saturate(knee(gp, G.ring.z) + knee(gm, G.ring.z));
}

@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let p = in.css;
  let F = field(p);
  let D = F.d;
  let N = F.n;
  let fw = 1.0 / G.canvas.z;                  // one device pixel in pt
  let cov = saturate(0.5 - D / fw);
  var sp = size_params(F.size);
  let style = i32(G.cfg.x + 0.5);
  let dark = G.cfg.y > 0.5;
  let uv = p / G.canvas.xy;

  // ---- Outside: drop shadow + ring shadow -----------------------------------------------------------------
  // Shadow [GR §3 "Shadow"; LG §2/§3]: offset (0, 8), radius 4 + 20t, opacity 0.04 + 0.36t (dark 0.04 + 0.56t).
  // shadow_cm = black 0 / white 1 / sat 1 with fill rgba(0,0,0,0.3) → (1 − 0.3)·c, mixed by opacity·Φ:
  // equivalent to black at alpha 0.3·opacity·Φ over the backdrop.
  var shadowA = 0.0;
  if (cov < 1.0) {
    let Fs = field(p - vec2f(0.0, 8.0));
    let ds = Fs.d;
    let shape_sh = 1.0 - ncdf(ds, sp.shR);
    // Shape opacity fades the shadow with the glass (shadows read the opacity of the shape casting them).
    shadowA = G.shadow.x * sp.shO * shape_sh * Fs.opacity;
    // Ring shadow [GR §3]: Φ(r·0.7071/R) − Φ((r + stroke)·0.7071/R) · ring_opacity · mix(1, coverage, mask),
    // on a field offset by ring_shadow_offset (8). We read the offset as a (0, 8) shift like the drop shadow and
    // the mask as confinement to the glass coverage (no ring pixels outside the shape on device).
    let Fr = field(p - vec2f(0.0, G.ring.x));
    let dr = Fr.d;
    let ring = (1.0 - ncdf(dr - G.shadow.w, G.shadow.z)) - (1.0 - ncdf(dr, G.shadow.z));
    let ringA = G.shadow.y * max(ring, 0.0) * mix(1.0, cov, G.ring.y) * Fr.opacity;
    shadowA = saturate(shadowA + ringA);
    if (style == 2) { shadowA = shadowA * F.press; }
  }
  // The highlight band outside the shape: c·(1 + bias·H·(3 − 2c)) on the backdrop, i.e. black at
  // −bias·H·(3 − 2Y) (exact for grey backdrops), under the glass coverage like the shadow.
  if (cov < 1.0 && style != 2) {
    let Ho = hl_amount(D, N, fw, false);
    if (Ho > 0.0) {
      let Yb = saturate(dot(LUMA, textureSampleLevel(backdrop, samp, uv, 0.0).rgb));
      let darkA = saturate(-G.hl.y * Ho * (3.0 - 2.0 * Yb)) * saturate(F.opacity);
      shadowA = 1.0 - (1.0 - shadowA) * (1.0 - darkA);
    }
  }
  if (cov <= 0.0) {
    if (shadowA <= 0.0) { discard; }
    return vec4f(0.0, 0.0, 0.0, shadowA);
  }

  var c: vec3f;
  let pressAmt = F.press;
  useSharp = style == 2 && pressAmt > 0.001;

  // ---- glassBackground [GR §3] -----------------------------------------------------------------------------
  // Inner refraction: x = saturate(−d·inner_inv_height); off = A·(1 − prof(x)); uv₁ = uv + off·(M·n).
  if (style == 2 && F.inner > 0.0) { sp.inA = -F.inner; sp.inH = 0.6 * F.inner; }
  let xIn = saturate(-D / max(sp.inH, 1e-3));
  let off = sp.inA * (1.0 - prof(xIn));
  let uv1 = uv + disp(N, off);

  // Blur radius over distance [GR §3 "Blur"]: d′ = off + d; tᵢ = saturate((d′ − distᵢ)/(distᵢ₊₁ − distᵢ));
  // r = (α₀ − α₁t₀ − α₂t₁ − α₃t₂)·blur_radius with dist = (−d/2, −1, 0, 0).
  // TODO(unknown): how BlurOpacity (0.8t, 0.4t, 0.5, 1) becomes α is open [GR §3, §6.2]. We take α₀ = 1 and
  // α₁ = BlurOpacity1, α₂ = 0.5 − BlurOpacity1 (so the radius halves over the last pt), α₃ = 0.5; plus the
  // centre bonus α₀ += BlurOpacity0 for large shapes. Visually: full blur inside, sharper toward the rim.
  let dP = off + D;
  let t0 = saturate((dP - sp.blurD0) / max(-1.0 - sp.blurD0, 1e-3));
  let t1 = saturate((dP + 1.0) / 1.0);
  let t2 = select(0.0, 1.0, dP >= 0.0);
  let a0 = 1.0 + sp.blurO0;
  let r = max(0.0, (a0 - sp.blurO0 * t0 - sp.blurO1 * t0 - (0.5 - sp.blurO1) * t1 - 0.5 * t2)) * G.blur.x;
  let lod = lod_for(r);

  // Chromatic aberration only while pressed [LG §10 glassForeground]: amount 3.684 pt at −15°, fading from the edge
  // to EdgeStart −14 inside (both × lifted height / 70), so the interior stays clear.
  // 7 taps: R from +D·{1,⅔,⅓} weights {1,⅔,⅓}; B from −D·{0,⅓,⅔,1} weights {0,⅓,⅔,1}; G complementary;
  // normalised R·½, G·⅓, B·½.
  var base: vec3f;
  if (pressAmt > 0.001) {
    let ang = -0.2618;
    let rn = vec2f(cos(ang) * N.x - sin(ang) * N.y, sin(ang) * N.x + cos(ang) * N.y);
    let isLens = style == 2;
    let k = select(1.0, F.size / 70.0, isLens);
    let within = select(select(0.0, 1.0, -D < 38.9), saturate(1.0 + D / (14.0 * k)), isLens);
    let Dab = disp(rn, -3.684 * k * within * pressAmt * select(1.0, F.ab, isLens)); // same sign convention as the refraction offsets
    var acc = vec3f(0.0);
    for (var j = 1; j <= 3; j = j + 1) {
      let w = f32(j) / 3.0;
      let sR = tap(uv1 + Dab * w, lod);
      acc.r += sR.r * w;
      acc.g += sR.g * (1.0 - w);
    }
    for (var j = 0; j <= 3; j = j + 1) {
      let w = f32(j) / 3.0;
      let sB = tap(uv1 - Dab * w, lod);
      acc.b += sB.b * w;
      acc.g += sB.g * (1.0 - w);
    }
    base = vec3f(acc.r * 0.5, acc.g / 3.0, acc.b * 0.5);
  } else {
    base = tap(uv1, lod);
  }
  c = base;

  // Blur fill (most of the visible frost) [GR §3]: fill = ½·(tex(uv + L·k) + tex(uv − L·k)) at L = lod(8);
  // c = (1 − dk − lt)·c + dk·min(c, fill) + lt·max(c, fill); c = mix(c, fill, normal).
  // Light: lighten 0.9, normal 0.5. Dark: darken 0.9 [LG §2].
  if (G.blur.y > 0.0) {
    let lf = lod_for(G.blur.y);
    let ko = vec2f(0.25 * exp2(lf)) / G.tex.xy;
    let fill = 0.5 * (tap(uv1 + ko, lf) + tap(uv1 - ko, lf));
    let dk = G.misc.x;
    let lt = G.blur.w;
    c = (1.0 - dk - lt) * c + dk * min(c, fill) + lt * max(c, fill);
    c = mix(c, fill, G.blur.z);
  }

  // Outer refraction [GR §3]: second sample at uv + A_out·(1 − prof(saturate(−d·outer_inv_height)))·(M·n),
  // weight refraction_opacity·saturate((d − thr₀)/(thr₁ − thr₀)) with thresholds −1, 0: the last 1 pt.
  if (G.misc.y > 0.0) {
    let xo = saturate(-D / max(sp.outH, 1e-3));
    let uv2 = uv + disp(N, sp.outA * (1.0 - prof(xo)));
    let wo = G.misc.y * saturate((D + 1.0) / 1.0);
    c = mix(c, tap(uv2, lod), wo);
  }

  // Lens at rest [LG §10]: gaussianBlur radius 2 on a 0.25-scale backdrop + colorMatrix (offset −0.2).
  var lensRest = vec3f(0.0);
  if (style == 2) {
    lensRest = cm(tap(uv, lod_for(2.0) + 1.0), G.lens0, G.lens1, G.lens2);
  }

  // Face colour [GR §3]: optional luma compression, then c = mix(c, F·c + f, face_opacity).
  // s = saturate(1 − Y·mlc); c = mix(s·Y, s·c, 1 + 0.3·(1 − s)).
  // TODO(unknown): mlc is not mapped from FaceColorMatrixMaxLuma [LG §11]; we use mlc = 1 − maxLuma so that
  // white maps to ≈ maxLuma (dark: max(0.35, 0.6 − 0.6t); light SDR 0.94).
  {
    let Y = dot(LUMA, c);
    let mlc = 1.0 - sp.maxLuma;
    let s = saturate(1.0 - Y * mlc);
    c = mix(vec3f(s * Y), s * c, 1.0 + 0.3 * (1.0 - s));
    c = mix(c, cm(c, G.face0, G.face1, G.face2), G.hl.w);
  }

  // Edge bleed [GR §3]: sample at uv + bleed·(1 − prof(saturate(−d·bleed_inv_height)))·(M·n) at lod(bleed blur
  // radius), through bleed_cm; weight ((bd.x·Y + bd.y)²·saturate((d − dist₀)/(dist₁ − dist₀)))²·opacity with
  // dist (1, 0). TODO(unknown): bleed_darken (bd) values are not mapped; we use bd = (0, 1). Darken blend in light
  // mode (BleedDarkenBlend true) → min(c, bleed); normal blend in dark mode.
  if (sp.bleedO > 0.0) {
    let xb = saturate(-D / max(sp.bleedA, 1e-3));
    let uvb = uv + disp(N, -sp.bleedA * (1.0 - prof(xb)));
    let bc = cm(tap(uvb, lod_for(sp.bleedR * 0.5)), G.bleed0, G.bleed1, G.bleed2);
    let wsat = saturate((D - 1.0) / (0.0 - 1.0));
    let w = (wsat * wsat) * (wsat * wsat) * sp.bleedO;
    let blended = select(bc, min(c, bc), G.misc.w > 0.5);
    c = mix(c, blended, w);
  }

  // Highlight inside glassBackground [GR §3 "Rim highlight"]: band (see hl_amount), two opposite
  // lobes gᵢ = saturate((±dot(L,n) − cosθ)/(1 − cosθ))·band, hᵢ = gᵢ/(1 + amount·(1 − gᵢ)), H = h₊ + h₋.
  // The face matrix is re-applied to the unblurred backdrop and mixed in by face_opacity·H, then
  // c·(1 + bias·H·(3 − 2c)) with bias −0.3. Angle π/2, amount 0.4, height 0.5333, offset −0.5333 [LG §2].
  {
    let H = hl_amount(D, N, fw, style == 2);
    if (H > 0.0) {
      let sharp = cm(textureSampleLevel(backdrop, samp, uv1, 0.0).rgb, G.face0, G.face1, G.face2);
      c = mix(c, sharp, G.hl.w * H);
      c = c * (1.0 + G.hl.y * H * (3.0 - 2.0 * c));
    }
  }

  // Lens style: rest look ↔ pressed lens look by the press amount.
  if (style == 2) { c = mix(lensRest, c, pressAmt); }

  // Clamp [GR §3]: preserve_hue false → clamp each channel to [−0.75, limit].
  if (G.misc.z > 0.0) { c = clamp(c, vec3f(-0.75), vec3f(G.misc.z)); }

  // ---- Tint layer [GR §4, LG §4] -----------------------------------------------------------------------------
  // out = o·(1 − Y) + tint·Y; clipped to the shape inset by 0.5333 pt (1.6 px, CASDFLayer "@1" effectOffset).
  if (F.tint.a > 0.0) {
    let Y = saturate(dot(LUMA, c));
    let o = F.tint.rgb * F.tintO;
    let tinted = o * (1.0 - Y) + F.tint.rgb * Y;
    let tm = saturate((-0.5333 - D) / fw + 0.5);
    c = mix(c, tinted, tm * F.tint.a);
  }

  // ---- Separate key/fill rim (CASDFKeyFillHighlightEffect) [GR §3, LG §5] ---------------------------------
  // depth = −(d + effectOffset); g = band·lobe; out = key·g_k/(1 + gain·(1 − g_k)) + fill·g_f/(…).
  // Key 0°, fill 180°, spread 80°, amount 0.5, height 1, curvature 0.75; white key/fill colours.
  // Diffuse term (heightScale 8, amountScale 0.15, spreadScale 0.65) [LG §5]; its exact use is not transcribed,
  // so it is added as a second, wider and weaker band (approximation).
  // The layer runs through vibrantColorMatrix [LG §5], i.e. the rim alpha selects a vibrant (saturated,
  // +0.147 lifted) version of what is below.
  {
    let depth = -D;
    let band = rim_band(depth, G.rim.z, G.rim.w, fw);
    // Key 0° / fill 180° land on the top and bottom edges on device (raw/seeded-dark.png: bright rim at the top and
    // bottom of the back button, none at the sides), so they are rotated a quarter turn into our axes (see Lh above).
    let gk = band * lobe(N, 1.57079633, G.rim.x);
    let gf = band * lobe(N, -1.57079633, G.rim.x);
    var rimA = knee(gk, G.rim.y) + knee(gf, G.rim.y);
    let dband = rim_band(depth, G.rim.z * 8.0, G.rim.w, fw);
    let cs2 = cos(acos(G.rim.x) * 0.65);
    rimA += 0.15 * (dband * lobe(N, 1.57079633, cs2) + dband * lobe(N, -1.57079633, cs2));
    rimA = saturate(rimA);
    if (style == 2) { rimA = rimA * pressAmt; }
    c = mix(c, saturate(cm(c, G.vib0, G.vib1, G.vib2)), rimA);
  }

  // ---- Flex glows [LG §9, GD §7] -------------------------------------------------------------------------------
  // BigGlow: full-size white layer through vibrantColorMatrix [[1.1575, −0.1431, −0.0144, 0, 0.05], …].
  // LittleGlow: disc of size min(1.5h, 160) at the touch with shadowRadius size/2 (σ = radius/2, [LG §3]
  // "radius → σ = radius/2"), white, through vibrantColorMatrix [[2.3229, −0.5962, −0.06, 0, 0], …].
  let count = u32(G.cfg.w);
  for (var i = 0u; i < count; i = i + 1u) {
    let s = S[i];
    if (s.d.z < 0.5 || s.d.x <= 0.0) { continue; }
    let gO = s.d.x;
    // BigGlow
    let bigA = s.glow.x * gO;
    if (bigA > 0.0) {
      let cb = cm(c, vec4f(1.1575, -0.1431, -0.0144, 0.05), vec4f(-0.0425, 1.057, -0.0145, 0.05), vec4f(-0.0426, -0.143, 1.1856, 0.05));
      // Masked to the element (glow container masksToBounds): weight by proximity to this shape.
      let own = saturate(0.5 - shape_dist(p, i) / fw);
      c = mix(c, saturate(cb), bigA * own);
    }
    // LittleGlow
    let size = s.glow.z * s.d.y;
    let rad = size * 0.5;
    let sigma = max(rad * 0.5, 1.0);
    let dist = length(p - s.c.zw);
    let disc = 1.0 - ncdf(dist - rad, sigma * 1.41421356);
    let litA = s.glow.y * gO * disc;
    if (litA > 0.0) {
      let cl = cm(c, vec4f(2.3229, -0.5962, -0.06, 0.0), vec4f(-0.1772, 1.904, -0.0602, 0.0), vec4f(-0.1773, -0.5958, 2.4399, 0.0));
      c = mix(c, saturate(cl), saturate(litA));
    }
  }

  c = saturate(c);
  // Premultiplied: glass (× shape opacity) over shadow over backdrop.
  let covO = cov * saturate(F.opacity);
  let a = covO + shadowA * (1.0 - covO);
  return vec4f(c * covO, a);
}
`;
