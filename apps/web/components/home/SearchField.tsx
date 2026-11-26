'use client';

import { Search } from 'lucide-react';
import { useEffect, useRef, useState, type Ref } from 'react';
import { normalize } from '../../lib/home-filters';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * Waits this long after the last key before calling `onChange` (the URL is rewritten then).
   * The field keeps its own text meanwhile, spaces included. 0: at each key.
   */
  delay?: number;
  inputRef?: Ref<HTMLInputElement>;
}

/** « Nom ou marque »: the one search box of the inventory, the same in every view. */
export function SearchField({ value, onChange, delay = 0, inputRef }: SearchFieldProps) {
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });

  /** The last texts given to `onChange`: when the URL gives one back (trimmed), it is our echo. */
  const sent = useRef<string[]>([value]);

  // A change from elsewhere (« Effacer », a link): the field follows. Our own search coming back
  // from the URL, trimmed and maybe late while the person goes on typing, is left alone.
  useEffect(() => {
    // Echoes come back in order: once one is seen, the older texts can no longer come back.
    const echo = sent.current.findIndex((one) => normalize(one) === normalize(value));
    if (echo >= 0) {
      sent.current = sent.current.slice(echo);
      return;
    }
    sent.current = [value];
    setText(value);
  }, [value]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** The text typed and not written yet, with what writes it. */
  const pending = useRef<(() => void) | null>(null);

  const change = (next: string) => {
    setText(next);
    const send = () => {
      pending.current = null;
      if (timer.current) clearTimeout(timer.current);
      sent.current = [...sent.current.slice(-4), next];
      latest.current(next);
    };
    if (delay === 0) {
      send();
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    pending.current = send;
    timer.current = setTimeout(send, delay);
  };

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
        value={text}
        onChange={(event) => change(event.target.value)}
        // Leaving the field (for the filters, a card…) writes the search at once: never lost.
        onBlur={() => pending.current?.()}
        placeholder="Nom ou marque"
        enterKeyHint="search"
        className="tap-target border-line text-ink w-full rounded-xl border bg-white pr-3 pl-10"
      />
    </label>
  );
}
