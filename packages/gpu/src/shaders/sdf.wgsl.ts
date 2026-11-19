/**
 * Continuous-corner rounded-rect SDF, shared by the layer compositor and the glass shader.
 *
 * Transcribed from QuartzCore's `ShaderUtils_<float>::supercircle_sdf(p, center, radius, curveMix)`
 * (findings/liquid-glass.md §6, IR of glass_background_sdf_all_lpf):
 *   rExt = r·1.5286649 (a continuous corner extends 1.5287× the radius along each edge)
 *   q    = max(0, (p − c + rExt)/rExt),  u = min(q)/max(q)
 *   poly = (((−0.926054u + 3.15601)u − 3.64122)u + 1.26803)u + 0.268531
 *   sdfA = (|q| + 1) − 1/(1 − u²·saturate(|q|)·poly)          (superellipse branch)
 *   sdfB = 0.6541656·|max(0, q·1.5286649 − 0.528665)| + 0.3458344   (circular branch)
 *   dist = (mix(sdfA, sdfB, curve) − 1)·rExt + min(max(d.x, d.y), 0),  d = p − c + rExt
 * Check: at 45° sdfA = 0 at |q| = 1.1432, i.e. the continuous corner meets the circular one at the diagonal.
 *
 * When 1.5287·r does not fit in the half size (capsules), the corner falls back to the circular branch
 * (the extraction does not say how UIKit clamps; capsules render as true semicircles on iOS).
 */
export const SDF_WGSL = /* wgsl */ `
fn sc_poly(u: f32) -> f32 {
  return ((((-0.926054 * u + 3.15601) * u - 3.64122) * u + 1.26803) * u + 0.268531);
}

// q: |p - centre| (first quadrant), half: half size, r: corner radius. Returns signed distance (negative inside).
fn rrect_sdf(q: vec2f, half: vec2f, r_in: f32) -> f32 {
  let minHalf = min(half.x, half.y);
  let r = clamp(r_in, 0.0, minHalf);
  if (r <= 1e-3) {
    let d0 = q - half;
    return length(max(d0, vec2f(0.0))) + min(max(d0.x, d0.y), 0.0);
  }
  // Circular corner (exact rounded box), used for capsules and as the fallback branch.
  let dc = q - half + vec2f(r);
  let circ = length(max(dc, vec2f(0.0))) + min(max(dc.x, dc.y), 0.0) - r;
  let rWant = r * 1.5286649;
  let curve = saturate((rWant - minHalf) / max(r * 0.5286649, 1e-4));
  if (curve >= 1.0) { return circ; }
  let rExt = min(rWant, minHalf);
  let d = q - half + vec2f(rExt);
  let qq = max(vec2f(0.0), d / rExt);
  let mx = max(qq.x, qq.y);
  let mn = min(qq.x, qq.y);
  var u = 0.0;
  if (mx > 0.0) { u = saturate(mn / mx); }
  let lq = length(qq);
  let sdfA = (lq + 1.0) - 1.0 / (1.0 - u * u * saturate(lq) * sc_poly(u));
  let cont = (sdfA - 1.0) * rExt + min(max(d.x, d.y), 0.0);
  return mix(cont, circ, curve);
}
`;
