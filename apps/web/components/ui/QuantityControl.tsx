import { Minus, Plus } from 'lucide-react';
import type { ReactNode } from 'react';

interface QuantityControlProps {
  value: number;
  /** Receives the clamped next value. */
  onChange?: (next: number) => void;
  /** Receives the step direction, for callers that adjust stock server-side. */
  onStep?: (delta: 1 | -1) => void;
  min?: number;
  max?: number;
  /** Name of the group (« Quantité de Lait »). */
  label?: string;
  decreaseLabel: string;
  increaseLabel: string;
  /** Accessible name of the value element. */
  valueLabel?: string;
  size?: 'compact' | 'regular';
  disabled?: boolean;
  /** Disable the minus (or plus) button only, on top of `min` / `max`. */
  decreaseDisabled?: boolean;
  increaseDisabled?: boolean;
  /** Hide the value when the caller already shows it elsewhere. */
  hideValue?: boolean;
  renderValue?: (value: number) => ReactNode;
  valueClassName?: string;
  className?: string;
}

// Glyph only: no background, no shape. The 44 px hit area comes from `tap-target`.
const BUTTON =
  'tap-target text-ink inline-flex items-center justify-center transition-[opacity,transform] duration-100 active:opacity-50 active:scale-[0.92] motion-reduce:active:scale-100 disabled:opacity-35 disabled:active:scale-100 disabled:active:opacity-35';

export function QuantityControl({
  value,
  onChange,
  onStep,
  min = 1,
  max = 999,
  label,
  decreaseLabel,
  increaseLabel,
  valueLabel,
  size = 'compact',
  disabled = false,
  decreaseDisabled = false,
  increaseDisabled = false,
  hideValue = false,
  renderValue,
  valueClassName,
  className,
}: QuantityControlProps) {
  const step = (delta: 1 | -1) => {
    onStep?.(delta);
    onChange?.(Math.min(max, Math.max(min, value + delta)));
  };
  const glyph = size === 'regular' ? 24 : 20;
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex items-center gap-2 ${className ?? ''}`.trim()}
    >
      <button
        type="button"
        aria-label={decreaseLabel}
        disabled={disabled || decreaseDisabled || value <= min}
        onClick={() => step(-1)}
        className={BUTTON}
      >
        <Minus size={glyph} strokeWidth={2} aria-hidden="true" />
      </button>
      {hideValue ? null : (
        <output
          aria-label={valueLabel}
          aria-live="polite"
          className={`text-ink w-[3ch] text-center tabular-nums ${
            size === 'regular' ? 'text-subtitle' : 'text-body'
          } ${valueClassName ?? ''}`.trim()}
        >
          {renderValue ? renderValue(value) : value}
        </output>
      )}
      <button
        type="button"
        aria-label={increaseLabel}
        disabled={disabled || increaseDisabled || value >= max}
        onClick={() => step(1)}
        className={BUTTON}
      >
        <Plus size={glyph} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}
