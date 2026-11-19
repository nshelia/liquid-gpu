/**
 * Basics showcase: DisclosureGroup, LabeledContent, GroupBox, Divider, Label, Link — standalone and as list rows.
 * Open `/basics.html` (`?dark`, `?page=standalone|list` for the native-comparison layouts, `?expanded`).
 * The comparison layouts mirror BasicsLab (uikit-internals/deep/demo-audit/basics/src/main.swift) point for point.
 */
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LiquidRoot, ScrollView } from '@liquid-gpu/react';
import { List, Section } from '../../../../packages/react/src/list/List';
import {
  BasicRow,
  DisclosureGroup,
  DisclosureGroupRow,
  Divider,
  GroupBox,
  Label,
  LabelRow,
  LabeledContent,
  LabeledContentRow,
  Link,
  LinkRow,
  StarFill,
} from '../../../../packages/react/src/basics';

const q = new URLSearchParams(location.search);
const expanded = q.has('expanded');
const star = <StarFill />;

function Standalone() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 24, width: 400, margin: '0 20px' }}>
      <Label title="Favorites" icon={star} />
      <div style={{ display: 'flex', gap: 24 }}>
        <Label title="Favorites" icon={star} labelStyle="iconOnly" />
        <Label title="Favorites" icon={star} labelStyle="titleOnly" />
        <Label title="Favorites" icon={star} />
      </div>
      <Link href="https://example.com">apple.com</Link>
      <span className="lq-body" style={{ lineHeight: '20.333px' }}>
        Visit{' '}
        <Link inline href="https://example.com">
          example
        </Link>{' '}
        now
      </span>
      <LabeledContent label="Version" value="27.0" />
      <Divider />
      <div className="lq-body" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 24 }}>
        <span>Left</span>
        <Divider vertical />
        <span>Right</span>
      </div>
      <GroupBox label="Group">Content inside a group box</GroupBox>
      <DisclosureGroup label="Advanced" defaultExpanded={expanded}>
        Hidden option
      </DisclosureGroup>
      <span className="lq-body" style={{ lineHeight: '20.333px' }}>
        Below
      </span>
    </div>
  );
}

function ListRows() {
  return (
    <List>
      <Section header="Basics">
        <LabeledContentRow label="Version" value="27.0" />
        <LabelRow title="Favorites" icon={star} />
        <LinkRow href="https://example.com">apple.com</LinkRow>
        <DisclosureGroupRow label="Advanced" defaultExpanded={expanded}>
          <BasicRow>Option A</BasicRow>
          <BasicRow>Option B</BasicRow>
        </DisclosureGroupRow>
        <LabeledContentRow label="Model" value="iPhone" />
      </Section>
      <Section>
        <BasicRow>
          <span>
            Visit{' '}
            <Link inline href="https://example.com">
              example
            </Link>{' '}
            now
          </span>
        </BasicRow>
        <LabelRow title="Title only" icon={star} labelStyle="titleOnly" />
      </Section>
    </List>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h2 className="lq-title2" style={{ margin: '28px 20px 16px', fontWeight: 700 }}>
      {children}
    </h2>
  );
}

function Page() {
  const page = q.get('page');
  const [dark, setDark] = useState(q.has('dark'));
  const appearance = dark ? 'dark' : 'light';
  if (page === 'standalone')
    return (
      <LiquidRoot appearance={appearance} safeArea={{ top: 62, bottom: 34 }}>
        <div style={{ position: 'absolute', inset: 0, paddingTop: 142, background: 'var(--lq-system-background)' }}>
          <Standalone />
        </div>
      </LiquidRoot>
    );
  if (page === 'list')
    return (
      <LiquidRoot appearance={appearance} safeArea={{ top: 62, bottom: 34 }}>
        {/* Card top at 102.33 like the native List (BL static-list). */}
        <div style={{ position: 'absolute', inset: 0, paddingTop: 47.04, background: 'var(--lq-system-grouped-background)' }}>
          <ListRows />
        </div>
      </LiquidRoot>
    );
  return (
    <LiquidRoot appearance={appearance} safeArea={{ top: 62, bottom: 34 }}>
      <ScrollView style={{ height: '100%', background: 'var(--lq-system-grouped-background)' }}>
        <div style={{ paddingTop: 62, paddingBottom: 60 }}>
          <div style={{ display: 'flex', alignItems: 'center', margin: '0 20px 12px' }}>
            <h1 className="lq-large-title" style={{ margin: 0, fontWeight: 700, flex: 1 }}>
              Basics
            </h1>
            <button type="button" className="lq-body" style={{ color: 'var(--lq-tint)' }} onClick={() => setDark(!dark)}>
              {dark ? 'Light' : 'Dark'}
            </button>
          </div>
          <Heading>Standalone</Heading>
          <div style={{ background: 'var(--lq-system-background)', padding: '24px 0' }}>
            <Standalone />
          </div>
          <Heading>In a List</Heading>
          <ListRows />
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
