/**
 * Messages-style chat: pure geometry, colours and timing measured on the iOS 27 simulator
 * (uikit-internals/deep/demo-audit/chat: raw/chatprobe-balloons-light.txt, chatprobe-dump-seeded-*.jsonl,
 * send2-nokb / sendlong / incoming1 trk.jsonl, tools/fit2.py). All values are points at the 440 pt wide window.
 */

/** Bubble corner radius (`bubblePath.cornerRadius` = half the single-line body height). */
export const BUBBLE_RADIUS = 20.1436;
/** Continuous-corner extent along an edge (iOS squircle: 1.52866 r). */
export const CORNER_EXTENT = 1.52866 * BUBBLE_RADIUS;
/** Tail depth below the body (`tailInsets.bottom`). */
export const TAIL_INSET = 6.8337;

export const CHAT = {
  /** Body height of one line: 10 + 20.287 + 10; every further line adds 20. */
  lineHeight: 20,
  firstLine: 20.287,
  textInsetY: 10,
  /** Text starts 14 pt in from the body edge (text view x 9 + lineFragmentPadding 5), same on the right. */
  textInsetX: 14,
  sideMargin: 20,
  /** Widest bubble at a 440 pt transcript (wrapped text view 292.67 + 18). */
  maxBubbleWidth: 310.667,
  /** Gap between bodies of the same sender / different senders (cell pitch 40.287 + 4 / + 10). */
  groupGap: 4,
  senderGap: 10,
  /** Timestamp header: 13.33 from the content top, 13.33 tall, 7 above the first bubble. Medium 11. */
  headerTop: 13.333,
  headerHeight: 13.333,
  headerGap: 7,
  /** "Delivered": 6 below the body, 13.33 tall, right edge 20 in from the bubble edge. Semibold 11. */
  statusGap: 6,
  statusHeight: 13.333,
  statusInset: 20,
  /** Content padding below the last row. */
  bottomPad: 16,
  /** Navigation header: content inset top 157.33 (bar 62 + 95.33); scroll edge effect 197.33 tall. */
  headerInset: 157.333,
  edgeTop: 197.333,
  /** Entry bar (no keyboard): 69 tall over the bottom; field 332 × 40.33 at (80, 887.67), r 20. */
  entryHeight: 69,
  fieldX: 80,
  fieldTopFromBottom: 68.333,
  fieldHeight: 40.333,
  fieldRadius: 20,
  plusX: 28,
  plusSize: 40,
  /** Text view starts 11 pt in, lineFragmentPadding 5 → text at 16; it ends 44.33 before the field's right edge. */
  fieldTextLeft: 16,
  fieldTextRight: 49.333,
  /** Send button: 38 × 28 capsule, 6.33 from the field's right and bottom edges, systemBlue. */
  sendWidth: 38,
  sendHeight: 28,
  sendInset: 6.333,
  /** The outgoing gradient spans this many points from the window top (CKGradientReferenceView minus the entry view). */
  gradientHeight: 887,
} as const;

/** Body height for `lines` lines of 17 pt text. */
export function bodyHeight(lines: number): number {
  return CHAT.textInsetY * 2 + CHAT.firstLine + CHAT.lineHeight * Math.max(0, lines - 1);
}

/** Bubble width for a text whose widest line is `textWidth` (rounded up to 1/3 pt like UIKit). */
export function bubbleWidth(textWidth: number): number {
  return Math.min(CHAT.maxBubbleWidth, Math.ceil((textWidth + 2 * CHAT.textInsetX) * 3 - 0.01) / 3);
}

// --- Bubble path -------------------------------------------------------------------------------------------------

type Pt = [number, number];

/**
 * Half of a continuous corner in units of r, as (across, along) distances from the corner: the end point on the
 * edge, its two controls, the joint and the joint's outer control. UIKit limits each half separately by the room on
 * its edge (extent k·r, 1 ≤ k ≤ 1.52866) and the points move linearly in k between the pill shape (k = 1) and the
 * unlimited squircle; verified on three measured `bubblePath`s (k = 1, 1.2328, 1.52866) to < 0.001 r.
 */
