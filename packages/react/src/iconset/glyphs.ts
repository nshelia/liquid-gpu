/**
 * Built-in glyphs, keyed by SF-Symbol-style names.
 *
 * Licensing: none of this artwork is copied or traced from Apple's SF Symbols. Sources:
 * - [repo]   this project's own hand-drawn glyphs (packages/react/src/icons.tsx, search/glyphs.tsx), data copied here.
 * - [lucide] path data from Lucide (https://lucide.dev, ISC License, see THIRD_PARTY_NOTICES.md), sometimes adapted.
 * - [orig]   drawn for this file (simple geometry, generated gear and sparkle shapes).
 * Deliberately NOT registered: status/symbols.tsx (paths copied from Apple's renderer) and basics/icons.tsx StarFill
 * (traced from an iOS render); those must not be redistributed as a general icon set.
 *
 * All glyphs use a 24 × 24 box unless they say otherwise; stroke width at `regular` is 1.9.
 */
import type { IconDefinition, IconLayer, IconNode } from './types';

// ---- node helpers ----------------------------------------------------------------------------------------------
const p = (d: string): IconNode => ['path', { d }];
const c = (cx: number, cy: number, r: number): IconNode => ['circle', { cx, cy, r }];
const r = (x: number, y: number, width: number, height: number, rx = 0): IconNode => ['rect', { x, y, width, height, rx }];
const pg = (points: string): IconNode => ['polygon', { points }];

const S = (...nodes: IconNode[]): IconLayer => ({ paint: 'stroke', nodes });
const F = (...nodes: IconNode[]): IconLayer => ({ paint: 'fill', nodes });
const B = (...nodes: IconNode[]): IconLayer => ({ paint: 'both', nodes });

/** Outline glyph from stroked nodes. */
const line = (...nodes: IconNode[]): IconDefinition => ({ layers: [S(...nodes)] });
/** Solid glyph: `solid` filled + stroked, `strokes` stroked on top, `cut` knocked out (stroked). */
const solid = (solid: IconNode[], cut: IconNode[] = [], strokes: IconNode[] = [], cutFill: IconNode[] = []): IconDefinition => {
  const layers: IconLayer[] = [B(...solid)];
  if (strokes.length) layers.push(S(...strokes));
  const cutouts: IconLayer[] = [];
  if (cut.length) cutouts.push(S(...cut));
  if (cutFill.length) cutouts.push(F(...cutFill));
  return cutouts.length ? { layers, cutouts } : { layers };
};

// ---- generated shapes [orig] -----------------------------------------------------------------------------------
const f = (n: number) => +n.toFixed(2);

/** A concave four-point sparkle centred on (cx, cy). */
function star4(cx: number, cy: number, rad: number): IconNode {
  const k = rad * 0.18;
  return p(
    `M${f(cx)} ${f(cy - rad)}Q${f(cx + k)} ${f(cy - k)} ${f(cx + rad)} ${f(cy)}Q${f(cx + k)} ${f(cy + k)} ${f(cx)} ${f(cy + rad)}` +
      `Q${f(cx - k)} ${f(cy + k)} ${f(cx - rad)} ${f(cy)}Q${f(cx - k)} ${f(cy - k)} ${f(cx)} ${f(cy - rad)}Z`,
  );
}

/** A gear outline with `teeth` trapezoid teeth. */
function gear(cx: number, cy: number, outer: number, inner: number, teeth: number): IconNode {
  const pts: string[] = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    const seq: [number, number][] = [
      [a - step * 0.3, inner],
      [a - step * 0.16, outer],
      [a + step * 0.16, outer],
      [a + step * 0.3, inner],
    ];
    for (const [ang, rad] of seq) pts.push(`${f(cx + Math.cos(ang) * rad)} ${f(cy + Math.sin(ang) * rad)}`);
  }
  return p(`M${pts.join('L')}Z`);
}

// ---- shared fragments --------------------------------------------------------------------------------------------
const CIRCLE = c(12, 12, 10);
const SQUARE = r(3, 3, 18, 18, 3.5);

