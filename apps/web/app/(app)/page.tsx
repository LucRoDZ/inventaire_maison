import { redirect } from 'next/navigation';

/** The scanner is a full-screen route of its own; an old `/?lieu=2` link keeps its origin. */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['lieu', 'etagere']) {
    const value = params[key];
    if (typeof value === 'string') query.set(key, value);
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  redirect(`/scanner${suffix}`);
}
