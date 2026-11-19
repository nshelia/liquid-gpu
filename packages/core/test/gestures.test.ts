import { describe, expect, it } from 'vitest';
import {
  PopGestureTracker,
  contextMenuLiftScale,
  flexPressScale,
  flexSprings,
  flexTransform,
  popShouldFinish,
  popThreshold,
  refreshShouldTrigger,
  refreshSnappingHeight,
  resolveFlexSpec,
  sheetProjectedPoint,
  sheetReleaseSpring,
  sheetReleaseTarget,
  sheetScrollHandoff,
  swipeActionOffset,
  swipeActionRelease,
  swipeActionRubberBand,
  swipeActionShouldConfirm,
  swipeConfirmationThreshold,
} from '../src/gestures';
import { springs } from '../src/springs';

describe('interactive pop (gestures §3, transitions §2)', () => {
  it('threshold = min(187.5/W, 0.5): 0.4261 at 440 pt', () => {
    expect(popThreshold(440)).toBeCloseTo(0.4261, 4);
    expect(popThreshold(300)).toBe(0.5);
  });

  const proj = (p: number, projected: number) => (projected - p) / 0.35; // v̄ that projects p to `projected` with ā 0

  it('slow brackets at 60 pt/s: p 0.409 cancels (proj 0.419), p 0.432 finishes (proj 0.446)', () => {
    expect(popShouldFinish(0.409, proj(0.409, 0.419), 0, 440, 3)).toBe(false);
    expect(popShouldFinish(0.432, proj(0.432, 0.446), 0, 440, 3)).toBe(true);
  });

  it('deceleration cancels past halfway: p 0.503, ā −5.8 → cancel (proj 0.32); ā −3.6 → finish', () => {
    // v̄ chosen so the ā −5.8 case projects to the measured 0.32
    const v = (0.32 - 0.503 + 0.5 * 5.8 * 0.35 * 0.35) / 0.35;
    expect(popShouldFinish(0.503, v, -5.8, 440, 3)).toBe(false);
    expect(popShouldFinish(0.503, v, -3.6, 440, 3)).toBe(true);
  });

  it('transitions probes: 12% at 254 pt/s cancels; 38% at 0.27 widths/s finishes', () => {
    expect(popShouldFinish(0.12, 254 / 440, 0, 440, 3)).toBe(false);
    expect(popShouldFinish(0.38, 0.27, 0, 440, 3)).toBe(true);
  });

  it('fewer than 3 samples: finish iff v̄ > 0 (short flicks)', () => {
    expect(popShouldFinish(40 / 440, 818 / 440, 0, 440, 2)).toBe(true);
    expect(popShouldFinish(0.05, 0, 0, 440, 2)).toBe(false);
  });

  it('tracker: 3-sample means, ±5 acceleration clamp, edge-flick boost ×4.25', () => {
    const t = new PopGestureTracker(440);
    for (let i = 0; i <= 10; i++) t.add(i / 60, (i * 760) / 60);
    expect(t.velocity).toBeCloseTo(760 / 440, 9);
    expect(t.acceleration).toBeCloseTo(0, 9);
    expect(t.inEdgeFlickPhase).toBe(true);
    expect(t.releaseVelocity()).toBeCloseTo((760 / 440) * 4.25, 9); // logged 7.3585
    const j = new PopGestureTracker(440);
    j.add(0, 0);
    j.add(0.02, 0);
    j.add(0.04, 200); // huge jump: acceleration clamps to +5
    expect(j.acceleration).toBe(5);
  });

  it('tracker ignores samples closer than 1 ms', () => {
    const t = new PopGestureTracker(440);
    t.add(0, 0);
    t.add(0.0005, 10);
    expect(t.samples).toBe(0);
    t.add(0.005, 0); // < 0.01 s and no movement since the last accepted point
    expect(t.samples).toBe(0);
  });
});

