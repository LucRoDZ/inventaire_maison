import { RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';

/** A new version of the app is installed and waiting. */
export function UpdateCallout({ onRefresh }: { onRefresh: () => void }) {
  return (
    <Callout role="status" icon={RefreshCw} title="Nouvelle version disponible">
      <p>Actualisez pour profiter des dernières améliorations.</p>
      <Button className="mt-2" onClick={onRefresh}>
        Actualiser
      </Button>
    </Callout>
  );
}
