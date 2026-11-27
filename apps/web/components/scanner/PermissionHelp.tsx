import { CameraOff } from 'lucide-react';
import { detectPlatform, type Platform } from '../../lib/platform';
import type { CameraErrorKind } from '../../lib/scanner/camera';
import { Button } from '../ui/Button';

const STEPS: Record<Platform, string> = {
  ios: 'Ouvrez Réglages, puis Safari, puis Caméra, choisissez « Demander » ou « Autoriser », et revenez ici en rechargeant la page.',
  android:
    'Touchez le cadenas à gauche de l’adresse, puis Autorisations, puis Caméra : Autoriser. Rechargez ensuite la page.',
  desktop:
    'Cliquez sur l’icône de caméra ou le cadenas dans la barre d’adresse, autorisez la caméra, puis rechargez la page.',
};

const TITLES: Record<CameraErrorKind, string> = {
  denied: 'Accès à la caméra refusé',
  absent: 'Aucune caméra disponible',
  insecure: 'HTTPS requis',
  failed: 'La caméra ne démarre pas',
};

interface PermissionHelpProps {
  reason: CameraErrorKind;
  /** Opens the typed-code entry. */
  onUseFallback: () => void;
  onRetry: () => void;
  /** Overridable for tests. */
  platform?: Platform;
}

export function PermissionHelp({
  reason,
  onUseFallback,
  onRetry,
  platform = detectPlatform(),
}: PermissionHelpProps) {
  return (
    <div className="bg-scanner-backdrop text-scanner-ink border-scanner-veil flex flex-col items-center gap-3 rounded-card border p-4 text-center">
      <div role="alert" className="flex flex-col items-center gap-2">
        <CameraOff size={32} aria-hidden="true" />
        <p className="text-card-title">{TITLES[reason]}</p>
        {reason === 'denied' ? <p className="text-small">{STEPS[platform]}</p> : null}
        {reason === 'absent' ? (
          <p className="text-small">
            Cet appareil n’a pas de caméra que le navigateur peut utiliser.
          </p>
        ) : null}
        {reason === 'insecure' ? (
          <p className="text-small">
            La caméra ne marche que sur une page sécurisée. Ouvrez l’application à son adresse en
            https.
          </p>
        ) : null}
        {reason === 'failed' ? (
          <p className="text-small">
            Fermez les autres applications qui utilisent la caméra, puis réessayez.
          </p>
        ) : null}
      </div>
      {reason !== 'insecure' ? <Button onClick={onRetry}>Réessayer</Button> : null}
      <button
        type="button"
        onClick={onUseFallback}
        className="tap-target text-scanner-ink font-semibold underline"
      >
        Saisir un code
      </button>
    </div>
  );
}