const HALF_STD: Pt[] = [[0, 1.52866], [0, 1.08849], [0, 0.8684], [0.07491, 0.63149], [0.16906, 0.37282]];
const HALF_PILL: Pt[] = [[0, 1], [0, 0.87326], [0.02409, 0.74767], [0.071, 0.62994], [0.17264, 0.37477]];
const K_MAX = 1.52866;

function half(k: number): Pt[] {
  const t = (k - 1) / (K_MAX - 1);
  return HALF_PILL.map((p, i) => [p[0] + (HALF_STD[i]![0] - p[0]) * t, i === 0 ? k : p[1] + (HALF_STD[i]![1] - p[1]) * t]);
}

/** Corner from the vertical edge to the horizontal edge as (dx, dy) from the corner, r = 1. */
function corner(kx: number, ky: number): Pt[] {
  const v = half(ky);
  const h = half(kx);
  return [v[0]!, v[1]!, v[2]!, v[3]!, v[4]!, [h[4]![1], h[4]![0]], [h[3]![1], h[3]![0]], [h[2]![1], h[2]![0]], [h[1]![1], h[1]![0]], [h[0]![1], 0]];
}

/**
 * The tail, relative to (edge x, body bottom) on the tail side, x measured inwards: from the end of the straight
 * side to the start of the straight bottom (`bubblePath` of a tailed balloon, identical for every size).
 */
const TAIL: Pt[] = [
  [0, -15.8065], [1.4251, -11.5844], [4.0568, -8.1338],
  [5.1232, -6.7358], [6.3545, -5.5035], [7.715, -4.4552],
  [9.6538, -2.9434], [10.4928, -1.3661], [10.4928, 0.4065],
  [10.4928, 1.598], [10.2823, 2.7754], [8.5711, 5.0234],
  [7.7502, 6.1011], [8.5741, 7.2009], [9.8572, 6.7134],
  [12.4961, 5.7113], [15.5015, 3.8873], [18.1342, 1.9404],
  [20.493, 0.196], [21.1215, 0.0197], [22.2284, 0.0127],
];

export type TailSide = 'left' | 'right' | null;

const f = (n: number) => String(Math.round(n * 1000) / 1000);

/**
 * SVG path of a message bubble whose body is `w` × `h` at the origin; with a tail the shape extends `TAIL_INSET`
 * below `h` on the `tail` side. Matches `CKBalloonView.bubblePath` to < 0.1 pt.
 */
export function bubblePath(w: number, h: number, tail: TailSide = null): string {
  const r = BUBBLE_RADIUS;
  const kx = Math.min(K_MAX, w / 2 / r);
  const ky = Math.min(K_MAX, h / 2 / r);
  const c = corner(kx, ky).map(([x, y]) => [x * r, y * r] as Pt);
  // A corner placed at (cx, cy) with inward signs (sx, sy); `rev` walks it from the horizontal edge to the vertical one.
  const at = (cx: number, cy: number, sx: number, sy: number, rev: boolean): Pt[] => {
    const pts = c.map(([x, y]) => [cx + sx * x, cy + sy * y] as Pt);
    return rev ? pts.reverse() : pts;
  };
  const out: string[] = [];
  const path = (pts: Pt[]) => {
    out.push(`L${f(pts[0]![0])} ${f(pts[0]![1])}`);
    for (let i = 1; i + 2 < pts.length; i += 3) out.push(`C${pts.slice(i, i + 3).map((p) => `${f(p[0])} ${f(p[1])}`).join(' ')}`);
  };
  const tailPts = (sx: number, ox: number): Pt[] => [[ox, h - ky * r], ...TAIL.map(([x, y]) => [ox + sx * x, h + y] as Pt)];
  // Clockwise from the left edge: top-left, top-right, bottom-right (or right tail), bottom-left (or left tail).
  path(at(0, 0, 1, 1, false));
  path(at(w, 0, -1, 1, true));
  path(tail === 'right' ? tailPts(-1, w) : at(w, h, -1, -1, false));
  path(tail === 'left' ? tailPts(1, 0).reverse() : at(0, h, 1, -1, true));
  out[0] = 'M' + out[0]!.slice(1);
  out.push('Z');
  return out.join('');
}