describe('sheet release (gestures §4)', () => {
  const largeOnly = [62, 956];
  const medium = [62, 440.4, 956];

  it('projection: 152 + 970.49 × 0.099 = 248.08; < 250 pt/s counts as 0', () => {
    expect(sheetProjectedPoint(152, 970.49)).toBeCloseTo(248.079, 3);
    expect(sheetProjectedPoint(300, 249)).toBe(300);
  });

  it('large-only, slow: 507 stays, 517 dismisses', () => {
    expect(sheetReleaseTarget(largeOnly, 507, 0)).toBe(62);
    expect(sheetReleaseTarget(largeOnly, 517, 0)).toBe(956);
  });

  it('large-only flicks: 970 / 992 pt/s stay; 1031 pt/s dismisses', () => {
    expect(sheetReleaseTarget(largeOnly, 248 - 970 * 0.099, 970)).toBe(62);
    expect(sheetReleaseTarget(largeOnly, 173 - 992 * 0.099, 992)).toBe(62);
    expect(sheetReleaseTarget(largeOnly, 254 - 1031 * 0.099, 1031)).toBe(956);
    expect(sheetReleaseTarget(largeOnly, 382 - 1360 * 0.099, 1360)).toBe(956);
  });

  it('medium: slow 685.4 stays, 700.4 dismisses', () => {
    expect(sheetReleaseTarget(medium, 685.4, 0)).toBe(440.4);
    expect(sheetReleaseTarget(medium, 700.4, 0)).toBe(956);
  });

  it('medium flicks: down 1400 dismisses (proj 614), up −1400 → large, up −594 stays', () => {
    expect(sheetReleaseTarget(medium, 614 - 1400 * 0.099, 1400)).toBe(956);
    expect(sheetReleaseTarget(medium, 440.4, -1400)).toBe(62);
    expect(sheetReleaseTarget(medium, 331.6 + 594 * 0.099, -594)).toBe(440.4);
    expect(sheetReleaseTarget(medium, 200.4, 0)).toBe(62);
    expect(sheetReleaseTarget(medium, 440.4 + 10, 590)).toBe(440.4);
  });

  it('|v| ≥ 1000 uses the high-speed spring', () => {
    expect(sheetReleaseSpring(1000)).toBe(springs.sheetHighSpeed);
    expect(sheetReleaseSpring(999)).toBe(springs.sheet);
  });
});

describe('sheet scroll hand-off (sheets §1)', () => {
  const base = { maxTopOffset: -74, canScroll: true, distanceToLargestDetent: 378.4, panVelocity: 500 };

  it('pull down at the top pins the content; sheet takes maxTop − uy', () => {
    const r = sheetScrollHandoff({ ...base, startOffset: -74, proposedOffset: -167.4 });
    expect(r.handoff).toBe(true);
    expect(r.scrollOffset).toBe(-74);
    expect(r.sheetTranslation).toBeCloseTo(93.4, 9);
    expect(r.zeroScrollVelocity).toBe(true);
  });

  it('push up at medium: the sheet saturates at −378.4 and the excess scrolls (content −12.4)', () => {
    const r = sheetScrollHandoff({ ...base, startOffset: -74, proposedOffset: -74 + 440, panVelocity: -500 });
    expect(r.sheetTranslation).toBeCloseTo(-378.4, 9);
    expect(r.scrollOffset).toBeCloseTo(-12.4, 9);
    expect(r.zeroScrollVelocity).toBe(false);
  });

  it('content that started scrolled never hands off', () => {
    const r = sheetScrollHandoff({ ...base, startOffset: 200, proposedOffset: -124 });
    expect(r.handoff).toBe(false);
    expect(r.scrollOffset).toBe(-124);
  });

  it('content that fits sends everything to the sheet; refresh control blocks', () => {
    expect(sheetScrollHandoff({ ...base, canScroll: false, startOffset: -74, proposedOffset: 0 }).sheetTranslation).toBe(-74);
    expect(sheetScrollHandoff({ ...base, hasRefreshControl: true, startOffset: -74, proposedOffset: -100 }).handoff).toBe(false);
  });

  it('decelerating scroll hands 0 velocity to the sheet', () => {
    const r = sheetScrollHandoff({ ...base, startOffset: -74, proposedOffset: -100, decelerating: true });
    expect(r.sheetVelocity).toBe(0);
  });
});

