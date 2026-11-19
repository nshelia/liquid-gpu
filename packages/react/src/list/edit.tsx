/**
 * List edit mode pieces: EditButton and the edit-control glyphs. ED = deep/demo-audit/list-edit (UIKit27-C):
 * - Edit: plain glass capsule "Edit"; Done: prominent tinted 44 pt circle with a white checkmark (`editButtonItem`).
 * - Minus: 21.5 pt systemRed disc (22 pt box), white bar 10.55 × 1.59 rounded; centre (cell + 32, row mid ± 0.33).
 * - Selection: 22 pt ring 1.67 pt; selected = tint disc + white check (stroke 1.6).
 * - Grabber: three 21.33 × 1.2 lines 4.67 apart in #C5C5C7 (dark #5A5A5E), in the 27 pt control at
 *   x + 4 (SwiftUI 377–398.67; UIKit 1 pt further left). Ring and grabber: tertiaryLabel (#3C3C43@0.3 / #EBEBF5@0.3, solved from the selected and plain fills).
 */
import { createContext, useContext } from 'react';
import { BarButton } from '../nav/bars';

export interface ListEditState {
  editing: boolean;
  /** Present when the list has `selection`: rows show selection circles instead of minus controls. */
  selection: ReadonlySet<string> | null;
  toggle(id: string): void;
}

export const ListEditContext = createContext<ListEditState>({ editing: false, selection: null, toggle() {} });

export function useListEditing(): ListEditState {
  return useContext(ListEditContext);
}

export interface EditButtonProps {
  editing: boolean;
  onEditingChange(editing: boolean): void;
}

/** SwiftUI `EditButton` / UIKit `editButtonItem` for a NavBar side (ED: Edit capsule ↔ prominent Done circle). */
export function EditButton({ editing, onEditingChange }: EditButtonProps) {
  return editing ? (
    <BarButton prominent icon={<DoneCheck />} aria-label="Done" onPress={() => onEditingChange(false)} />
  ) : (
    <BarButton label="Edit" onPress={() => onEditingChange(true)} />
  );
}

/** ED: Done glyph ≈ 17.4 × 16.7, stroke 2.3, in the 44 pt circle (centre-relative (−9, 0.75) (−2.2, 8.7) (8.4, −8)). */
export function DoneCheck() {
  return (
    <svg width="22" height="22" viewBox="-11 -11 22 22" aria-hidden style={{ display: 'block', margin: '0 -1px' }}>
      <path d="M-8.4 0.9 L-2.2 8.1 L7.8 -7.4" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MinusGlyph() {
  return (
    <svg width="22" height="22" viewBox="-11 -11 22 22" aria-hidden style={{ display: 'block' }}>
      <circle r="10.75" fill="var(--lq-system-red)" />
      <rect x="-5.27" y="-0.6" width="10.55" height="1.59" rx="0.8" fill="#FFFFFF" />
    </svg>
  );
}

export function SelectionGlyph({ selected }: { selected: boolean }) {
  return (
    <svg width="22" height="22" viewBox="-11 -11 22 22" aria-hidden style={{ display: 'block' }}>
      {selected ? (
        <>
          <circle r="10.75" fill="var(--lq-tint)" />
          <path d="M-4.2 1 L-0.9 4.6 L4 -3.6" fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <circle r="10" fill="none" stroke="var(--lq-chevron)" strokeWidth="1.67" />
      )}
    </svg>
  );
}

export function GrabberGlyph() {
  return (
    <svg width="27" height="15" viewBox="0 0 27 15" aria-hidden style={{ display: 'block' }}>
      {[3, 7.67, 12.34].map((y) => (
        <rect key={y} x="4" y={y - 0.6} width="21.33" height="1.2" rx="0.6" fill="var(--lq-chevron)" />
      ))}
    </svg>
  );
}
