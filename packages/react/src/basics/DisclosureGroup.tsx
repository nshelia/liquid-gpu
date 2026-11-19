/**
 * DisclosureGroup (BL = uikit-internals/deep/demo-audit/basics, measured per frame with real taps).
 *
 * Standalone (BL static-standalone, anim-standalone-*): a full-width header 28.33 tall, title Body in the tint at +4,
 * chevron.right 7 × 12 in label colour, right edge 0.67 in, rotating to 90° about a pivot 1 pt left of its centre.
 * Content follows directly, centred. Tap: title and chevron drop to opacity 0.2 at touch-down and spring back on
 * release; expanding mounts the content at once and reveals it with a top-anchored clip whose height (and the
 * content below) runs on Animation.default (ζ 1, 0.5 s); collapsing removes it at once and closes the gap on the
 * same spring. The chevron uses the same spring.
 *
 * In a List (BL static-list, anim-list-*): a 52 pt row, title in label colour, the same chevron at the row's trailing
 * margin; the row highlights systemGray4 while held. Child rows are indented +20 (separator too); they appear and
 * vanish in place with an opacity fade while the rows below slide, both on ζ 1 / 0.3 s.
 */
import { useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useSpring } from '../root/useSpring';
import { DisclosureChevron } from './icons';
import { CHEVRON, chevronTransform, clamp01, disclosureListSpring, disclosureSpring, revealHeight } from './logic';
import { BasicRow, BODY_LINE, bodyText, RowIndentContext, useBasicsCss, usePressOpacity } from './shared';

export interface DisclosureGroupProps {
  label: ReactNode;
  children?: ReactNode;
  /** Controlled state; pair with `onExpandedChange`. */
  isExpanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?(expanded: boolean): void;
  style?: CSSProperties;
}

function useExpanded(p: DisclosureGroupProps): [boolean, () => void] {
  const [inner, setInner] = useState(p.defaultExpanded ?? false);
  const open = p.isExpanded ?? inner;
  return [
    open,
    () => {
      if (p.isExpanded === undefined) setInner(!open);
      p.onExpandedChange?.(!open);
    },
  ];
}

/** `initial` is the mount-time state only: afterwards the springs own `transform` (React must not rewrite it). */
function Chevron({ refEl, initial }: { refEl: RefObject<SVGSVGElement | null>; initial: boolean }) {
  return (
    <DisclosureChevron
      ref={refEl}
      style={{
        flex: 'none',
        marginRight: 0.667,
        marginTop: -0.333,
        color: 'var(--lq-label)',
        transformOrigin: `${CHEVRON.originX}px ${CHEVRON.originY}px`,
        transform: chevronTransform(initial ? 1 : 0),
      }}
    />
  );
}

export function DisclosureGroup(props: DisclosureGroupProps) {
  const { label, children, style } = props;
  const [open, toggle] = useExpanded(props);
  const [initial] = useState(open);
  const headerRef = useRef<HTMLButtonElement | null>(null);
  const titleRef = useRef<HTMLSpanElement | null>(null);
  const chevRef = useRef<SVGSVGElement | null>(null);
  const clipRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const height = useRef(0);
  usePressOpacity(headerRef, [titleRef, chevRef as unknown as RefObject<HTMLElement | null>]);

  const progress = useSpring(open ? 1 : 0, disclosureSpring, (v, s) => {
    if (chevRef.current) chevRef.current.style.transform = chevronTransform(v);
    const clip = clipRef.current;
    if (clip) clip.style.height = s.target === 1 && Math.abs(v - 1) < 1e-4 ? '' : `${revealHeight(v, height.current)}px`;
  });

  useLayoutEffect(() => {
    if (open && contentRef.current) height.current = contentRef.current.getBoundingClientRect().height;
    if (progress.target === (open ? 1 : 0)) return;
    // Pin the clip before paint: the content was just (un)mounted and an auto height would jump for a frame.
    if (clipRef.current) clipRef.current.style.height = `${revealHeight(progress.value, height.current)}px`;
    progress.set(open ? 1 : 0);
  }, [open, progress]);

  return (
    <div style={{ width: '100%', color: 'var(--lq-label)', ...style }}>
      <button
        ref={headerRef}
        type="button"
        aria-expanded={open}
        onClick={toggle}
        style={{ display: 'flex', alignItems: 'center', width: '100%', height: 28.333, padding: 0, ...bodyText, textAlign: 'left' }}
      >
        <span ref={titleRef} style={{ flex: '1 1 auto', color: 'var(--lq-tint)', height: BODY_LINE, whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <Chevron refEl={chevRef} initial={initial} />
      </button>
      <div ref={clipRef} style={{ overflow: 'hidden', height: initial ? undefined : 0 }}>
        {open && (
          <div ref={contentRef} style={{ ...bodyText, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

/** DisclosureGroup inside an inset-grouped `Section`: pass rows (`LabeledContentRow`, `BasicRow`, …) as children. */
export function DisclosureGroupRow(props: DisclosureGroupProps) {
  useBasicsCss();
  const { label, children } = props;
  const [open, toggle] = useExpanded(props);
  const [initial] = useState(open);
  const indent = useContext(RowIndentContext);
  const [present, setPresent] = useState(open);
  const chevRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const height = useRef(0);

  const chevron = useSpring(open ? 1 : 0, disclosureSpring, (v) => {
    if (chevRef.current) chevRef.current.style.transform = chevronTransform(v);
  });
  const rows = useSpring(open ? 1 : 0, disclosureListSpring, (v, s) => {
    const w = wrapRef.current;
    if (w) {
      const done = Math.abs(v - s.target) < 1e-3;
      w.style.height = s.target === 1 && done ? '' : `${revealHeight(v, height.current)}px`;
      w.style.opacity = s.target === 1 && done ? '' : String(clamp01(v));
    }
    if (s.target === 0 && Math.abs(v) < 1e-3) setPresent(false);
  });

  if (open && !present) setPresent(true);

  useLayoutEffect(() => {
    const w = wrapRef.current;
    if (open && w) {
      // Measure the natural height before the first animated frame.
      w.style.height = '';
      height.current = w.getBoundingClientRect().height;
      if (rows.value < 1) {
        w.style.height = `${revealHeight(rows.value, height.current)}px`;
        w.style.opacity = String(clamp01(rows.value));
      }
    }
    const t = open ? 1 : 0;
    if (chevron.target !== t) chevron.set(t);
    if (rows.target !== t) rows.set(t);
  }, [open, present, chevron, rows]);

  return (
    <>
      <BasicRow onPress={toggle} aria-expanded={open}>
        <span style={{ flex: '1 1 auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        <Chevron refEl={chevRef} initial={initial} />
      </BasicRow>
      {present && (
        <div ref={wrapRef} className="lq-dg-children" role="group">
          <RowIndentContext.Provider value={indent + 20}>{children}</RowIndentContext.Provider>
        </div>
      )}
    </>
  );
}
