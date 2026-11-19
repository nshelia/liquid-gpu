import { createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Icon,
  PLACEHOLDER_ICON,
  findIconName,
  getIconEntry,
  hasIcon,
  iconNames,
  iconRegistry,
  iconStrokeWidth,
  isIconElement,
  registerIcons,
  resetIconWarnings,
  resolveIcon,
  resolveIconColor,
} from './index';

afterEach(() => {
  vi.restoreAllMocks();
  resetIconWarnings();
});

describe('icon registry', () => {
  it('ships ~120+ base glyphs with fill variants', () => {
    const bases = new Set(iconNames.map((n) => n.replace(/\.fill$/, '')));
    expect(bases.size).toBeGreaterThanOrEqual(120);
    for (const n of ['heart.fill', 'star.fill', 'checkmark.circle.fill', 'xmark.circle.fill', 'plus.circle.fill', 'person.fill']) {
      expect(iconNames).toContain(n);
    }
  });

  it('lists names sorted and in sync with the registry', () => {
    expect([...iconNames].sort()).toEqual(iconNames);
    expect(new Set(iconNames)).toEqual(new Set(Object.keys(iconRegistry)));
  });

  it('covers the names the catalog relies on', () => {
    const required =
      'chevron.left chevron.right chevron.up chevron.down chevron.backward chevron.forward xmark plus minus checkmark ellipsis ellipsis.circle arrow.left arrow.right arrow.up arrow.down square.and.arrow.up trash pencil square.and.pencil doc.on.doc link magnifyingglass line.3.horizontal.decrease slider.horizontal.3 gearshape bell bookmark heart star flag paperplane tray archivebox folder doc paperclip camera photo video mic phone envelope message bubble.left person person.2 person.crop.circle house map location globe calendar clock cart bag creditcard lock key eye eye.slash wifi bolt cloud sun.max moon sparkles wand.and.stars chart.bar chart.line.uptrend.xyaxis info.circle exclamationmark.triangle questionmark.circle play pause stop forward backward speaker.wave.2 square.grid.2x2 list.bullet questionmark.square';
    for (const n of required.split(' ')) expect(hasIcon(n), n).toBe(true);
  });

  it('normalises names and falls back from .fill to the outline', () => {
    expect(findIconName('  Heart.Fill ')).toBe('heart.fill');
    expect(findIconName('arrow-left')).toBe('arrow.left');
    expect(findIconName('chevron_right')).toBe('chevron.right');
    expect(findIconName('globe.fill')).toBe('globe');
    expect(findIconName('nope.nothing')).toBeUndefined();
    expect(findIconName('')).toBeUndefined();
  });

  it('resolves aliases to the same artwork', () => {
    expect(iconRegistry['gear']).toBe(iconRegistry['gearshape']);
    expect(iconRegistry['square.on.square']).toBe(iconRegistry['doc.on.doc']);
  });

  it('returns the placeholder for unknown names and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = getIconEntry('totally.unknown');
    getIconEntry('totally.unknown');
    expect(a.missing).toBe(true);
    expect(a.name).toBe(PLACEHOLDER_ICON);
    expect(a.entry).toBe(iconRegistry[PLACEHOLDER_ICON]);
    expect(warn).toHaveBeenCalledTimes(1);
    getIconEntry('another.unknown');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(getIconEntry('heart').missing).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('registerIcons adds and overrides, keeping iconNames live', () => {
    const before = iconNames.length;
    registerIcons({ 'Test.Custom': { layers: [{ paint: 'fill', nodes: [['circle', { cx: 12, cy: 12, r: 4 }]] }] } });
    expect(hasIcon('test.custom')).toBe(true);
    expect(iconNames.length).toBe(before + 1);
    const render = () => createElement('svg', { 'data-custom': 'yes' });
    registerIcons({ 'test.custom': render });
    expect(iconRegistry['test.custom']).toBe(render);
    expect(iconNames.length).toBe(before + 1);
    expect(renderToStaticMarkup(createElement(Icon, { name: 'test.custom' }))).toContain('data-custom="yes"');
  });
});

describe('resolveIcon', () => {
  it('turns strings into <Icon> and passes nodes through', () => {
    const el = resolveIcon('heart.fill', { size: 17 });
    expect(isValidElement(el)).toBe(true);
    expect(isIconElement(el)).toBe(true);
    expect((el as { props: { name: string; size: number } }).props).toMatchObject({ name: 'heart.fill', size: 17 });
    const node = createElement('span', null, 'x');
    expect(resolveIcon(node)).toBe(node);
    expect(resolveIcon(null)).toBeNull();
    expect(resolveIcon(undefined)).toBeUndefined();
    expect(isIconElement(node)).toBe(false);
  });
});

describe('Icon rendering', () => {
  it('renders every registered glyph as an svg', () => {
    for (const name of iconNames.filter((n) => !n.startsWith('test.'))) {
      const html = renderToStaticMarkup(createElement(Icon, { name, size: 24 }));
      expect(html.startsWith('<svg'), name).toBe(true);
      expect(html, name).toContain('width="24"');
    }
  });

  it('is aria-hidden by default and labelled with label', () => {
    expect(renderToStaticMarkup(createElement(Icon, { name: 'heart' }))).toContain('aria-hidden="true"');
    const labelled = renderToStaticMarkup(createElement(Icon, { name: 'heart', label: 'Favourite' }));
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain('aria-label="Favourite"');
    expect(labelled).not.toContain('aria-hidden');
  });

  it('masks cutouts for knock-out fills', () => {
    const html = renderToStaticMarkup(createElement(Icon, { name: 'checkmark.circle.fill' }));
    expect(html).toContain('<mask');
    expect(html).toMatch(/mask="url\(#/);
  });

  it('applies weight and colour', () => {
    expect(iconStrokeWidth('regular')).toBe(1.9);
    expect(iconStrokeWidth('bold')).toBeGreaterThan(iconStrokeWidth('regular'));
    expect(iconStrokeWidth('thin')).toBeLessThan(iconStrokeWidth('regular'));
    const html = renderToStaticMarkup(createElement(Icon, { name: 'heart', weight: 'bold', color: 'systemRed' }));
    expect(html).toContain(`stroke-width="${iconStrokeWidth('bold')}"`);
    expect(html).toContain('color:var(--lq-system-red)');
  });
});

describe('resolveIconColor', () => {
  it('maps tokens, short tints and passes CSS through', () => {
    expect(resolveIconColor(undefined)).toBeUndefined();
    expect(resolveIconColor('secondaryLabel')).toBe('var(--lq-secondary-label)');
    expect(resolveIconColor('blue')).toBe('var(--lq-system-blue)');
    expect(resolveIconColor('accent')).toBe('var(--lq-tint)');
    expect(resolveIconColor('#ff0000')).toBe('#ff0000');
    expect(resolveIconColor('white')).toBe('white');
  });
});
