import { Minus, Plus } from 'lucide-react';

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

export function QuantityStepper({ value, onChange, min = 1, max = 999 }: QuantityStepperProps) {
  return (
    <div role="group" aria-label="Quantité" className="flex items-center gap-3">
      <button
        type="button"
        aria-label="Diminuer la quantité"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="tap-target bg-lavender text-indigo inline-flex items-center justify-center rounded-full disabled:opacity-50"
      >
        <Minus size={20} aria-hidden="true" />
      </button>
      <output aria-live="polite" className="text-stat text-indigo min-w-[2ch] text-center">
        {value}
      </output>
      <button
        type="button"
        aria-label="Augmenter la quantité"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="tap-target bg-amber text-indigo inline-flex items-center justify-center rounded-full disabled:opacity-50"
      >
        <Plus size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
