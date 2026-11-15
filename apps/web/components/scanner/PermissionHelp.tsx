import { CameraOff } from 'lucide-react';
import { detectPlatform, type Platform } from '../../lib/platform';
import type { CameraErrorKind } from '../../lib/scanner/camera';
import { Button } from '../ui/Button';
import { Callout } from '../ui/Callout';

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
  /** Scrolls to or focuses the fallbacks (typed code, photo). */
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
    <div className="flex flex-col gap-3">
      <Callout role="alert" icon={CameraOff} title={TITLES[reason]}>
        {reason === 'denied' ? <p>{STEPS[platform]}</p> : null}
        {reason === 'absent' ? (
          <p>Cet appareil n’a pas de caméra que le navigateur peut utiliser.</p>
        ) : null}
        {reason === 'insecure' ? (
          <p>
            La caméra ne marche que sur une page sécurisée. Ouvrez l’application à son adresse en
            https.
          </p>
        ) : null}
        {reason === 'failed' ? (
          <p>Fermez les autres applications qui utilisent la caméra, puis réessayez.</p>
        ) : null}
      </Callout>
      <div className="flex flex-wrap gap-3">
        <Button onClick={onUseFallback}>Saisir le code à la main</Button>
        {reason !== 'insecure' ? (
          <Button variant="secondary" onClick={onRetry}>
            Réessayer
          </Button>
        ) : null}
      </div>
    </div>
  );
}
