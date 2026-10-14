'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MenuPanel } from './MenuPanel';

interface DropdownProps {
  /** Render-prop trigger; call `toggle` to open/close. */
  trigger: (api: { open: boolean; toggle: () => void }) => ReactNode;
  /** Menu contents. As a function you get `close` to dismiss after an action. */
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'start' | 'end';
  width?: string;
  /** Extra classes on the panel — e.g. `max-h-72 overflow-y-auto` for long lists. */
  menuClassName?: string;
  /**
   * Fired when the menu shuts, however it shut — a pick, Escape, or a click
   * outside. A menu with more than one view needs it to go back to the first
   * one, so reopening does not land you where you last were.
   */
  onClosed?: () => void;
}

/**
 * Dropdown - the consistent click-opened action menu. Bundles the three things
 * call sites keep getting wrong (or skipping, like a raw `<details>`): outside-
 * click close, Escape close, and standardized placement-with-flip via MenuPanel.
 * For long lists pass `menuClassName="max-h-72 overflow-y-auto"` so it scrolls
 * instead of running off-screen. For a searchable single-select, use SelectMenu.
 */
export function Dropdown({ trigger, children, align = 'start', width = 'w-56', menuClassName = '', onClosed }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const onClosedRef = useRef(onClosed);
  useEffect(() => { onClosedRef.current = onClosed; });
  const wasOpen = useRef(false);
  // Read through a ref so a caller passing an inline function cannot make this
  // fire on every render.
  useEffect(() => {
    if (wasOpen.current && !open) onClosedRef.current?.();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={ref} className="relative inline-block">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <MenuPanel align={align} width={width} className={menuClassName}>
          {typeof children === 'function' ? children(close) : children}
        </MenuPanel>
      )}
    </div>
  );
}

export default Dropdown;