describe('swipe actions (gestures §1)', () => {
  it('tracking offset = translation − 25', () => {
    expect(swipeActionOffset(30)).toBe(5);
    expect(swipeActionOffset(160)).toBe(135);
    expect(swipeActionOffset(-50)).toBe(-25);
    expect(swipeActionOffset(10)).toBe(0);
  });

  it('slow release opens iff |offset| > 0.5 × |openThreshold|', () => {
    expect(swipeActionRelease(-73.7, -35, -156.67)).toBe('close');
    expect(swipeActionRelease(-78.4, -35, -156.67)).toBe('open');
    expect(swipeActionRelease(25.7, 35, 63)).toBe('close');
    expect(swipeActionRelease(31.6, 35, 63)).toBe('open');
  });

  it('fling (> 50 pt/s) opens in the open direction, closes otherwise', () => {
    expect(swipeActionRelease(-15, -120, -156.67)).toBe('open');
    expect(swipeActionRelease(-100, 120, -156.67)).toBe('close');
    expect(swipeActionRelease(-15, -120, -156.67, true)).toBe('confirm');
  });

  it('confirmation thresholds at 400 pt: −371 trailing, +210 leading', () => {
    expect(swipeConfirmationThreshold(400, 'trailing')).toBe(-371);
    expect(swipeConfirmationThreshold(400, 'leading')).toBeCloseTo(210, 9);
  });

  const trailing = (offset: number, fingerX: number, velocity: number) =>
    swipeActionShouldConfirm({ offset, fingerX, velocity, screenWidth: 440, confirmationThreshold: -371 });

  it('trailing full swipe: 90 pt edge zone and clamp(|v|/2500, 0.5, 0.75)', () => {
    expect(trailing(-190, 85, -40)).toBe(true); // 300→85 at 40 pt/s
    expect(trailing(-165, 60, -40)).toBe(false); // 250→60 slow
    expect(trailing(-175, 100, -40)).toBe(false); // 300→100: never in the zone
    expect(trailing(-255, 80, -40)).toBe(true); // 360→80 slow
    expect(trailing(-255, 80, -2600)).toBe(false); // 360→80 fast: 255 < 278
    expect(trailing(-295, 80, -2600)).toBe(true); // 400→80 fast
    expect(trailing(-225, 80, -2600)).toBe(false); // 330→80 fast
  });

  it('leading full swipe uses the full threshold (213 confirms, 195 does not)', () => {
    const lead = (offset: number) =>
      swipeActionShouldConfirm({ offset, fingerX: 278, velocity: 500, screenWidth: 440, confirmationThreshold: 210 });
    expect(lead(213)).toBe(true);
    expect(lead(195)).toBe(false);
  });

  it('rubber band past the end: limit + excess^0.7', () => {
    expect(swipeActionRubberBand(-400, -371)).toBeCloseTo(-(371 + 29 ** 0.7), 9);
    expect(swipeActionRubberBand(-300, -371)).toBe(-300);
  });
});

describe('pull to refresh (gestures §5)', () => {
  it('snapping height = round(h × 0.5) clamped to 189.349', () => {
    expect(refreshSnappingHeight(956)).toBe(189.349);
    expect(refreshSnappingHeight(300)).toBe(150);
  });

  it('fires only while tracking', () => {
    expect(refreshShouldTrigger(190.3, 189.349, true)).toBe(true);
    expect(refreshShouldTrigger(190.3, 189.349, false)).toBe(false);
    expect(refreshShouldTrigger(184.3, 189.349, true)).toBe(false);
  });
});

