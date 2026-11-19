/**
 * Spec validation against the Liquid catalog. Unlike `catalog.validate()` (which rejects `{ "$bindState": … }` where
 * the zod schema wants a boolean), dynamic expressions are accepted for any prop and checked only for shape.
 */
import type { Spec } from '@json-render/core';
import { liquidComponents } from './schemas';

export interface LiquidSpecIssue {
  /** Element key, or `$root` for spec-level issues. */
  element: string;
  type?: string;
  /** Prop path inside the element (e.g. `props.items.0.title`). */
  path?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface LiquidSpecValidation {
  valid: boolean;
  issues: LiquidSpecIssue[];
}

const DYNAMIC_KEYS = ['$state', '$bindState', '$bindItem', '$item', '$index', '$template', '$cond', '$computed'];

/** True for a json-render dynamic expression (`{ "$state": "/x" }`, `{ "$cond": …, "$then": …, "$else": … }`, …). */
export function isDynamicExpression(v: unknown): boolean {
  return !!v && typeof v === 'object' && !Array.isArray(v) && DYNAMIC_KEYS.some((k) => k in (v as object));
}

/** Replace every dynamic expression by `undefined` (top-level) so zod only checks literal props. */
function literalProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) if (!isDynamicExpression(v)) out[k] = v;
  return out;
}

type Schemas = Record<string, { props: { safeParse(v: unknown): { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }; slots?: string[] }>;

export interface ValidateOptions {
  /** Extra component types that are valid (custom registry entries); their props are not checked. */
  extraTypes?: Iterable<string>;
  /** Report elements that nothing references (except NavigationStack destinations). Default true. */
  orphans?: boolean;
}

/** Validate a spec: known types, props per schema, children / slots / destinations that resolve, a reachable root. */
export function validateLiquidSpec(spec: unknown, options: ValidateOptions = {}): LiquidSpecValidation {
  const issues: LiquidSpecIssue[] = [];
  const schemas = liquidComponents as unknown as Schemas;
  const extra = new Set(options.extraTypes ?? []);
  const s = spec as Partial<Spec> | null;
  if (!s || typeof s !== 'object') return { valid: false, issues: [{ element: '$root', message: 'Spec must be an object.', severity: 'error' }] };
  if (typeof s.root !== 'string' || !s.root) issues.push({ element: '$root', message: 'Missing "root" element key.', severity: 'error' });
  const elements = (s.elements && typeof s.elements === 'object' ? s.elements : {}) as Spec['elements'];
  if (!s.elements) issues.push({ element: '$root', message: 'Missing "elements" map.', severity: 'error' });
  if (typeof s.root === 'string' && s.root && !elements[s.root]) issues.push({ element: '$root', message: `Root element "${s.root}" is not defined.`, severity: 'error' });

  const referenced = new Set<string>([s.root ?? '']);
  for (const [key, el] of Object.entries(elements)) {
    if (!el || typeof el !== 'object' || typeof el.type !== 'string') {
      issues.push({ element: key, message: 'Element needs a string "type".', severity: 'error' });
      continue;
    }
    const def = schemas[el.type];
    if (!def && !extra.has(el.type)) {
      issues.push({ element: key, type: el.type, message: `Unknown component type "${el.type}".`, severity: 'error' });
    }
    if (def) {
      const r = def.props.safeParse(literalProps((el.props ?? {}) as Record<string, unknown>));
      if (!r.success) {
        for (const iss of r.error?.issues ?? []) {
          issues.push({ element: key, type: el.type, path: ['props', ...iss.path.map(String)].join('.'), message: iss.message, severity: 'error' });
        }
      }
      const accepts = def.slots ?? [];
      if ((el.children?.length ?? 0) > 0 && !accepts.includes('default')) {
        issues.push({ element: key, type: el.type, message: `${el.type} does not take children.`, severity: 'warning' });
      }
      for (const name of Object.keys(el.slots ?? {})) {
        if (!accepts.includes(name)) issues.push({ element: key, type: el.type, message: `${el.type} has no slot "${name}".`, severity: 'warning' });
      }
    }
    const refs = [...(el.children ?? []), ...Object.values(el.slots ?? {}).flat()];
    if (el.type === 'NavigationStack') {
      const dests = (el.props as { destinations?: Record<string, unknown> })?.destinations;
      if (dests && typeof dests === 'object') for (const id of Object.values(dests)) if (typeof id === 'string') refs.push(id);
    }
    for (const id of refs) {
      referenced.add(id);
      if (!elements[id]) issues.push({ element: key, type: el.type, message: `References missing element "${id}".`, severity: 'error' });
    }
  }
  if (options.orphans !== false) {
    for (const key of Object.keys(elements)) {
      if (!referenced.has(key)) issues.push({ element: key, type: elements[key]?.type, message: `Element "${key}" is not referenced by any parent.`, severity: 'warning' });
    }
  }
  return { valid: !issues.some((i) => i.severity === 'error'), issues };
}
