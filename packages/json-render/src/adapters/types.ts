import type { ComponentRenderProps } from '@json-render/react';
import type { LiquidComponentName, LiquidProps } from '../schemas';

/** Render props of the adapter for catalog component `K` (props already resolved by json-render). */
export type P<K extends LiquidComponentName> = ComponentRenderProps<LiquidProps<K>>;

/** Drop `undefined` / `null` values so optional props keep the component defaults. */
export function defined<T extends object>(o: T): { [K in keyof T]: Exclude<T[K], undefined | null> } {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(o ?? {})) if (v !== undefined && v !== null) out[k] = v;
  return out as { [K in keyof T]: Exclude<T[K], undefined | null> };
}
