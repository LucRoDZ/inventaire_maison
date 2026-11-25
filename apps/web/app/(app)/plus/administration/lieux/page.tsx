import { redirect } from 'next/navigation';

/** Former address of the furniture screen, now open to every account under Plus. */
export default function LieuxPage() {
  redirect('/plus/meubles');
}
