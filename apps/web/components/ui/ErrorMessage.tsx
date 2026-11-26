import { Callout } from './Callout';

const TECHNICAL =
  /^(error|typeerror|failed to fetch|network|http|\d{3}\b)|undefined|\bnull\b|[{}]|\bat\s.+:\d+/i;

/** Never the technical text of an error: the sentence is kept only if a person can read it. */
export function humanError(message: string | null | undefined, fallback: string): string {
  const text = (message ?? '').trim();
  return text === '' || TECHNICAL.test(text) ? fallback : text;
}

interface ErrorMessageProps {
  /** What went wrong, as a sentence of the interface. */
  message: string;
  onRetry?: () => void;
  title?: string;
}

/** An error block announced at once, with « Réessayer » when trying again makes sense. */
export function ErrorMessage({ message, onRetry, title = 'Un instant' }: ErrorMessageProps) {
  return (
    <Callout role="alert" title={title}>
      <p>{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="tap-target text-indigo-mid -ml-1 px-1 font-semibold"
        >
          Réessayer
        </button>
      ) : null}
    </Callout>
  );
}
