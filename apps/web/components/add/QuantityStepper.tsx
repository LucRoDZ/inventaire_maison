import { QuantityControl } from '../ui/QuantityControl';

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Name of the group when several steppers share a screen (« Quantité de Lait »). */
  label?: string;
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 999,
  label = 'Quantité',
}: QuantityStepperProps) {
  return (
    <QuantityControl
      size="regular"
      value={value}
      onChange={onChange}
      min={min}
      max={max}
      label={label}
      decreaseLabel="Diminuer la quantité"
      increaseLabel="Augmenter la quantité"
    />
  );
}
