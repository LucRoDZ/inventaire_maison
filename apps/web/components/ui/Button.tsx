import type { ComponentPropsWithRef } from 'react';

export type ButtonVariant = 'primary' | 'outline' | 'secondary';

interface ButtonProps extends ComponentPropsWithRef<'button'> {
  /**
   * `primary`: indigo, white text, the one main action of a screen or sheet.
   * `outline`: white with a hairline, indigo text, a second action that still needs a surface.
   * `secondary`: indigo-mid text only.
   */
  variant?: ButtonVariant;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-indigo text-white hover:bg-indigo-mid disabled:bg-lavender disabled:text-indigo-mid aria-disabled:bg-lavender aria-disabled:text-indigo-mid',
  outline:
    'border border-line bg-white text-indigo hover:bg-lavender disabled:opacity-50 aria-disabled:opacity-50',
  secondary:
    'bg-transparent text-indigo-mid hover:text-indigo disabled:opacity-50 aria-disabled:opacity-50',
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
      className={`tap-target inline-flex items-center justify-center gap-2 rounded-xl px-4 font-semibold transition-colors duration-150 ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}
