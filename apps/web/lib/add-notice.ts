/** What the add flows announce after leaving their page: the toast with Annuler lives in the app shell. */
export interface AddAnnouncement {
  message: string;
  /** Annuler. */
  undo: () => Promise<void>;
  /** The delay ended (or the toast went away) without an undo. */
  commit: () => Promise<void>;
}

let current: AddAnnouncement | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export const addNotice = {
  show(next: AddAnnouncement): void {
    current = next;
    emit();
  },
  get(): AddAnnouncement | null {
    return current;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  clear(): void {
    if (current === null) return;
    current = null;
    emit();
  },
};
