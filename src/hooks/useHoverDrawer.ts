import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEvent as ReactFocusEvent, PointerEvent as ReactPointerEvent } from 'react';

interface Options {
  /** ms to wait after the pointer leaves logo+drawer before closing. */
  closeDelay?: number;
}

/**
 * State machine for the Clarix logo navigation drawer.
 *
 *  - Hover (mouse/pen) over the logo opens it; moving into the drawer keeps it open.
 *  - Leaving both closes it after `closeDelay` (the delay is the "bridge" that stops
 *    flicker while the cursor crosses the gap between logo and drawer).
 *  - Click/tap/Enter on the logo pins it open; click again unpins and closes.
 *  - Close button, outside pointer-down and Escape close it and clear the pin.
 *  - Touch never triggers hover; keyboard focus inside either element cancels a pending close.
 */
export function useHoverDrawer({ closeDelay = 280 }: Options = {}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const timer = useRef<number | null>(null);
  const pinnedRef = useRef(false);
  const logoRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);

  pinnedRef.current = pinned;

  const clearTimer = useCallback(() => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
  }, []);

  const openNow = useCallback(() => { clearTimer(); setOpen(true); }, [clearTimer]);

  const close = useCallback(() => {
    clearTimer();
    setPinned(false);
    setOpen(false);
  }, [clearTimer]);

  const scheduleClose = useCallback(() => {
    if (pinnedRef.current) return;
    clearTimer();
    timer.current = window.setTimeout(() => { timer.current = null; if (!pinnedRef.current) setOpen(false); }, closeDelay);
  }, [clearTimer, closeDelay]);

  const isHoverPointer = (e: { pointerType?: string }) => e.pointerType === 'mouse' || e.pointerType === 'pen';

  const logoProps = {
    onPointerEnter: (e: ReactPointerEvent) => { if (isHoverPointer(e)) openNow(); },
    onPointerLeave: (e: ReactPointerEvent) => { if (isHoverPointer(e)) scheduleClose(); },
    onClick: () => {
      if (pinnedRef.current) close();
      else { clearTimer(); setPinned(true); setOpen(true); }
    },
    onFocus: () => clearTimer(),
  };

  const drawerProps = {
    onPointerEnter: (e: ReactPointerEvent) => { if (isHoverPointer(e)) clearTimer(); },
    onPointerLeave: (e: ReactPointerEvent) => { if (isHoverPointer(e)) scheduleClose(); },
    onFocus: () => clearTimer(),
    onBlur: (e: ReactFocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && (drawerRef.current?.contains(next) || logoRef.current?.contains(next))) return;
      if (!pinnedRef.current && !drawerRef.current?.matches(':hover')) scheduleClose();
    },
  };

  // outside pointer-down + Escape, only while open
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (drawerRef.current?.contains(t) || logoRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const hadFocus = drawerRef.current?.contains(document.activeElement);
      close();
      if (hadFocus) logoRef.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, close]);

  // lock page scroll only while pinned
  useEffect(() => {
    document.body.classList.toggle('drawer-pinned', pinned);
    return () => document.body.classList.remove('drawer-pinned');
  }, [pinned]);

  useEffect(() => clearTimer, [clearTimer]);

  return { open, pinned, close, logoRef, drawerRef, logoProps, drawerProps };
}
