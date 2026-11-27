import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

/** White card: thin line, no shadow, 16 px radius. */
export function Card({ children, className = '', ...rest }: CardProps) {
  return (
    <article
      className={`border-line rounded-card bg-surface-raised shadow-none border p-4 ${className}`}
      {...rest}
    >
      {children}
    </article>
  );
}
