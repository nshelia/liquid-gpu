/** Serializable picker option (json-render catalog friendly). */
export type PickerValue = string | number;

export interface PickerOption<T extends PickerValue = string> {
  value: T;
  label: string;
  /** Icon name (e.g. an SF Symbol name); drawn through the picker's `renderIcon`. */
  icon?: string;
  disabled?: boolean;
}

/** SwiftUI `pickerStyle` (SC §3). `menu` is the default (automatic outside a Form). */
export type PickerStyle = 'menu' | 'inline' | 'segmented' | 'wheel';
