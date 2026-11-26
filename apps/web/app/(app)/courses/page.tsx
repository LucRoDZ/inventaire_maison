'use client';

import { ShoppingList } from '../../../components/shopping/ShoppingList';
import { Screen } from '../../../components/ui/Screen';

/** Shopping list of the household (root tab). */
export default function CoursesPage() {
  return (
    <Screen title="Courses" zoneLabel="Liste de courses" memoryKey="courses">
      <ShoppingList />
    </Screen>
  );
}