// --- Colours ---------------------------------------------------------------------------------------------------

type RGB = [number, number, number];

/**
 * Outgoing bubble fill: a vertical gradient fixed to the window (0 … 887 pt), sampled from the simulator
 * (raw/tall-*.png column at x 122 every 25 pt; ends extrapolated; light ends at #0088FF).
 */
export const OUTGOING_STOPS: Record<'light' | 'dark', Array<[number, RGB]>> = {
  light: [
    [0, [92, 200, 250]], [150, [78, 189, 251]], [250, [69, 182, 251]], [350, [61, 175, 252]], [450, [52, 168, 253]],
    [550, [42, 161, 253]], [650, [32, 153, 253]], [750, [20, 146, 254]], [831, [8, 140, 254]], [887, [0, 136, 255]],
  ],
  dark: [
    [0, [66, 155, 254]], [150, [56, 154, 254]], [250, [50, 153, 255]], [350, [44, 152, 255]], [450, [38, 151, 255]],
    [550, [31, 149, 255]], [650, [23, 148, 255]], [750, [14, 147, 255]], [831, [5, 145, 255]], [887, [0, 144, 255]],
  ],
};

/** Incoming bubble fill (#E9E9EB / #262629) and text colours. */
export const BUBBLE_COLORS = {
  light: { incoming: '#E9E9EB', incomingText: '#000000', outgoingText: '#FFFFFF', send: '#0088FF' },
  dark: { incoming: '#262629', incomingText: '#FFFFFF', outgoingText: '#FFFFFF', send: '#0088FF' },
} as const;

/** CSS linear-gradient for the outgoing fill, to be sized `100% 887px` and positioned at the bubble's window y. */
export function outgoingGradient(appearance: 'light' | 'dark'): string {
  const stops = OUTGOING_STOPS[appearance].map(([y, [r, g, b]]) => `rgb(${r},${g},${b}) ${y}px`);
  return `linear-gradient(to bottom, ${stops.join(', ')})`;
}

/** Outgoing colour at window y (for tests and the CSS fallback of a flying bubble). */
export function outgoingColor(appearance: 'light' | 'dark', y: number): RGB {
  const s = OUTGOING_STOPS[appearance];
  if (y <= s[0]![0]) return s[0]![1];
  for (let i = 1; i < s.length; i++) {
    const [y1, c1] = s[i]!;
    const [y0, c0] = s[i - 1]!;
    if (y <= y1) {
      const t = (y - y0) / (y1 - y0);
      return [0, 1, 2].map((k) => Math.round(c0[k]! + (c1[k]! - c0[k]!) * t)) as RGB;
    }
  }
  return s[s.length - 1]![1];
}

/** Avatar monogram gradient (top → bottom), sampled from the simulator header. */
export const AVATAR_GRADIENT = {
  light: 'linear-gradient(to bottom, #A7C1DF, #7883BC)',
  dark: 'linear-gradient(to bottom, #554F66, #362C4D)',
} as const;

// --- Timing ----------------------------------------------------------------------------------------------------

/** CSS cubic-bezier(x1, y1, x2, y2) at progress x. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let lo = 0;
  let hi = 1;
  let u = x;
  for (let i = 0; i < 30; i++) {
    u = (lo + hi) / 2;
    const bx = 3 * x1 * u * (1 - u) ** 2 + 3 * x2 * u * u * (1 - u) + u ** 3;
    if (bx < x) lo = u;
    else hi = u;
  }
  u = (lo + hi) / 2;
  return 3 * y1 * u * (1 - u) ** 2 + 3 * y2 * u * u * (1 - u) + u ** 3;
}

/** Progress (0 → 1) of a spring released from rest at t = 0 (mass 1, ω = 2π/response). */
export function springProgress(t: number, response: number, dampingRatio: number): number {
  if (t <= 0) return 0;
  const w = (2 * Math.PI) / response;
  const z = dampingRatio;
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w * t) * (1 + w * t);
}

export interface Curve {
  (t: number): number;
  duration: number;
}

const bezierCurve = (x1: number, y1: number, x2: number, y2: number, duration: number): Curve =>
  Object.assign((t: number) => cubicBezier(x1, y1, x2, y2, t / duration), { duration });

