import type { CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { ALL_NAV } from '../navigation/navItems';
import { ROBOTS } from '../../utils/assets';
import styles from './Layout.module.css';

/** Fixed robot backdrop. The robot frame is chosen per route so screens alternate blue / pink-red. */
export function ConsoleBackdrop() {
  const { pathname } = useLocation();
  const idx = Math.max(0, ALL_NAV.findIndex((n) => n.path === pathname));
  const frame = [1, 2, 3, 0][idx % 4];
  const src = ROBOTS[frame];
  // measured horizontal centre of the robot in each supplied frame (0..1)
  const CENTERS = [0.86, 0.66, 0.65, 0.6];
  const shift = Math.max(0, 0.87 - CENTERS[frame]) * 100;
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <img key={src} className={styles.robot} src={src} alt="" style={{ '--shift': `${shift}vw` } as CSSProperties} />
      <div className={styles.dots} />
    </div>
  );
}