describe('flex press and drag stretch (glass-drag §2–4)', () => {
  it('press s₀ = (max + lift)/max', () => {
    expect(flexPressScale({ w: 44, h: 44 })).toBeCloseTo(1.363636, 6);
    expect(flexPressScale({ w: 100, h: 44 })).toBeCloseTo(1.16, 6);
    expect(flexPressScale({ w: 240, h: 80 })).toBeCloseTo(1.051149, 6);
    expect(flexPressScale({ w: 130, h: 130 })).toBeCloseTo(1.054642, 6);
    expect(flexPressScale({ w: 66, h: 34.33 })).toBeCloseTo(1.242424, 6);
  });

  it('T per size class: 2000 ultraSmall, 11586 at 240×80, 24000 large', () => {
    expect(resolveFlexSpec({ w: 44, h: 44 }).scaleDistanceThreshold).toBe(2000);
    expect(resolveFlexSpec({ w: 240, h: 80 }).scaleDistanceThreshold).toBeCloseTo(11586, 0);
    expect(resolveFlexSpec({ w: 300, h: 300 }).scaleDistanceThreshold).toBe(24000);
    expect(resolveFlexSpec({ w: 240, h: 80 }).liftScalePoints).toBeCloseTo(12.28, 2);
  });

  it('44×44, 40 pt drag → sx 1.375385, tx 0.711', () => {
    const f = flexTransform({ w: 44, h: 44 }, { x: 22, y: 22 }, { x: 62, y: 22 });
    expect(f.sx).toBeCloseTo(1.375385, 5);
    expect(f.sy).toBeCloseTo(1.363636 - 0.01175, 5);
    expect(f.tx).toBeCloseTo(0.711, 3);
    expect(f.ty).toBe(0);
  });

  it('240×80, 220 pt → sx 1.062368, tx 2.861', () => {
    const f = flexTransform({ w: 240, h: 80 }, { x: 120, y: 40 }, { x: 340, y: 40 });
    expect(f.sx).toBeCloseTo(1.062368, 5);
    expect(f.tx).toBeCloseTo(2.861, 3);
  });

  it('300×300, 220 pt → sx 1.017812, tx 1.368', () => {
    const f = flexTransform({ w: 300, h: 300 }, { x: 150, y: 150 }, { x: 370, y: 150 });
    expect(f.sx).toBeCloseTo(1.017812, 5);
    expect(f.tx).toBeCloseTo(1.368, 3);
  });

  it('a 45° drag on a square only translates', () => {
    const f = flexTransform({ w: 44, h: 44 }, { x: 22, y: 22 }, { x: 52, y: 52 });
    expect(f.sx).toBeCloseTo(f.sy, 12);
    expect(f.sx).toBeCloseTo(1.363636, 6);
    expect(f.tx).toBeGreaterThan(0);
    expect(f.ty).toBeGreaterThan(0);
  });

  it('no cap: 300 pt on 44 pt gives sy ≈ 1.505', () => {
    const f = flexTransform({ w: 44, h: 44 }, { x: 22, y: 22 }, { x: 22, y: 322 });
    expect(f.sy).toBeCloseTo(1.505, 2);
  });

  it('released → identity', () => {
    expect(flexTransform({ w: 44, h: 44 }, { x: 22, y: 22 }, { x: 62, y: 22 }, false)).toEqual({ sx: 1, sy: 1, tx: 0, ty: 0 });
  });

  it('springs interpolate by max dimension (u′)', () => {
    expect(flexSprings({ w: 44, h: 44 }).release).toEqual(springs.flexReleaseSmall);
    const big = flexSprings({ w: 300, h: 300 });
    expect(big.tracking.response).toBeCloseTo(0.314, 9);
    expect(big.release.dampingRatio).toBeCloseTo(0.6, 9);
    const mid = flexSprings({ w: 130, h: 80 }); // u′ = (130 − 44)/116
    expect(mid.release.dampingRatio).toBeCloseTo(0.375 + 0.225 * (86 / 116), 9);
  });
});

describe('context menu', () => {
  it('lift scale min(1.15, (w + 26)/w): 200 pt → 1.13', () => {
    expect(contextMenuLiftScale(200)).toBeCloseTo(1.13, 9);
    expect(contextMenuLiftScale(50)).toBe(1.15);
  });
});