/**
 * Measured curves (tools/fit2.py, fit3.py; max error in parentheses):
 * - `update`: transcript batch update: content offset, moved rows, inserted-row fade-in (0.18 pt / 0.002).
 * - `fadeOut`: a removed "Delivered" label: CSS `ease`, 0.25 s (0.0005).
 * - `scroll`: incoming message: `setContentOffset(animated:)`, sin² over 0.3 s (0.23 pt, pixel-rounded data).
 * - `sendWidth`: the flying bubble's bounds width, field width → bubble width (0.42 pt).
 * - `sendScale`: phase 1 of its scale, 1 → `sendMinScale` (< 0.001).
 */
export const curves = {
  update: bezierCurve(0.261, 1.024, 0.367, 0.987, 0.4365),
  fadeOut: bezierCurve(0.25, 0.1, 0.25, 1, 0.25),
  scroll: Object.assign((t: number) => (t >= 0.3 ? 1 : Math.sin(((t / 0.3) * Math.PI) / 2) ** 2), { duration: 0.3 }),
  sendWidth: bezierCurve(0.5253, 0.1499, 0.5707, 0.9553, 0.1773),
  sendScale: bezierCurve(0.3936, 0.3536, 0.5998, 0.7497, 0.1771),
};

/**
 * The flying bubble (fit3.py, t = 0 at the first frame that shows it): right edge on a spring that started 18.8 ms
 * earlier (0.15 pt), vertical centre on a like spring 35 ms later (0.02 pt), bounds width and scale phase 1 from
 * ≈ 0, the scale held at its minimum until 0.184 s, then a spring back to 1 (< 0.001).
 */
export const SEND = {
  x: { response: 0.5231, dampingRatio: 0.7307, delay: -0.0188 },
  y: { response: 0.5273, dampingRatio: 0.7288, delay: 0.0352 },
  widthDelay: -0.0016,
  scaleDelay: -0.0012,
  scaleHoldUntil: 0.1842,
  scale: { response: 0.5044, dampingRatio: 0.7595 },
  /** The flying bubble is replaced by the transcript cell after this long. */
  duration: 0.99,
} as const;

/** Lowest scale of the flying bubble: 0.7754 for a 47.12 pt bubble, 0.7891 for 67.12 pt (linear in between). */
export function sendMinScale(height: number): number {
  return Math.max(0.77, Math.min(0.85, 0.7754 + (height - 47.121) * 0.000685));
}

export interface SendFrame {
  /** Visual rect of the flying bubble (window coordinates, scale applied). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Unscaled bounds width (the path is drawn at this width) and the scale. */
  boundsWidth: number;
  scale: number;
}

export interface SendGeometry {
  /** Field rect at the send (window coordinates). */
  from: { right: number; top: number; width: number };
  /** Final bubble: right edge, top, body width and full height (body + tail). */
  to: { right: number; top: number; width: number; height: number };
}

/** The flying bubble at time t (see `SEND`): anchored at its right edge and vertical centre, path drawn at `boundsWidth`. */
export function sendFrame(g: SendGeometry, t: number): SendFrame {
  const H = g.to.height;
  const p = springProgress(t - SEND.x.delay, SEND.x.response, SEND.x.dampingRatio);
  const py = springProgress(t - SEND.y.delay, SEND.y.response, SEND.y.dampingRatio);
  const right = g.from.right + (g.to.right - g.from.right) * p;
  const cy0 = g.from.top + H / 2;
  const cy = cy0 + (g.to.top + H / 2 - cy0) * py;
  const boundsWidth = g.from.width + (g.to.width - g.from.width) * curves.sendWidth(t - SEND.widthDelay);
  const smin = sendMinScale(H);
  const scale =
    t < SEND.scaleHoldUntil
      ? 1 + (smin - 1) * curves.sendScale(t - SEND.scaleDelay)
      : smin + (1 - smin) * springProgress(t - SEND.scaleHoldUntil, SEND.scale.response, SEND.scale.dampingRatio);
  const w = boundsWidth * scale;
  const h = H * scale;
  return { x: right - w, y: cy - h / 2, width: w, height: h, boundsWidth, scale };
}
