/**
 * Showcase of the media components (Image, Avatar, AvatarGroup, Badge, Tag, Skeleton, Redacted).
 * Open `/media.html` (`?dark`, `?light`, `?fallback`, `?only=<id,…>`).
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, LiquidRoot, ScrollView } from '@liquid-gpu/react';
// The package barrel is owned elsewhere; import the media folder directly.
import { Avatar, AvatarGroup, Badge, Image, Redacted, Skeleton, Tag } from '../../../../packages/react/src/media';
import { Section } from './controls';

const q = new URLSearchParams(location.search);

function Media() {
  const [redacted, setRedacted] = useState(true);
  return (
    <>
      <Section id="image" title="Image">
        <Image src="/photos/10.jpg" alt="Photo" width={120} height={120} cornerRadius="medium" />
        <Image src="/photos/102_t.jpg" alt="Photo fit" width={120} height={120} contentMode="fit" cornerRadius="small" />
        <Image src="/does-not-exist.jpg" alt="Broken" width={120} height={120} cornerRadius="medium" />
        <Image src="/photos/10.jpg" alt="16:9" aspectRatio="16/9" cornerRadius="large" />
      </Section>
      <Section id="avatar" title="Avatar">
        <Avatar name="John Appleseed" size="small" />
        <Avatar name="Jamie Rivera" />
        <Avatar name="Madonna" size="large" />
        <Avatar name="🎉" size="large" />
        <Avatar src="/photos/10_t.jpg" name="Photo Person" size={56} />
        <AvatarGroup items={[{ name: 'Ann Lee' }, { name: 'Bo Kim' }, { src: '/photos/10_t.jpg', name: 'C D' }, { name: 'Dan E' }, { name: 'Eve F' }, { name: 'Gia H' }]} max={4} size="medium" />
      </Section>
      <Section id="badge" title="Badge">
        <Badge value={3} />
        <Badge value={42} />
        <Badge value={150} />
        <Badge value="New" />
        <Badge variant="dot" />
        <Badge value={7} color="blue" />
        <Badge value="Beta" color="green" variant="label" />
      </Section>
      <Section id="tag" title="Tag">
        <Tag label="Design" />
        <Tag label="Urgent" color="red" />
        <Tag label="Done" color="green" variant="filled" />
        <Tag label="Draft" variant="gray" />
        <Tag label="Regular" color="purple" size="regular" />
      </Section>
      <Section id="skeleton" title="Skeleton">
        <div style={{ display: 'flex', gap: 12, width: '100%', alignItems: 'flex-start' }}>
          <Skeleton circle width={44} />
          <div style={{ flex: 1 }}>
            <Skeleton lines={3} />
          </div>
        </div>
        <Skeleton height={80} width="100%" radius={14} shimmer />
      </Section>
      <Section id="redacted" title="Redacted">
        <Button onClick={() => setRedacted((r) => !r)}>{redacted ? 'Show content' : 'Redact'}</Button>
        <Redacted active={redacted} style={{ width: '100%' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Avatar name="John Appleseed" />
            <div>
              <div className="lq-headline">John Appleseed</div>
              <div className="lq-subheadline" style={{ color: 'var(--lq-secondary-label)' }}>
                Lunch tomorrow? I found a great place near the office.
              </div>
            </div>
          </div>
        </Redacted>
      </Section>
    </>
  );
}

function Page() {
  const appearance = q.has('dark') ? 'dark' : q.has('light') ? 'light' : 'system';
  return (
    <LiquidRoot appearance={appearance} safeArea={{ top: 62, bottom: 34 }}>
      <ScrollView style={{ height: '100%', background: 'var(--lq-system-grouped-background)' }}>
        <div style={{ paddingTop: 62, paddingBottom: 40 }}>
          <h1 className="lq-large-title" style={{ margin: '0 0 12px 20px', fontWeight: 700 }}>
            Media
          </h1>
          <Media />
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
