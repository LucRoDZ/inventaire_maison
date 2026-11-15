import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

/** White card: thin line, soft shadow, 16 px radius. */
export function Card({ children, className = '', ...rest }: CardProps) {
  return (
    <article
      className={`border-line rounded-card shadow-card border bg-white p-4 ${className}`}
      {...rest}
    >
      {children}
    </article>
  );
}
