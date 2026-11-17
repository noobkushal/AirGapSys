import { Bell } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useConsole } from '../../state/ConsoleContext';
import styles from './Layout.module.css';

export function TopBar() {
  const { settings, counts } = useConsole();
  const alerts = counts.pendingApprovals;
  return (
    <header className={styles.top}>
      {settings.notifications && alerts > 0 && <NavLink to="/approvals" className={styles.bell} aria-label={`${alerts} approval${alerts > 1 ? 's' : ''} waiting`}><Bell width={14} height={14} />{alerts} approval{alerts > 1 ? 's' : ''} waiting</NavLink>}
      <span className={styles.demo} title="All figures in this console are mock data until the backend is connected."><i />SIMULATED DATA</span>
      <nav className={styles.links} aria-label="Quick links">
        <NavLink to="/overview">Overview ↗</NavLink>
        <NavLink to="/policies">Policies ↗</NavLink>
        <NavLink to="/prompt-injection">Threats ↗</NavLink>
        <NavLink to="/settings">System ↗</NavLink>
      </nav>
    </header>
  );
}
