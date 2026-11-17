import type { ElementType, ReactNode } from 'react';
import { cx } from '../../utils/format';

interface CardProps {
  title?: ReactNode;
  icon?: ReactNode;
  aside?: ReactNode;
  tone?: 'red' | 'green';
  selected?: boolean;
  flat?: boolean;
  className?: string;
  as?: ElementType;
  children?: ReactNode;
}

export function Card({ title, icon, aside, tone, selected, flat, className, as: Tag = 'section', children }: CardProps) {
  return (
    <Tag className={cx('cx-card', tone && `cx-card--${tone}`, selected && 'cx-card--selected', flat && 'cx-card--flat', className)}>
      {title && (
        <h2 className="cx-card__title">
          {icon}
          <span>{title}</span>
          {aside && <span className="cx-push">{aside}</span>}
        </h2>
      )}
      {children}
    </Tag>
  );
}
