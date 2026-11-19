/**
 * Picker showcase: menu, inline, segmented, wheel (one and three columns), PickerRow in a List.
 * Open `/picker.html` (`?dark`, `?light`, `?fallback`).
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { List, LiquidRoot, ScrollView, Section, useLiquid } from '@liquid-gpu/react';
// The picker is not in the package barrel yet; import it from its folder.
import { Picker, PickerRow, WheelPicker, type PickerOption } from '../../../../packages/react/src/picker';
import { Section as DemoSection } from './controls';

const q = new URLSearchParams(location.search);

const flavors: PickerOption[] = [
  { value: 'chocolate', label: 'Chocolate' },
  { value: 'vanilla', label: 'Vanilla' },
  { value: 'strawberry', label: 'Strawberry' },
  { value: 'mint', label: 'Mint Chip' },
  { value: 'pistachio', label: 'Pistachio', disabled: true },
];
const sizes: PickerOption[] = [
  { value: 's', label: 'Small' },
  { value: 'm', label: 'Medium' },
  { value: 'l', label: 'Large' },
];
const hours = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
const minutes = Array.from({ length: 60 }, (_, i) => ({ value: i, label: String(i).padStart(2, '0') }));
const ampm = [
  { value: 'AM', label: 'AM' },
  { value: 'PM', label: 'PM' },
];
const fruits = ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry', 'Fig', 'Grape', 'Honeydew', 'Kiwi', 'Lemon', 'Mango', 'Nectarine'].map((l) => ({
  value: l.toLowerCase(),
  label: l,
}));

function Probe() {
  const ctx = useLiquid();
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__lqc = ctx;
    document.documentElement.dataset.ready = '1';
  }, [ctx]);
  return null;
}

function Demo() {
  const ctx = useLiquid();
  const [flavor, setFlavor] = useState('chocolate');
  const [size, setSize] = useState('m');
  const [fruit, setFruit] = useState('fig');
  const [h, setH] = useState(9);
  const [m, setM] = useState(41);
  const [p, setP] = useState('AM');
  return (
    <>
      <DemoSection id="menu" title={`Menu (default) · ${flavor}`}>
        <Picker label="Flavor" options={flavors} selection={flavor} onChange={setFlavor} />
        <Picker label="Size" options={sizes} defaultSelection="l" />
        <Picker label="Disabled" options={sizes} defaultSelection="s" disabled />
      </DemoSection>
      <DemoSection id="segmented" title={`Segmented · ${size}`}>
        <Picker pickerStyle="segmented" label="Size" options={sizes} selection={size} onChange={setSize} width={300} />
      </DemoSection>
      <DemoSection id="wheel" title={`Wheel · ${fruit}`}>
        <div style={{ width: '100%' }}>
          <Picker pickerStyle="wheel" label="Fruit" options={fruits} selection={fruit} onChange={setFruit} />
        </div>
      </DemoSection>
      <DemoSection id="wheel3" title={`WheelPicker columns · ${h}:${String(m).padStart(2, '0')} ${p}`}>
        <WheelPicker
          aria-label="Time"
          columns={[
            { options: hours, selection: h, onChange: setH, 'aria-label': 'Hour', align: 'right' },
            { options: minutes, selection: m, onChange: setM, 'aria-label': 'Minute' },
            { options: ampm, selection: p, onChange: setP, 'aria-label': 'AM/PM', align: 'left' },
          ]}
        />
      </DemoSection>
      <List aria-label="Form">
        <Section header="In a List">
          <PickerRow label="Flavor" options={flavors} selection={flavor} onChange={setFlavor} />
          <PickerRow label="Size" options={sizes} selection={size} onChange={setSize} />
        </Section>
        <Picker pickerStyle="inline" label="Inline" footer="Inline pickers are radio groups." options={sizes} selection={size} onChange={setSize} />
      </List>
      <div style={{ height: 40 + ctx.safeArea.bottom }} />
    </>
  );
}

function Page() {
  const appearance = q.has('dark') ? 'dark' : q.has('light') ? 'light' : 'system';
  return (
    <LiquidRoot appearance={appearance} safeArea={{ top: 62, bottom: 34 }}>
      <Probe />
      <ScrollView style={{ height: '100%', background: 'var(--lq-system-grouped-background)' }}>
        <div style={{ paddingTop: 62 }}>
          <h1 className="lq-large-title" style={{ margin: '0 0 12px 20px', fontWeight: 700 }}>
            Picker
          </h1>
          <Demo />
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
