import { Search } from 'lucide-react';
import type { Ref } from 'react';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  inputRef?: Ref<HTMLInputElement>;
}

/** « Nom ou marque »: the one search box of the inventory, the same in every view. */
export function SearchField({ value, onChange, inputRef }: SearchFieldProps) {
  return (
    <label className="relative block">
      <span className="sr-only">Nom ou marque</span>
      <Search
        size={18}
        aria-hidden="true"
        className="text-indigo-mid pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Nom ou marque"
        enterKeyHint="search"
        className="tap-target border-line text-ink w-full rounded-xl border bg-white pr-3 pl-10"
      />
    </label>
  );
}
