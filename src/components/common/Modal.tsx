import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }

/** Accessible modal: Escape closes, focus moves in and returns, scrim click closes. */
export function Modal({ title, onClose, children, footer, width }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="cx-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="cx-modal" role="dialog" aria-modal="true" tabIndex={-1} style={width ? { width: Math.min(width, 900) } : undefined}>
        <h2>{title}<button type="button" className="cx-btn cx-btn--ghost cx-btn--icon cx-push" aria-label="Close dialog" onClick={onClose}><X /></button></h2>
        {children}
        {footer && <div className="cx-modal__foot">{footer}</div>}
      </div>
    </div>
  );
}