/** Outline + filled pair for "<symbol>.circle" / "<symbol>.circle.fill" style glyphs. */
function inCircle(name: string, inner: IconNode[], innerFill: IconNode[] = []): Record<string, IconDefinition> {
  const outline: IconDefinition = { layers: [S(CIRCLE, ...inner)] };
  if (innerFill.length) outline.layers.push(F(...innerFill));
  return {
    [`${name}.circle`]: outline,
    [`${name}.circle.fill`]: solid([CIRCLE], inner, [], innerFill),
  };
}
function inSquare(name: string, inner: IconNode[]): Record<string, IconDefinition> {
  return {
    [`${name}.square`]: line(SQUARE, ...inner),
    [`${name}.square.fill`]: solid([SQUARE], inner),
  };
}
/** Outline + `.fill` where the fill is the same shapes painted solid. */
function pair(name: string, ...nodes: IconNode[]): Record<string, IconDefinition> {
  return { [name]: line(...nodes), [`${name}.fill`]: solid(nodes) };
}

// ---- data ------------------------------------------------------------------------------------------------------
const QUESTION = [p('M9.1 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'), p('M12 17h.01')];
const SPEAKER = p('M11 4.7a.7.7 0 0 0-1.2-.5L6.41 7.59A1.4 1.4 0 0 1 5.42 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.42a1.4 1.4 0 0 1 1 .41l3.38 3.39a.7.7 0 0 0 1.2-.5z'); // [lucide] volume
const HEART = p('M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'); // [lucide]
const PERSON_HEAD = c(12, 7, 4);
const PERSON_BODY = p('M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2');
const DOC = p('M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z'); // [lucide] file
const DOC_FOLD = p('M14 2v6h6');
const SHARE_BOX = p('M8.5 10H6.5A1.5 1.5 0 0 0 5 11.5v7A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-2'); // [repo]
const GEAR = gear(12, 12, 10, 7.4, 8);
const EYE = p('M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0'); // [lucide] eye
const SHIELD = p('M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'); // [lucide]
const BELL = p('M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9'); // [lucide]
const BELL_CLAPPER = p('M10.3 21a1.94 1.94 0 0 0 3.4 0');
const MIC = p('M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z'); // [lucide]
const MIC_STAND = [p('M19 10v2a7 7 0 0 1-14 0v-2'), p('M12 19v3')];
const LOCK_BODY = r(3, 11, 18, 11, 2.5);
const CLOUD = p('M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z'); // [lucide]
const SLASH = p('m2 2 20 20');

