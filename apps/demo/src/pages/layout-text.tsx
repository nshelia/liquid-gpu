/**
 * Layout + Text showcase: VStack / HStack / ZStack / Spacer / Grid and every Dynamic Type style.
 * Open `/layout-text.html` (`?dark` for dark appearance; the button toggles).
 */
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LiquidRoot, ScrollView } from '@liquid-gpu/react';
import { Grid, HStack, Spacer, VStack, ZStack } from '../../../../packages/react/src/layout';
import { Heading, TEXT_STYLES, Text } from '../../../../packages/react/src/text';

const q = new URLSearchParams(location.search);

function Card({ children }: { children: ReactNode }) {
  return (
    <VStack alignment="leading" spacing={12} padding="standard" maxWidth="infinity" background="secondarySystemGroupedBackground" cornerRadius={26}>
      {children}
    </VStack>
  );
}

function Box({ label, color = 'tint' }: { label: string; color?: string }) {
  return (
    <ZStack padding={10} background={color} cornerRadius={10}>
      <Text style="footnote" weight="semibold" color="white">
        {label}
      </Text>
    </ZStack>
  );
}

function Page() {
  const [dark, setDark] = useState(q.has('dark'));
  return (
    <LiquidRoot appearance={dark ? 'dark' : 'light'} safeArea={{ top: 62, bottom: 34 }}>
      <ScrollView style={{ height: '100%', background: 'var(--lq-system-grouped-background)' }}>
        <VStack alignment="leading" spacing={20} padding="margins" maxWidth="infinity" style={{ paddingTop: 62, paddingBottom: 60 }}>
          <HStack maxWidth="infinity">
            <Heading level={1} weight="bold">
              Layout &amp; Text
            </Heading>
            <Spacer />
            <button type="button" onClick={() => setDark(!dark)}>
              <Text color="tint">{dark ? 'Light' : 'Dark'}</Text>
            </button>
          </HStack>

          <Heading level={2}>Text styles</Heading>
          <Card>
            {TEXT_STYLES.map((s) => (
              <Text key={s} style={s}>
                {s}
              </Text>
            ))}
          </Card>

          <Heading level={2}>Modifiers</Heading>
          <Card>
            <Text color="secondaryLabel">secondaryLabel</Text>
            <Text color="tertiaryLabel">tertiaryLabel</Text>
            <Text color="systemRed" weight="semibold">
              systemRed semibold
            </Text>
            <Text italic>Italic body</Text>
            <Text monospacedDigit style="title2">
              1,111.11 vs 8,888.88
            </Text>
            <Text lineLimit={2} color="secondary">
              A long paragraph clamped to two lines. The quick brown fox jumps over the lazy dog, again and again, until the
              text no longer fits and gets truncated with an ellipsis.
            </Text>
            <Text alignment="trailing" cssStyle={{ alignSelf: 'stretch' }}>
              Trailing aligned
            </Text>
          </Card>

          <Heading level={2}>Stacks</Heading>
          <Card>
            <Heading level={3}>HStack + Spacer</Heading>
            <HStack maxWidth="infinity">
              <Box label="A" />
              <Spacer />
              <Box label="B" color="systemGreen" />
            </HStack>
            <HStack alignment="firstTextBaseline" spacing={12}>
              <Text style="largeTitle">Aa</Text>
              <Text style="footnote">baseline</Text>
            </HStack>
            <Heading level={3}>VStack alignment</Heading>
            <HStack spacing={16}>
              {(['leading', 'center', 'trailing'] as const).map((a) => (
                <VStack key={a} alignment={a} spacing={4} padding={8} background="tertiarySystemFill" cornerRadius={12}>
                  <Text style="caption">{a}</Text>
                  <Box label="wide box" color="systemOrange" />
                  <Box label="s" color="systemPurple" />
                </VStack>
              ))}
            </HStack>
            <Heading level={3}>ZStack</Heading>
            <ZStack alignment="bottomTrailing">
              <div style={{ width: 160, height: 90, borderRadius: 16, background: 'var(--lq-system-indigo)' }} />
              <Box label="badge" color="systemPink" />
            </ZStack>
          </Card>

          <Heading level={2}>Grid</Heading>
          <Card>
            <Text style="subheadline" color="secondary">
              columns=3
            </Text>
            <Grid columns={3}>
              {Array.from({ length: 6 }, (_, i) => (
                <Box key={i} label={`${i + 1}`} color="systemTeal" />
              ))}
            </Grid>
            <Text style="subheadline" color="secondary">
              adaptive(minimum: 70)
            </Text>
            <Grid columns={[{ type: 'adaptive', minimum: 70 }]} spacing={12}>
              {Array.from({ length: 9 }, (_, i) => (
                <Box key={i} label={`item ${i + 1}`} color="systemBlue" />
              ))}
            </Grid>
            <Text style="subheadline" color="secondary">
              fixed(60) + flexible
            </Text>
            <Grid columns={[{ type: 'fixed', size: 60 }, { type: 'flexible' }]} alignment="leading" rowSpacing={4}>
              <Text color="secondary">Name</Text>
              <Text>Liquid</Text>
              <Text color="secondary">Size</Text>
              <Text monospacedDigit>1,024 KB</Text>
            </Grid>
          </Card>
        </VStack>
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
