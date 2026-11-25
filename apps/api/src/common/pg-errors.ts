/** SQLSTATE of a PostgreSQL error, whether drizzle wrapped it (`cause`) or not. */
export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export const isUniqueViolation = (error: unknown): boolean => pgErrorCode(error) === '23505';

/** Name of the constraint a PostgreSQL error is about, whether drizzle wrapped it or not. */
export function pgConstraint(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth++) {
    const constraint = (current as { constraint?: unknown }).constraint;
    if (typeof constraint === 'string') return constraint;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
