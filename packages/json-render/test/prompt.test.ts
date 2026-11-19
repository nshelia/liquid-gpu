import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { createLiquidCatalog, liquidCatalog, liquidComponentNames, liquidComponents, liquidPrompt, liquidRules } from '../src';

describe('prompt generation', () => {
  const prompt = liquidPrompt();

  test('lists every catalog component with its description', () => {
    const section = prompt.slice(prompt.indexOf('AVAILABLE COMPONENTS'));
    for (const name of liquidComponentNames) {
      expect(section, name).toContain(`- ${name}: `);
      expect(section, name).toContain((liquidComponents as Record<string, { description: string }>)[name]!.description);
    }
    expect(section).toContain(`AVAILABLE COMPONENTS (${liquidComponentNames.length})`);
    expect(liquidComponentNames.length).toBe(liquidCatalog.componentNames.length);
  });

  test('includes slots, events, built-in actions and the Liquid rules', () => {
    expect(prompt).toMatch(/- Screen: .*slots: leading, trailing, toolbar/);
    expect(prompt).toMatch(/- Button: .*events: press/);
    expect(prompt).toContain('setState');
    expect(prompt).toContain('$bindState');
    for (const rule of liquidRules) expect(prompt).toContain(rule);
  });

  test('app actions from createLiquidCatalog appear', () => {
    const catalog = createLiquidCatalog({ actions: { bookTable: { params: z.object({ time: z.string() }), description: 'Book a restaurant table' } } });
    const p = liquidPrompt({ catalog, customRules: ['Always offer two times.'] });
    expect(p).toContain('bookTable');
    expect(p).toContain('Book a restaurant table');
    expect(p).toContain('Always offer two times.');
  });

  test('inline (chat) mode', () => {
    expect(liquidPrompt({ mode: 'inline' })).not.toBe(prompt);
  });
});
