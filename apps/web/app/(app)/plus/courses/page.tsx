import { redirect } from 'next/navigation';

/** The shopping list no longer lives under Plus: old links land on the root tab. */
export default function OldShoppingListPage() {
  redirect('/courses');
}
