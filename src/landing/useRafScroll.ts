import { useEffect, useRef } from 'react';

/** Calls `callback` on mount, resize and (rAF-throttled) scroll. */
export function useRafScroll(callback: () => void): void {
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    let ticking = false;
    const run = () => ref.current();
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; run(); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', run);
    run();
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', run); };
  }, []);
}
