import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useConsole } from '../../state/ConsoleContext';

const ICON = { green: CheckCircle2, red: XCircle, blue: Info, amber: AlertTriangle } as const;

export function ToastHost() {
  const { toasts, dismissToast } = useConsole();
  return (
    <div className="cx-toasts" aria-live="polite">
      {toasts.map((t) => {
        const I = ICON[t.tone];
        return (
          <div key={t.id} className={`cx-toast cx-toast--${t.tone}`}>
            <I aria-hidden /><span>{t.text}</span>
            <button type="button" className="cx-btn cx-btn--icon cx-btn--ghost cx-push" aria-label="Dismiss" onClick={() => dismissToast(t.id)}><X width={14} height={14} /></button>
          </div>
        );
      })}
    </div>
  );
}
