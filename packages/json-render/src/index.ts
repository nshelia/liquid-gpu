/**
 * @liquid-gpu/json-render: generative UI for @liquid-gpu/react on top of json-render (`@json-render/core` +
 * `@json-render/react`). An LLM streams a spec built from the Liquid catalog; `<LiquidRenderer>` renders it as
 * iOS 27 UI (Liquid Glass) and keeps rendering while it streams.
 */
export { liquidCatalog, createLiquidCatalog, liquidComponentNames, liquidPrompt, liquidRules, iconRule, type LiquidCatalog, type LiquidActionDefinitions } from './catalog';
export {
  liquidComponents,
  checkSchema,
  menuItemSchema,
  swipeActionSchema,
  alertActionSchema,
  type ComponentDefinition,
  type LiquidComponentName,
  type LiquidProps,
  type CheckInput,
  type MenuItemInput,
  type SwipeActionInput,
  type AlertActionInput,
  type OptionInput,
} from './schemas';
export { LiquidRenderer, type LiquidRendererProps, type ActionHandlerFn } from './LiquidRenderer';
export { liquidRegistry, liquidAdapters, createLiquidRegistry, wrapAdapter, propsComplete, ElementBoundary, LiquidFallback, type WrapOptions } from './registry';
export {
  ElementById,
  SpecContext,
  FieldBindingContext,
  useBound,
  useBoundProp,
  useOpenPath,
  toMenuContent,
  createMenuSelect,
  toSwipeActions,
  toFormCheck,
  toFormChecks,
  toValidationCheck,
  type SpecContextValue,
} from './runtime';
export { createLiquidSpecStream, parsePartialJson, parseSpec, toSpec, type LiquidSpecStream, type PartialJsonOptions } from './stream';
export { validateLiquidSpec, isDynamicExpression, type LiquidSpecIssue, type LiquidSpecValidation, type ValidateOptions } from './validate';
export { useLiquidSpecStream, type UseLiquidSpecStream } from './useSpecStream';
// Re-exports so apps need only this package for the common json-render pieces.
export { createStateStore, type Spec, type UIElement, type StateStore, type StateModel, type ActionBinding } from '@json-render/core';
export { useStateStore, useStateValue, useActions, type ComponentRegistry, type ComponentRenderProps } from '@json-render/react';
export { settingsSpec, signUpSpec, dashboardSpec, exampleSpecs, specToPatches } from './examples';
