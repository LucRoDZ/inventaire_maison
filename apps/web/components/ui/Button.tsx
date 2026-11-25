import type { ComponentPropsWithRef } from 'react';

export type ButtonVariant = 'primary' | 'add' | 'secondary';

interface ButtonProps extends ComponentPropsWithRef<'button'> {
  /** `primary`: indigo, white text. `add`: amber, indigo text. `secondary`: indigo-mid text. */
  variant?: ButtonVariant;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-indigo text-white',
  add: 'bg-amber text-indigo',
  secondary: 'bg-transparent text-indigo-mid',
};

export function Button({
  variant = 'primary',
  type = 'button',
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`tap-target inline-flex items-center justify-center gap-2 rounded-xl px-4 font-bold disabled:opacity-50 aria-disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}