export const builtinGlyphs: Record<string, IconDefinition> = {
  // Placeholder for unknown names (questionmark.square) [orig]
  ...inSquare('questionmark', QUESTION),

  // ---- navigation ----
  // [repo] icons.tsx ChevronBackward / ChevronForward (measured frames, bars §1.6 / lists §1.2)
  'chevron.backward': { viewBox: '0 0 12.67 17.33', stroke: 2.6, layers: [S(p('M10.2 1.6 2.6 8.66l7.6 7.07'))] },
  'chevron.forward': { viewBox: '0 0 10.33 14', stroke: 2.2, layers: [S(p('M2 1.5 8 7l-6 5.5'))] },
  'chevron.left': line(p('m15 18-6-6 6-6')),
  'chevron.right': line(p('m9 18 6-6-6-6')),
  'chevron.up': line(p('m18 15-6-6-6 6')),
  'chevron.down': line(p('m6 9 6 6 6-6')),
  'chevron.up.chevron.down': line(p('m7 15 5 5 5-5'), p('m7 9 5-5 5 5')),
  xmark: line(p('M18 6 6 18'), p('m6 6 12 12')),
  // [repo] icons.tsx PlusIcon
  plus: { stroke: 2.2, layers: [S(p('M12 4.5v15M4.5 12h15'))] },
  minus: line(p('M5 12h14')),
  checkmark: line(p('M20 6 9 17l-5-5')),
  // [repo] icons.tsx EllipsisIcon
  ellipsis: { layers: [F(c(5.5, 12, 2), c(12, 12, 2), c(18.5, 12, 2))] },
  ...inCircle('ellipsis', [], [c(7.5, 12, 1.4), c(12, 12, 1.4), c(16.5, 12, 1.4)]),
  'arrow.left': line(p('m12 19-7-7 7-7'), p('M19 12H5')),
  'arrow.right': line(p('M5 12h14'), p('m12 5 7 7-7 7')),
  'arrow.up': line(p('m5 12 7-7 7 7'), p('M12 19V5')),
  'arrow.down': line(p('M12 5v14'), p('m19 12-7 7-7-7')),
  ...inCircle('arrow.up', [p('m8 11 4-4 4 4'), p('M12 17V7')]),
  ...inCircle('arrow.down', [p('M12 7v10'), p('m16 13-4 4-4-4')]),
  ...inCircle('arrow.left', [p('m11 8-4 4 4 4'), p('M17 12H7')]),
  ...inCircle('arrow.right', [p('M7 12h10'), p('m13 8 4 4-4 4')]),
  'arrow.up.right': line(p('M7 7h10v10'), p('M7 17 17 7')),
  'arrow.clockwise': line(p('M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8'), p('M21 3v5h-5')), // [lucide] rotate-cw
  'arrow.counterclockwise': line(p('M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'), p('M3 3v5h5')), // [lucide] rotate-ccw
  'arrow.triangle.2.circlepath': line(
    p('M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8'),
    p('M21 3v5h-5'),
    p('M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16'),
    p('M8 16H3v5'),
  ), // [lucide] refresh-cw
  'arrow.up.arrow.down': line(p('m21 16-4 4-4-4'), p('M17 20V4'), p('m3 8 4-4 4 4'), p('M7 4v16')), // [lucide]
  'arrow.uturn.backward': line(p('M9 14 4 9l5-5'), p('M4 9h10.5a5.5 5.5 0 0 1 0 11H11')), // [lucide] undo-2
  'arrow.uturn.forward': line(p('m15 14 5-5-5-5'), p('M20 9H9.5a5.5 5.5 0 0 0 0 11H13')), // [lucide] redo-2
  'arrowshape.turn.up.left': line(p('M9 17 4 12l5-5'), p('M20 18v-2a4 4 0 0 0-4-4H4')), // [lucide] reply
  'arrow.up.left.and.arrow.down.right': line(p('M15 3h6v6'), p('M9 21H3v-6'), p('M21 3l-7 7'), p('M3 21l7-7')), // [lucide] maximize-2
  'arrow.down.right.and.arrow.up.left': line(p('m14 10 7-7'), p('M20 10h-6V4'), p('m3 21 7-7'), p('M4 14h6v6')), // [lucide] minimize-2
  'rectangle.portrait.and.arrow.right': line(p('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'), p('m16 17 5-5-5-5'), p('M21 12H9')), // [lucide] log-out

  // ---- actions ----
  // [repo] icons.tsx ShareIcon
  'square.and.arrow.up': { stroke: 2, layers: [S(p('M12 3.5v11M8 7l4-3.5L16 7'), SHARE_BOX)] },
  'square.and.arrow.down': { stroke: 2, layers: [S(p('M12 3.5v11M8 11l4 3.5 4-3.5'), SHARE_BOX)] }, // [orig] from ShareIcon
  // [repo] icons.tsx TrashIcon
  trash: { stroke: 2, layers: [S(p('M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13M10 10v6M14 10v6'))] },
  'trash.fill': { stroke: 2, ...solid([p('M6.5 6.5l1 13h9l1-13z')], [p('M10 10v6M14 10v6')], [p('M4.5 6.5h15M9.5 6.5V4.5h5v2')]) },
  pencil: line(p('M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z'), p('m15 5 4 4')), // [lucide] pencil
  // [repo] icons.tsx ComposeIcon
  'square.and.pencil': { stroke: 2, layers: [S(p('M11 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V13'), p('M17.5 3.5 20.5 6.5 12 15l-4 1 1-4z'))] },
  'doc.on.doc': line(r(8, 8, 14, 14, 2), p('M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2')), // [lucide] copy
  'doc.on.doc.fill': solid([r(8, 8, 14, 14, 2)], [], [p('M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2')]),
  link: line(
    p('M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'),
    p('M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'),
  ), // [lucide]
  // [repo] icons.tsx SearchIcon
  magnifyingglass: { stroke: 2.2, layers: [S(c(10.5, 10.5, 6.5), p('m15.5 15.5 5 5'))] },
  'line.3.horizontal': line(p('M4 6h16M4 12h16M4 18h16')),
  'line.3.horizontal.decrease': line(p('M3 6h18M7 12h10M10 18h4')),
  ...inCircle('line.3.horizontal.decrease', [p('M7 8.5h10M9 12h6M11 15.5h2')]),
  'slider.horizontal.3': line(
    p('M21 4h-7'), p('M10 4H3'), p('M21 12h-9'), p('M8 12H3'), p('M21 20h-5'), p('M12 20H3'), p('M14 2v4'), p('M8 10v4'), p('M16 18v4'),
  ), // [lucide] sliders-horizontal
  gearshape: line(GEAR, c(12, 12, 3)),
  'gearshape.fill': solid([GEAR], [], [], [c(12, 12, 3.2)]),
  ...pair('bell', BELL, BELL_CLAPPER),
  'bell.slash': line(BELL, BELL_CLAPPER, SLASH),
  ...pair('bookmark', p('m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z')), // [lucide]
  ...pair('heart', HEART),
  ...pair('star', pg('12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2')), // [lucide]
  flag: line(p('M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z'), p('M4 22v-7')), // [lucide]
  'flag.fill': solid([p('M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z')], [], [p('M4 22v-7')]),
  paperplane: line(p('m22 2-7 20-4-9-9-4Z'), p('M22 2 11 13')), // [lucide] send
  'paperplane.fill': solid([p('m22 2-7 20-4-9-9-4Z')], [p('M22 2 11 13')]),
  tray: line(
    p('M22 12h-6l-2 3h-4l-2-3H2'),
    p('M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'),
  ), // [lucide] inbox
  'tray.fill': solid(
    [p('M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z')],
    [p('M22 12h-6l-2 3h-4l-2-3H2')],
  ),
  archivebox: line(r(2, 3, 20, 5, 1), p('M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8'), p('M10 12h4')), // [lucide] archive
  'archivebox.fill': solid([r(2, 3, 20, 5, 1), p('M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z')], [p('M10 12h4'), p('M3 8.5h18')]),
  ...pair('folder', p('M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z')), // [lucide]
  doc: line(DOC, DOC_FOLD),
  'doc.fill': solid([DOC], [DOC_FOLD]),
  'doc.text': line(DOC, DOC_FOLD, p('M16 13H8'), p('M16 17H8'), p('M10 9H8')),
  'doc.text.fill': solid([DOC], [DOC_FOLD, p('M16 13H8'), p('M16 17H8'), p('M10 9H8')]),
  paperclip: line(p('m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48')), // [lucide]
  ...pair('tag', p('M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z')), // [lucide]
  // [repo] icons.tsx PinFill
  pin: line(p('M8 3h8l-1 6 3 3v2h-5v6l-1 1-1-1v-6H6v-2l3-3z')),
  'pin.fill': { layers: [F(p('M8 3h8l-1 6 3 3v2h-5v6l-1 1-1-1v-6H6v-2l3-3z'))] },
  printer: line(
    p('M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2'),
    p('M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6'),
    r(6, 14, 12, 8, 1),
  ), // [lucide]
  power: line(p('M12 2v10'), p('M18.4 6.6a9 9 0 1 1-12.77.04')), // [lucide]
  ...pair('hand.thumbsup', p('M7 10v12'), p('M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z')), // [lucide]

  // ---- media / communication ----
  camera: line(p('M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z'), c(12, 13, 3)), // [lucide]
  'camera.fill': solid([p('M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z')], [c(12, 13, 3)]),
  photo: line(r(3, 3, 18, 18, 2), c(9, 9, 2), p('m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21')), // [lucide] image
  'photo.fill': solid([r(3, 3, 18, 18, 2)], [p('m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21')], [], [c(9, 9, 2)]),
  ...pair('video', p('m16 13 5.22 3.48a.5.5 0 0 0 .78-.42V7.87a.5.5 0 0 0-.75-.43L16 10.5'), r(2, 6, 14, 12, 2)), // [lucide]
  mic: line(MIC, ...MIC_STAND),
  'mic.fill': solid([MIC], [], MIC_STAND),
  'mic.slash': line(MIC, ...MIC_STAND, SLASH),
  ...pair('phone', p('M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z')), // [lucide]
  envelope: line(r(2, 4, 20, 16, 2), p('m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7')), // [lucide] mail
  'envelope.fill': solid([r(2, 4, 20, 16, 2)], [p('m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7')]),
  ...pair('message', p('M7.9 20A9 9 0 1 0 4 16.1L2 22Z')), // [lucide] message-circle
  ...pair('bubble.left', p('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z')), // [lucide] message-square
  ...pair('bubble.left.and.bubble.right', p('M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z'), p('M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1')), // [lucide] messages-square
  ...pair('play', pg('6 3 20 12 6 21 6 3')),
  ...pair('pause', r(14, 4, 4, 16, 1), r(6, 4, 4, 16, 1)),
  ...pair('stop', r(5, 5, 14, 14, 2)),
  ...pair('forward', pg('13 19 22 12 13 5 13 19'), pg('2 19 11 12 2 5 2 19')),
  ...pair('backward', pg('11 19 2 12 11 5 11 19'), pg('22 19 13 12 22 5 22 19')),
  'forward.end': line(pg('5 4 15 12 5 20 5 4'), p('M19 5v14')),
  'forward.end.fill': solid([pg('5 4 15 12 5 20 5 4')], [], [p('M19 5v14')]),
  'backward.end': line(pg('19 20 9 12 19 4 19 20'), p('M5 19V5')),
  'backward.end.fill': solid([pg('19 20 9 12 19 4 19 20')], [], [p('M5 19V5')]),
  ...inCircle('play', [], [pg('10 8 16 12 10 16')]),
  ...inCircle('pause', [p('M10 9v6M14 9v6')]),
  shuffle: line(
    p('m18 14 4 4-4 4'), p('m18 2 4 4-4 4'), p('M2 18h1.97a4 4 0 0 0 3.3-1.7l5.45-7.6A4 4 0 0 1 16.03 7H22'),
    p('M2 6h1.97a4 4 0 0 1 3.6 2.2'), p('M22 18h-6.04a4 4 0 0 1-3.3-1.8l-.36-.45'),
  ), // [lucide]
  repeat: line(p('m17 2 4 4-4 4'), p('M3 11v-1a4 4 0 0 1 4-4h14'), p('m7 22-4-4 4-4'), p('M21 13v1a4 4 0 0 1-4 4H3')), // [lucide]
  speaker: line(SPEAKER),
  'speaker.fill': solid([SPEAKER]),
  'speaker.slash': line(SPEAKER, p('m22 9-6 6'), p('m16 9 6 6')),
  'speaker.slash.fill': solid([SPEAKER], [], [p('m22 9-6 6'), p('m16 9 6 6')]),
  'speaker.wave.1': line(SPEAKER, p('M16 9a5 5 0 0 1 0 6')),
  'speaker.wave.1.fill': solid([SPEAKER], [], [p('M16 9a5 5 0 0 1 0 6')]),
  'speaker.wave.2': line(SPEAKER, p('M16 9a5 5 0 0 1 0 6'), p('M19.36 18.36a9 9 0 0 0 0-12.73')),
  'speaker.wave.2.fill': solid([SPEAKER], [], [p('M16 9a5 5 0 0 1 0 6'), p('M19.36 18.36a9 9 0 0 0 0-12.73')]),
  ...pair('music.note', p('M9 18V5l12-2v13'), c(6, 18, 3), c(18, 16, 3)), // [lucide] music
  headphones: line(p('M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3')), // [lucide]

  // ---- people / places ----
  person: line(PERSON_HEAD, PERSON_BODY),
  // [repo] icons.tsx PersonFill
  'person.fill': { layers: [F(c(12, 8, 4.2), p('M4 20.2c0-4 3.6-6.7 8-6.7s8 2.7 8 6.7c0 .5-.4.8-.9.8H4.9c-.5 0-.9-.3-.9-.8z'))] },
  'person.2': line(p('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'), c(9, 7, 4), p('M22 21v-2a4 4 0 0 0-3-3.87'), p('M16 3.13a4 4 0 0 1 0 7.75')), // [lucide] users
  'person.2.fill': solid([p('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2z'), c(9, 7, 4)], [], [p('M22 21v-2a4 4 0 0 0-3-3.87'), p('M16 3.13a4 4 0 0 1 0 7.75')]),
  'person.badge.plus': line(p('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'), c(9, 7, 4), p('M19 8v6'), p('M22 11h-6')), // [lucide] user-plus
  'person.crop.circle': line(CIRCLE, c(12, 10, 3), p('M7 20.66V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.66')), // [lucide] circle-user-round
  'person.crop.circle.fill': solid([CIRCLE], [], [], [c(12, 9.5, 3.5), p('M5.8 18.8C7.2 16.6 9.4 15.5 12 15.5s4.8 1.1 6.2 3.3A8.5 8.5 0 0 1 12 21.5a8.5 8.5 0 0 1-6.2-2.7z')]),
  house: line(p('M3 10.5 12 3l9 7.5'), p('M5 9v10a2 2 0 0 0 2 2h3v-6h4v6h3a2 2 0 0 0 2-2V9')), // [orig]
  // [repo] icons.tsx HouseFill
  'house.fill': { layers: [F(p('M12 3.2 2.8 11a.9.9 0 0 0 1.2 1.4l.9-.8V19a2 2 0 0 0 2 2h3.3v-5.3h3.6V21H17a2 2 0 0 0 2-2v-7.4l.9.8a.9.9 0 0 0 1.2-1.4z'))] },
  map: line(
    p('M14.1 5.55a2 2 0 0 0 1.79 0l3.66-1.83A1 1 0 0 1 21 4.62v12.76a1 1 0 0 1-.55.9l-4.55 2.27a2 2 0 0 1-1.79 0l-4.21-2.1a2 2 0 0 0-1.79 0l-3.66 1.83A1 1 0 0 1 3 19.38V6.62a1 1 0 0 1 .55-.9l4.55-2.27a2 2 0 0 1 1.79 0z'),
    p('M15 5.76v15'), p('M9 3.24v15'),
  ), // [lucide]
  'map.fill': solid(
    [p('M14.1 5.55a2 2 0 0 0 1.79 0l3.66-1.83A1 1 0 0 1 21 4.62v12.76a1 1 0 0 1-.55.9l-4.55 2.27a2 2 0 0 1-1.79 0l-4.21-2.1a2 2 0 0 0-1.79 0l-3.66 1.83A1 1 0 0 1 3 19.38V6.62a1 1 0 0 1 .55-.9l4.55-2.27a2 2 0 0 1 1.79 0z')],
    [p('M15 5.76v15'), p('M9 3.24v15')],
  ),
  mappin: line(p('M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z'), c(12, 10, 3)), // [lucide] map-pin
  'mappin.fill': solid([p('M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z')], [], [], [c(12, 10, 3)]),
  ...pair('location', pg('3 11 22 2 13 21 11 13 3 11')), // [lucide] navigation
  globe: line(CIRCLE, p('M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20'), p('M2 12h20')), // [lucide]
  safari: line(CIRCLE, pg('16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76')), // [lucide] compass
  calendar: line(r(3, 4, 18, 18, 2), p('M16 2v4'), p('M8 2v4'), p('M3 10h18')), // [lucide]
  'calendar.fill': solid([r(3, 4, 18, 18, 2)], [p('M3 10h18')], [p('M16 2v4'), p('M8 2v4')], [c(8, 14, 1.1), c(12, 14, 1.1), c(16, 14, 1.1), c(8, 18, 1.1), c(12, 18, 1.1)]),
  clock: line(CIRCLE, p('M12 6v6l4 2')), // [lucide]
  'clock.fill': solid([CIRCLE], [p('M12 6v6l4 2')]),
  timer: line(p('M10 2h4'), p('M12 14l3-3'), c(12, 14, 8)), // [lucide]
  hourglass: line(
    p('M5 22h14'), p('M5 2h14'),
    p('M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22'),
    p('M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2'),
  ), // [lucide]
  briefcase: line(p('M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'), r(2, 6, 20, 14, 2)), // [lucide]
  'briefcase.fill': solid([r(2, 6, 20, 14, 2)], [p('M2 12h20')], [p('M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2')]),
  ...pair('book', p('M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20')), // [lucide]

  // ---- commerce / security ----
  cart: line(c(8, 21, 1), c(19, 21, 1), p('M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12')), // [lucide] shopping-cart
  'cart.fill': solid([p('M5.12 6.62h16.97l-1.65 7.43a2 2 0 0 1-1.95 1.57H8.71a2 2 0 0 1-2-1.58z'), c(8, 21, 1), c(19, 21, 1)], [], [p('M2 2h2l1.1 4.6')]),
  bag: line(p('M4.5 8h15l-.9 11.2a2 2 0 0 1-2 1.8H7.4a2 2 0 0 1-2-1.8z'), p('M8.5 10V6.5a3.5 3.5 0 0 1 7 0V10')), // [orig]
  'bag.fill': solid([p('M4.5 8h15l-.9 11.2a2 2 0 0 1-2 1.8H7.4a2 2 0 0 1-2-1.8z')], [p('M8.5 10.5v1M15.5 10.5v1')], [p('M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8')]),
  creditcard: line(r(2, 5, 20, 14, 2), p('M2 10h20')), // [lucide]
  'creditcard.fill': solid([r(2, 5, 20, 14, 2)], [p('M2 10h20'), p('M6 15h4')]),
  ...inCircle('dollarsign', [p('M15.5 8.5H11a2 2 0 1 0 0 4h2a2 2 0 1 1 0 4H8.5'), p('M12 18V6')]),
  lock: line(LOCK_BODY, p('M7 11V7a5 5 0 0 1 10 0v4')), // [lucide]
  'lock.fill': solid([LOCK_BODY], [], [p('M7 11V7a5 5 0 0 1 10 0v4')]),
  'lock.open': line(LOCK_BODY, p('M7 11V7a5 5 0 0 1 9.9-1')),
  'lock.open.fill': solid([LOCK_BODY], [], [p('M7 11V7a5 5 0 0 1 9.9-1')]),
  key: line(p('m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4'), p('m21 2-9.6 9.6'), c(7.5, 15.5, 5.5)), // [lucide]
  'key.fill': solid([c(7.5, 15.5, 5.5)], [], [p('m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4'), p('m21 2-9.6 9.6')], [c(6, 17, 1.6)]),
  eye: line(EYE, c(12, 12, 3)),
  'eye.fill': solid([EYE], [c(12, 12, 3.4)]),
  'eye.slash': line(
    p('M10.73 5.08a10.74 10.74 0 0 1 11.2 6.57 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-1.44 2.49'),
    p('M14.08 14.16a3 3 0 0 1-4.24-4.24'),
    p('M17.48 17.5a10.75 10.75 0 0 1-15.42-5.15 1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14'),
    SLASH,
  ), // [lucide] eye-off
  shield: line(SHIELD),
  'shield.fill': solid([SHIELD]),
  'checkmark.shield': line(SHIELD, p('m9 12 2 2 4-4')),
  'checkmark.shield.fill': solid([SHIELD], [p('m9 12 2 2 4-4')]),

  // ---- system / status ----
  wifi: line(p('M12 20h.01'), p('M2 8.82a15 15 0 0 1 20 0'), p('M5 12.86a10 10 0 0 1 14 0'), p('M8.5 16.43a5 5 0 0 1 7 0')), // [lucide]
  ...pair('bolt', p('M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z')), // [lucide] zap
  ...pair('cloud', CLOUD),
  'cloud.rain': line(p('M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24'), p('M16 14v6'), p('M8 14v6'), p('M12 16v6')), // [lucide]
  'sun.max': line(c(12, 12, 4), p('M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41')), // [lucide] sun
  'sun.max.fill': solid([c(12, 12, 4.5)], [], [p('M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41')]),
  ...pair('moon', p('M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z')), // [lucide]
  ...pair('sparkles', star4(10, 13.5, 8), star4(18.5, 5.5, 3.5), star4(19.5, 18, 2.2)), // [orig]
  'wand.and.stars': line(p('M3.5 20.5 13 11'), star4(16.5, 7.5, 4.5), star4(8, 4.5, 2), star4(20, 15.5, 2)), // [orig]
  'wand.and.stars.inverse': solid([star4(16.5, 7.5, 4.5), star4(8, 4.5, 2), star4(20, 15.5, 2)], [], [p('M3.5 20.5 13 11')]),
  ...pair('flame', p('M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z')), // [lucide]
  ...pair('drop', p('M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z')), // [lucide] droplet
  leaf: line(p('M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z'), p('M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12')), // [lucide]
  'leaf.fill': solid([p('M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z')], [p('M13 12c-1 1-3.5 2.52-5.92 3')], [p('M2 21c0-3 1.85-5.36 5.08-6')]),
  lightbulb: line(p('M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5'), p('M9 18h6'), p('M10 22h4')), // [lucide]
  'lightbulb.fill': solid([p('M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5z')], [], [p('M9 18h6'), p('M10 22h4')]),
  'battery.100': { layers: [S(r(2, 7, 17, 10, 2.5), p('M22 11v2')), F(r(4, 9, 13, 6, 1))] },
  'battery.50': { layers: [S(r(2, 7, 17, 10, 2.5), p('M22 11v2')), F(r(4, 9, 6.5, 6, 1))] },
  'battery.0': line(r(2, 7, 17, 10, 2.5), p('M22 11v2')),
  desktopcomputer: line(r(2, 3, 20, 14, 2), p('M8 21h8'), p('M12 17v4')), // [lucide] monitor
  iphone: line(r(6, 2, 12, 20, 2.5), p('M10.5 5h3')), // [orig]
  laptopcomputer: line(p('M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9'), p('M2 16h20v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z')),
  ...pair('cube', p('M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z')), // [lucide] box
  wrench: line(p('M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z')), // [lucide]
  at: line(c(12, 12, 4), p('M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8')), // [lucide]
  'face.smiling': line(CIRCLE, p('M8 14s1.5 2 4 2 4-2 4-2'), p('M9 9h.01'), p('M15 9h.01')), // [lucide] smile
  'sidebar.left': line(r(3, 3, 18, 18, 2), p('M9 3v18')), // [lucide] panel-left

  // ---- status circles ----
  ...inCircle('info', [p('M12 16v-4'), p('M12 8h.01')]),
  ...inCircle('exclamationmark', [p('M12 8v4'), p('M12 16h.01')]),
  ...inCircle('questionmark', QUESTION),
  ...inCircle('checkmark', [p('m8.5 12 2.5 2.5 4.5-5')]),
  ...inCircle('plus', [p('M8 12h8'), p('M12 8v8')]),
  ...inCircle('minus', [p('M8 12h8')]),
  'xmark.circle': line(CIRCLE, p('m15 9-6 6'), p('m9 9 6 6')),
  // [repo] search/glyphs.tsx XMarkCircleFill (20 pt frame, 17.2 pt disc)
  'xmark.circle.fill': {
    viewBox: '0 0 20 20',
    layers: [F(c(10, 10, 8.6))],
    cutouts: [S(p('M6.8 6.8 13.2 13.2M13.2 6.8 6.8 13.2'))],
  },
  'exclamationmark.triangle': line(p('m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3'), p('M12 9v4'), p('M12 17h.01')), // [lucide]
  'exclamationmark.triangle.fill': solid([p('m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z')], [p('M12 9v4'), p('M12 17h.01')]),
  ...pair('circle', CIRCLE),
  ...pair('square', SQUARE),
  ...inSquare('checkmark', [p('m8.5 12 2.5 2.5 4.5-5')]),
  ...inSquare('plus', [p('M8 12h8'), p('M12 8v8')]),
  'square.grid.2x2': line(r(3.5, 3.5, 7.5, 7.5, 2), r(13, 3.5, 7.5, 7.5, 2), r(3.5, 13, 7.5, 7.5, 2), r(13, 13, 7.5, 7.5, 2)),
  // [repo] icons.tsx SquareGridFill
  'square.grid.2x2.fill': { layers: [F(r(3.5, 3.5, 7.5, 7.5, 2), r(13, 3.5, 7.5, 7.5, 2), r(3.5, 13, 7.5, 7.5, 2), r(13, 13, 7.5, 7.5, 2))] },
  'list.bullet': { layers: [S(p('M9 6h12M9 12h12M9 18h12')), F(c(4.5, 6, 1.4), c(4.5, 12, 1.4), c(4.5, 18, 1.4))] },
  'chart.bar': line(r(4, 13, 4, 7, 1), r(10, 8, 4, 12, 1), r(16, 4, 4, 16, 1)), // [orig]
  'chart.bar.fill': solid([r(4, 13, 4, 7, 1), r(10, 8, 4, 12, 1), r(16, 4, 4, 16, 1)]),
  'chart.line.uptrend.xyaxis': line(p('M3 3v16a2 2 0 0 0 2 2h16'), p('m7 15 4-4 3 3 6-6'), p('M16 8h4v4')), // [lucide] chart-line (adapted)
  ...pair('chart.pie', p('M21 12c.55 0 1-.45.95-1A10 10 0 0 0 13 2.05c-.55-.06-1 .4-1 .95v8a1 1 0 0 0 1 1z'), p('M21.21 15.89A10 10 0 1 1 8 2.83')), // [lucide]
};

/** Alternate names that resolve to the same artwork (SF names that differ only by naming era, common synonyms). */
export const builtinAliases: Record<string, string> = {
  'square.on.square': 'doc.on.doc',
  'square.on.square.fill': 'doc.on.doc.fill',
  'person.circle': 'person.crop.circle',
  'person.circle.fill': 'person.crop.circle.fill',
  'line.horizontal.3': 'line.3.horizontal',
  'line.horizontal.3.decrease': 'line.3.horizontal.decrease',
  icloud: 'cloud',
  'icloud.fill': 'cloud.fill',
  shippingbox: 'cube',
  'shippingbox.fill': 'cube.fill',
  gear: 'gearshape',
  'gear.fill': 'gearshape.fill',
  'location.north': 'location',
  'location.north.fill': 'location.fill',
  'arrow.backward': 'arrow.left',
  'arrow.forward': 'arrow.right',
  'bubble.right': 'bubble.left',
  'bubble.right.fill': 'bubble.left.fill',
};
