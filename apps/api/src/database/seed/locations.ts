export interface ShelfSeed {
  name: string;
  kind: 'rack' | 'plain';
}

export interface LocationSeed {
  name: string;
  kind: 'pantry' | 'fridge' | 'freezer' | 'cellar';
  icon: string;
  shelves: readonly ShelfSeed[];
}

const plain = (name: string): ShelfSeed => ({ name, kind: 'plain' });
const rack = (name: string): ShelfSeed => ({ name, kind: 'rack' });

export const LOCATION_SEEDS: readonly LocationSeed[] = [
  {
    name: 'Garde-manger',
    kind: 'pantry',
    icon: 'warehouse',
    shelves: [plain('Étagère 1'), plain('Étagère 2'), plain('Étagère 3'), plain('Étagère 4')],
  },
  {
    name: 'Frigo',
    kind: 'fridge',
    icon: 'refrigerator',
    shelves: [
      plain('Étagère 1'),
      plain('Étagère 2'),
      plain('Étagère 3'),
      plain('Étagère 4'),
      plain('Bac à légumes 1'),
      plain('Bac à légumes 2'),
      plain('Balconnet'),
    ],
  },
  {
    name: 'Congélateur',
    kind: 'freezer',
    icon: 'snowflake',
    shelves: [plain('Tiroir 1'), plain('Tiroir 2'), plain('Tiroir 3')],
  },
  {
    name: 'Cave',
    kind: 'cellar',
    icon: 'wine',
    shelves: [rack('Rangée 1'), rack('Rangée 2'), rack('Rangée 3'), plain('Caisses et packs')],
  },
];
