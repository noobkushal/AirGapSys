import type { CSSProperties } from 'react';
import { cx } from '../../utils/format';

interface Props {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  color?: string;
  small?: boolean;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, color, small, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cx('cx-toggle', small && 'cx-toggle--sm')}
      style={color ? ({ '--tc': color } as CSSProperties) : undefined}
      onClick={() => onChange(!checked)}
    />
  );
}
