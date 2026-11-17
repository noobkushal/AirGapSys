import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { useHoverDrawer } from '../../hooks/useHoverDrawer';
import { useConsole } from '../../state/ConsoleContext';
import { cx } from '../../utils/format';
import { NAV_GROUPS, type NavBadge } from './navItems';
import styles from './Navigation.module.css';

/**
 * Clarix logo + navigation drawer.
 * Behaviour (hover/bridge/pin/outside/Escape/touch/keyboard) lives in useHoverDrawer.
 */
export function ClarixNavigation() {
  const { open, pinned, close, logoRef, drawerRef, logoProps, drawerProps } = useHoverDrawer();
  const { counts } = useConsole();

  const badge = (b: NavBadge | undefined) => {
    if (!b) return null;
    if (b.kind === 'text') return <span className={cx(styles.badge, styles[b.tone])}>{b.text}</span>;
    const n = b.source === 'threats' ? counts.threats : counts.pendingApprovals;
    return n > 0 ? <span className={cx(styles.badge, styles[b.tone])} aria-label={`${n} ${b.source}`}>{n}</span> : null;
  };

  return (
    <>
      <div className={cx(styles.scrim, open && styles.scrimOpen)} aria-hidden="true" />
      <button
        ref={logoRef}
        type="button"
        className={cx(styles.logo, open && styles.logoOpen)}
        aria-label={pinned ? 'Unpin and close navigation' : 'Open navigation'}
        aria-expanded={open}
        aria-controls="harness-drawer"
        {...logoProps}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <rect x="2" y="2" width="8.5" height="8.5" rx="4.2" /><rect x="13.5" y="2" width="8.5" height="8.5" rx="4.2" />
          <rect x="2" y="13.5" width="8.5" height="8.5" rx="4.2" /><rect x="13.5" y="13.5" width="8.5" height="8.5" rx="4.2" />
        </svg>
        Clarix
      </button>

      <aside id="harness-drawer" ref={drawerRef} className={cx(styles.drawer, open && styles.drawerOpen)} aria-label="AI Harness navigation" {...drawerProps}>
        <div className={styles.head}>
          <span>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="2.5" y="2.5" width="8" height="8" rx="2.4" /><rect x="13.5" y="2.5" width="8" height="8" rx="2.4" />
              <rect x="2.5" y="13.5" width="8" height="8" rx="2.4" /><rect x="13.5" y="13.5" width="8" height="8" rx="2.4" />
            </svg>
            AI Harness
          </span>
          <button type="button" className={styles.close} aria-label="Close navigation drawer" onClick={close}><X /></button>
        </div>

        <nav aria-label="Console modules">
          {NAV_GROUPS.map((g) => (
            <div key={g.label}>
              <div className={styles.label}>{g.label}</div>
              {g.items.map((it) => (
                <NavLink key={it.path} to={it.path} onClick={close} className={({ isActive }) => cx(styles.item, isActive && styles.active)}>
                  <it.icon aria-hidden="true" />
                  <span>{it.label}</span>
                  {badge(it.badge)}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className={styles.foot}>
          <strong>Clarix AI — Air-Gapped Secure Agent</strong>
          Status badges are demo values. Real isolation is enforced by the backend and operating system, not by this interface.
          <br /><NavLink to="/" onClick={close}>Back to Clarix home</NavLink>
        </div>
      </aside>
    </>
  );
}
