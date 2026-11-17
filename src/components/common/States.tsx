import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react';

export function Loading({ rows = 3, height = 90 }: { rows?: number; height?: number }) {
  return (
    <div className="cx-stack" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="cx-skel" style={{ height }} />)}
    </div>
  );
}
export function Spinner({ label }: { label?: string }) {
  return <span className="cx-row" role="status"><Loader2 className="cx-spin" width={16} height={16} aria-hidden />{label}</span>;
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="cx-state cx-state--error" role="alert">
      <AlertTriangle aria-hidden />
      <strong>Could not load this data</strong>
      <span>{message}</span>
      {onRetry && <button type="button" className="cx-btn cx-btn--ghost cx-btn--sm" onClick={onRetry}><RefreshCw />Try again</button>}
    </div>
  );
}
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="cx-state">
      <Inbox aria-hidden />
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
      {action}
    </div>
  );
}
