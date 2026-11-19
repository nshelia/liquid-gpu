/**
 * Showcase of `packages/react/src/inputs`: TextEditor, ColorWell / ColorPicker, Toggle / ToggleGroup,
 * CheckmarkToggle, Rating, Tooltip, OneTimeCodeField. Open `/inputs.html` (`?dark`, `?light`, `?fallback`).
 */
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, LiquidRoot, ScrollView } from '@liquid-gpu/react';
import {
  CheckmarkToggle,
  ColorPicker,
  ColorWell,
  OneTimeCodeField,
  Rating,
  TextEditor,
  Toggle,
  ToggleGroup,
  Tooltip,
} from '../../../../packages/react/src/inputs';

const q = new URLSearchParams(location.search);

function Section({ title, children, column }: { title: string; children: ReactNode; column?: boolean }) {
  return (
    <section style={{ margin: '0 16px 22px' }}>
      <h2 className="lq-footnote" style={{ margin: '0 20px 7px', textTransform: 'uppercase', color: 'var(--lq-secondary-label)', fontWeight: 400 }}>
        {title}
      </h2>
      <div
        style={{
          borderRadius: 26,
          padding: 16,
          display: 'flex',
          flexDirection: column ? 'column' : 'row',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: column ? 'stretch' : 'center',
          background: 'var(--lq-secondary-system-grouped-background)',
          ['cornerShape' as string]: 'squircle',
        }}
      >
        {children}
      </div>
    </section>
  );
}

const Bold = () => <b style={{ fontSize: 17, width: 17, textAlign: 'center' }}>B</b>;
const Italic = () => <i style={{ fontSize: 17, width: 17, textAlign: 'center', fontFamily: 'Georgia, serif' }}>I</i>;
const Under = () => <u style={{ fontSize: 17, width: 17, textAlign: 'center' }}>U</u>;

function Inputs() {
  const [notes, setNotes] = useState('');
  const [color, setColor] = useState('#FF383C');
  const [rating, setRating] = useState(3.5);
  const [code, setCode] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [align, setAlign] = useState<string | null>('left');
  const [styles, setStyles] = useState<string[]>(['bold']);
  const [checks, setChecks] = useState({ milk: true, eggs: false });
  return (
    <>
      <Section title="Text editor" column>
        <TextEditor placeholder="Notes (plain, UITextView)" value={notes} onChange={setNotes} aria-label="Notes" />
        <TextEditor variant="roundedRect" placeholder="Bio (roundedRect, 2–5 lines)" minLines={2} maxLines={5} showCount maxLength={140} aria-label="Bio" />
        <TextEditor variant="roundedRect" defaultValue="Disabled" minLines={1} disabled aria-label="Disabled" />
      </Section>
      <Section title="Color">
        <ColorWell value={color} onChange={setColor} aria-label="Accent" />
        <ColorWell defaultValue="#34C759" />
        <span className="lq-footnote" style={{ color: 'var(--lq-secondary-label)' }}>{color}</span>
        <div style={{ width: '100%' }}>
          <ColorPicker label="Background" value={color} onChange={setColor} />
        </div>
      </Section>
      <Section title="Toggle">
        <Toggle aria-label="Bold" icon={<Bold />} />
        <Toggle defaultOn variant="plain">Plain</Toggle>
        <Toggle defaultOn variant="tinted">Tinted</Toggle>
        <Toggle variant="glass">Glass</Toggle>
        <Toggle defaultOn variant="glass">Glass on</Toggle>
        <Toggle disabled>Disabled</Toggle>
      </Section>
      <Section title="Toggle group">
        <ToggleGroup
          type="single"
          aria-label="Alignment"
          value={align}
          onChange={setAlign}
          items={[
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right', label: 'Right' },
          ]}
        />
        <ToggleGroup
          type="multiple"
          aria-label="Text style"
          variant="tinted"
          size="small"
          value={styles}
          onChange={setStyles}
          items={[
            { value: 'bold', icon: <Bold />, 'aria-label': 'Bold' },
            { value: 'italic', icon: <Italic />, 'aria-label': 'Italic' },
            { value: 'underline', icon: <Under />, 'aria-label': 'Underline' },
          ]}
        />
        <span className="lq-footnote" style={{ color: 'var(--lq-secondary-label)' }}>
          {align ?? 'none'} · {styles.join(', ') || 'none'}
        </span>
      </Section>
      <Section title="Checkmark toggle" column>
        <CheckmarkToggle label="Milk" isOn={checks.milk} onChange={(milk) => setChecks({ ...checks, milk })} />
        <CheckmarkToggle label="Eggs" isOn={checks.eggs} onChange={(eggs) => setChecks({ ...checks, eggs })} />
        <CheckmarkToggle label="Orange tint" defaultOn tint="var(--lq-system-orange)" />
        <CheckmarkToggle label="Disabled" disabled />
      </Section>
      <Section title="Rating">
        <Rating value={rating} onChange={setRating} allowHalf aria-label="Your rating" />
        <span className="lq-footnote" style={{ color: 'var(--lq-secondary-label)' }}>{rating}</span>
        <Rating defaultValue={4} tint="var(--lq-system-yellow)" size={28} />
        <Rating value={4.5} allowHalf readOnly size={14} />
      </Section>
      <Section title="Tooltip (hover / long-press)">
        <Tooltip text="Share this page">
          <Button variant="glass">Hover me</Button>
        </Tooltip>
        <Tooltip text="Below when preferred" placement="bottom">
          <Button variant="tinted">Bottom</Button>
        </Tooltip>
      </Section>
      <Section title="One-time code" column>
        <OneTimeCodeField
          value={code}
          onChange={(c) => {
            setCode(c);
            setDone(null);
          }}
          onComplete={setDone}
          groupSize={3}
          aria-label="Verification code"
        />
        <span className="lq-footnote" style={{ color: 'var(--lq-secondary-label)' }}>
          {done ? `Complete: ${done}` : `Code: ${code || '—'} (try pasting 123456)`}
        </span>
        <OneTimeCodeField length={4} numeric={false} secure aria-label="PIN" />
      </Section>
    </>
  );
}

function Page() {
  const [dark, setDark] = useState(q.has('dark') ? true : q.has('light') ? false : matchMedia('(prefers-color-scheme: dark)').matches);
  return (
    <LiquidRoot appearance={dark ? 'dark' : 'light'} safeArea={{ top: 62, bottom: 34 }}>
      <ScrollView style={{ height: '100%', background: 'var(--lq-system-grouped-background)' }}>
        <div style={{ paddingTop: 62, paddingBottom: 80 }}>
          <div style={{ display: 'flex', alignItems: 'center', margin: '0 20px 12px' }}>
            <h1 className="lq-large-title" style={{ margin: 0, fontWeight: 700, flex: 1 }}>
              Inputs
            </h1>
            <button type="button" className="lq-body" style={{ color: 'var(--lq-tint)', background: 'none', border: 'none' }} onClick={() => setDark(!dark)}>
              {dark ? 'Light' : 'Dark'}
            </button>
          </div>
          <Inputs />
        </div>
      </ScrollView>
    </LiquidRoot>
  );
}

export function mount(el: HTMLElement): void {
  createRoot(el).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}
